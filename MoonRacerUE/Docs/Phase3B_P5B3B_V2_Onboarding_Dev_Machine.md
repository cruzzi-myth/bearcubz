# Phase 3B — P5B-3B: development-only v2 onboarding state machine

Status: implemented and tested behind an explicit development flag. **The 11-state v1 system is still the default and is unchanged.** No canonical content was integrated; everything is `TEST_FIXTURE_NONCANON`. Nothing was committed, merged or deployed.

## 1. What exists

| File (`Source/MoonRacer/…`) | Role |
|---|---|
| `Onboarding/MROnboardingV2Machine.h/.cpp` | `UMROnboardingMachineV2` (the 12-state machine), dev-flag gate `MROnboardingV2Dev::*`, `MRNarrative::BindOnboardingV2` |
| `Onboarding/MRV2Services.h/.cpp` | additive `IMRPassportScanService` + the dev scan fixture, the departure-gate evaluator `MRDeparture::Evaluate`, fixture world / spawn / cinematic / identity services, `FMRV2FixtureContent` |
| `Onboarding/MROnboardingV2Subsystem.h/.cpp` | `UMROnboardingV2Subsystem`: exists **only** when the flag is present and never in Shipping; spawns the world driver on `-MROnbV2Test=` |
| `Dev/MROnboardingV2TestDriver.h/.cpp` | world process driver (graybox, real pawn, real avatar-saved event, real interactor) |
| `Tests/MROnboardingV2MachineTests.cpp` | 14 automation tests, `MoonRacer.OnboardingV2.*` |
| `Onboarding/MRCheckpointV2Store.h/.cpp` | **changed**: mixed v1/v2 policy (see §7) |
| `Tests/MRCheckpointV2Tests.cpp` | one assertion updated for the new mixed policy |

Unchanged (verified by timestamp): `MROnboardingTypes.*`, `MROnboardingSubsystem.*`, `MRProgressSaveGame.*`, `DA_MR_OnboardingFlow.uasset`, `Config/DefaultGame.ini`, the default map and game mode, the Asset Bible, the Core manifests.

## 2. The state machine

Spine (its own enum, its own table; nothing from v1 is reused internally):

`START → ACCESS_CHECK → IDENTITY_CHECK → AVATAR_CHECK → STATION_ENTRY → TAVERN_APPROACH → TAVIAN_ENCOUNTER → DEPARTURE_APPROACH → PASSPORT_SCAN → TRANSIT_TO_CORE → CORE_ARRIVAL → FREE_EXPLORE`

Every state has exactly **one** exit event; any other event is rejected without changing state, the record or the checkpoint. `FREE_EXPLORE` is terminal.

| State | Exit event | What the machine does on entry | Recorded at the exit transition |
|---|---|---|---|
| START | SessionStarted / ReturningPlayer | – | (returning players: nothing is written) |
| ACCESS_CHECK | AccessResolved | resolves (re-run on every launch) | `bAccessResolved` |
| IDENTITY_CHECK | IdentityResolved | launch-time identity status; non-offline blocks until `ContinueOffline()` | `bIdentityResolved` |
| AVATAR_CHECK | AvatarConfirmed (+ avatar ref) | valid avatar → confirm; otherwise open the creator and wait for the avatar-saved event | `bAvatarConfirmed`, `AvatarRef` |
| STATION_ENTRY | StationEntered (+ confirmed spawn) | load location → spawn | `bStationEntered`, station safe spawn |
| TAVERN_APPROACH | TavernReached (+ spawn) | load/spawn tavern location → objective | `bTavernReached`, tavern safe spawn |
| TAVIAN_ENCOUNTER | EncounterDone | NPC + dialogue availability → **started marker checkpoint** → dialogue | `bTavianEncounterDone` |
| DEPARTURE_APPROACH | DepartureReached (+ spawn) | load/spawn departure location → objective | `bDepartureReached`, departure safe spawn |
| PASSPORT_SCAN | PassportScanned (OfflineGuestSimulated only) | **departure gate**, then the scan service | `PassportScanResult`, `TravelAuthorization=Authorized` |
| TRANSIT_TO_CORE | TransitFinished | gate again, authorization, destination available, cinematic | `bTransitSeen` or `bTransitSkippedUnavailable` |
| CORE_ARRIVAL | CoreArrived (+ confirmed spawn) | load Core → spawn | `bCoreArrived`, Core safe spawn, `bOnboardingCompleted` |
| FREE_EXPLORE | – | – | – |

Resume: after loading, access → identity → avatar are always re-run (like v1); the machine then jumps to the **first incomplete state** of the record (`MROnboardingV2::FirstIncompleteState`). It never moves backwards. Blocked states never advance or checkpoint; `Retry()` re-enters the state.

Checkpoints are written **only** at accepted transitions plus the encounter-started marker. A checkpoint failure is counted and reported; progress stays in memory and the next boundary retries.

## 3. Feature-flag isolation

* Launch flag: `-MROnbV2Dev`. Without it `MROnboardingV2Dev::ActiveFlow()` is `V1`, `Begin()` is refused (nothing loaded, nothing written), and `UMROnboardingV2Subsystem` is not even created (a no-flag world run printed **zero** `MRONBV2` lines).
* Shipping: `IsShippingBuild()` is a compile-time `UE_BUILD_SHIPPING`; in Shipping `IsFlagPresent()` is compiled to `false` and the test overrides are ignored. The Shipping refusal is exercised by simulating the Shipping state (`SetSimulateShippingForTest`).
* Default slot: `Begin()` refuses `MRProgress_Local`; `FMRCheckpointV2Store::Save` refuses it independently.
* Existing profiles are never activated: the machine is only begun by an explicit caller (tests / the dev driver). Nothing in the game mode, default map or v1 flow references it. The default map and game mode are unchanged.
* The v1 store sees a v2 file as a newer version: it never loads it and never overwrites it (tested).

## 4. Fixture environments and interactions

Four logical test locations, all `TEST_FIXTURE_NONCANON_V2_*`: STATION, TAVERN_APPROACH, DEPARTURE_TERMINAL, CORE_ARRIVAL (each with one default spawn id). They are **not** canonical geography and not permanent ids; `FMRV2FixtureContent` is the only place they appear.

World driver graybox: four 30×30 m primitive slabs, labelled `TEST_FIXTURE_NONCANON GRAYBOX: …`, at fixed offsets high above the dev map, plus two `AMRDevNpcActor` stand-ins on the tavern slab. The spawn service teleports the real pawn to the slab anchor of the confirmed spawn.

Narrative runtime (the real `UMRNarrativeSubsystem` and fixture bundle `TEST_FIXTURE_NPC_ALPHA/BETA`, `TEST_FIXTURE_MISSION`):

* NPC interaction + encounter: `BindOnboardingV2` points the machine's dialogue seam at the real dialogue runtime and its interaction seam at the narrative objective tracker.
* **Mission offer / acceptance**: produced by the fixture dialogue's own effects. Accepting leaves the mission `Active`; the encounter completing never completes the mission.
* **Optional NPC**: `InteractOptional(npc)` starts a conversation without touching onboarding state, the record or the checkpoint (asserted). The encounter NPC is refused as "optional" until its encounter is done.
* **Objective tracking**: mission objectives advance through `NotifyGameEvent`; the tracker follows them.
* **Interrupted dialogue**: cancelling (or quitting) mid-encounter leaves `started && !done`; a retry or relaunch restarts the conversation from its first node (D-7).
* **One-time effects**: protected by the narrative ledger; verified across a cancel, a retry and a full process relaunch (applied once, suppressed afterwards).

## 5. Passport scan (simulation only)

* New additive interface `IMRPassportScanService::Scan(Done)`; separate from the launch-time `IMRPassportService`.
* The only implementation is `UMRDevPassportScanService`; modes: `OfflineGuestSimulated` (default), `Refuse`, `Unavailable`, `ReturnLinkedVerified` (a result the machine must refuse), `Hold` (asynchronous; supports cancel for interruption tests).
* Only `OfflineGuestSimulated` is accepted by the machine. It is stored in `PassportScanResult` and sets `TravelAuthorization=Authorized`. It never changes `IdentityMode` (stays `OfflineGuest`), never sets `OpaqueSubjectId`, and `UMRDevPassportScanService::ClaimsAuthentication()` is `false`.
* Refused / unavailable / cancelled scans block the state (retryable) and record nothing. An interrupted scan leaves `PASSPORT_SCAN` as the first incomplete state, so a relaunch scans again.
* No Passport API, token, Supabase or network code exists anywhere in this path.

## 6. Departure gate, transit and arrival

**Gate.** `MRDeparture::Evaluate(config, narrative evidence)` is a pure evaluator. Conditions are synthetic (`FactSet`, `DialogueCompleted`, `ObjectiveCompleted`, `MissionAccepted`, `MissionCompleted`). `MissionAccepted` is true for `Active` or `Completed`; `MissionCompleted` only for `Completed`, so acceptance alone never satisfies a completion condition. The gate is **closed** (unresolved) when the config is unresolved, when an empty list is not explicitly "no requirements by design", or when the narrative state is unavailable. The canonical artifact mission is not hard-coded; the default `FMRV2FixtureContent` gate is unresolved. The gate is evaluated at the start of PASSPORT_SCAN (the terminal does not scan until departure is allowed) and again at the start of TRANSIT_TO_CORE.

**Transit.** Requires a recorded authorization and an available destination (otherwise it blocks before anything plays or is recorded). Outcomes: `Played` and `SkippedByPlayer` set `bTransitSeen`; `SkippedUnavailable` sets `bTransitSkippedUnavailable` and is never recorded as seen. Nothing is recorded until the cinematic reports, so an interrupted transit resumes at TRANSIT_TO_CORE with the authorization intact and no earlier state replayed.

**Core arrival.** A location counts as reached only after it **loaded and a spawn was confirmed** (`CurrentLocation` is set at that moment). CORE_ARRIVAL only accepts `CoreArrived` with a confirmed spawn id. While the load or the spawn is pending the record is not arrived/completed and **no checkpoint is written** (asserted with held world/spawn services). Missing destination → blocked, retryable; relaunch mid-load resumes at CORE_ARRIVAL. A failing saved safe spawn falls back to the location's default spawn once; if that also fails the state blocks.

## 7. Saves, migration and cross-save safety

* v2 checkpoints use the P5B-3A store (A/B slots, temp + atomic replace + read-back, non-overwriting backups before the first v2 write). The machine adds per-location safe spawns at the state boundaries.
* Legacy v1 slots are migrated **in memory** (the P5B-3A pure function) when the machine begins; nothing is written until the first real transition, which then backs up the v1 files first. Legacy-completed players go straight to FREE_EXPLORE (grandfathered, never asked to scan) and **nothing is written** for them.
* **Mixed generations (policy change).** P5B-3A used "highest generation wins". P5B-3B: when both slots are valid and one is v2 and the other v1, **v2 is used even if the v1 generation is higher**; if the v1 generation is higher it is flagged as a conflict (`bMixedConflict`, a CONFLICT note naming both generations and where each would resume, the other record migrated in memory only for the report). `Load` writes nothing; the first save then replaces the v1 slot only after a byte-for-byte backup, and the v2 slot is untouched. This is the only store behavior change.
* **Cross-save reconciliation** runs at `Begin()` against live evidence. Narrative evidence that the Tavian conversation is done while onboarding has not recorded it is **reported, never auto-advanced**: the encounter is still played (the dialogue's returning branch runs) and the one-time ledger is not replayed.
* Corrupt checkpoint: recovery from the older valid slot; the corrupt file is backed up before being replaced.
* Default slots never touched (tests assert no default progress files exist).

## 8. Tests

Automation (`UnrealEditor-Cmd … -ExecCmds="Automation RunTests MoonRacer.OnboardingV2; Quit" -unattended -nullrhi -nosplash -nosound`) — 14 tests, dedicated slots `MRProgress_V2MachineTest`, `MRNarrative_V2MachineTest`, `MRAvatar_V2MachineTest`:

| Test | Covers |
|---|---|
| Isolation.FlagShippingAndDefaultSlot | no flag → V1, Shipping refusal, default-slot refusal, subsystem gate, v1 constants |
| StateMachine.EveryTransitionAndRejection | every transition; every non-exit event rejected at every state; payload requirements |
| StateMachine.EveryStateBoundaryResume | resume after each of the 11 boundaries, re-checks, no replay |
| StateMachine.FullFlowAndReturningPlayer | service-driven flow, 12 writes, 4 safe spawns, returning player writes nothing |
| Departure.GateEvaluator / GateBlocksTheMachineSafely | every condition type, accepted vs completed, unresolved/unavailable blocking, retry |
| Passport.ScanRefusalRetryAndSimulation | refusal, unavailable, linked-result refusal, interrupted scan + relaunch, offline simulation |
| Transit.InterruptionOutcomesAndMissingDestination | Played / SkippedByPlayer / SkippedUnavailable, missing destination, interrupted transit |
| Arrival.NoMidLoadCompletionMissingLocationsAndSafeSpawns | held load/spawn, missing Core/station, saved-spawn fallback, stuck-player recovery |
| Narrative.EncounterInterruptionOneTimeEffectsAndOptionalNpcs | optional NPC, interruption, retry, relaunch mid-dialogue, one-time effects |
| Narrative.MissionAcceptanceVersusCompletionAndObjectives | acceptance ≠ completion at the gate, objective tracking, decline path |
| Persistence.BoundaryWritesCorruptionAndInterruptedWrites | corrupt newest slot, torn write, failing writes |
| Migration.LegacySlotsIntoTheMachine | all 11 v1 states into the machine, backups, evidence-backed carry, corrupt + valid |
| Migration.MixedGenerationsAndCrossSaveConflicts | v1 higher than v2, older v1, narrative-vs-onboarding disagreement, v1 downgrade protection |

World process (`-game`, dedicated slots, literal arguments):

```
UnrealEditor /…/MoonRacer.uproject /Game/MoonRacer/Maps/L_MR_OnboardingDev -game -windowed -ResX=800 -ResY=600 -nosound -UseFixedTimeStep -FPS=60 \
  -MROnbV2Dev -MROnbV2Test=partial -MRProgressSlot=MRProgress_V2Dev -MRAvatarSlot=MRAvatar_V2Dev -MRNarrativeSlot=MRNarrative_V2Dev -MRProgressFresh -MRAvatarFresh -MRNarrativeFresh
(then …-MROnbV2Test=resume, then …-MROnbV2Test=returning, same slots, no *Fresh flags)
```

## 9. Out of scope / not done

No canonical content, locations, NPCs, missions, cinematics or environments; no Passport/Supabase/network; no change to v1, the default map/game mode, the website, SIGNAL PORTAL, voting or events; no packaging change (the shipping-exclusion notes are in `Phase3B_P5B3A_Shipping_Exclusion_Followup.md`, with a P5B-3B addendum).
