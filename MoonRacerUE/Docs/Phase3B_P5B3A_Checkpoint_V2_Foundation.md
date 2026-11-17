# Phase 3B P5B-3A — checkpoint v2 and migration foundation (INFRASTRUCTURE ONLY)

**The proposed 12-state sequence is not active.** The 11-state v1 machine, `FMRProgressRecord`, `FMRProgressStore`, `CurrentProgressVersion = 1`, the default slots and all gameplay are unchanged. Nothing in the running game reads or writes a v2 checkpoint. Everything here is exercised by automation on dedicated test slots.
Companion docs: `Phase3B_P5B2_Onboarding_Redesign_Proposal.md` (the approved design this implements part of), `Phase3B_P5B3A_Shipping_Exclusion_Followup.md`.

## Files (`Source/MoonRacer/Onboarding/` unless noted)
| File | Purpose |
|---|---|
| `MRCheckpointV2.h/.cpp` | v2 record + enums, validation, inactive v2 state names, pure `MigrateV1ToV2`, `MigrateSaveObject`, `ReconcileSaves` |
| `MRCheckpointV2Store.h/.cpp` | read-only `Load`, `Save` (A/B, backups, atomic, verified), evidence gathering |
| `MRProgressSaveGame.h/.cpp` | **additive only:** `ReadSlotV1`, `ReadSlotObject` (read-only helpers); no behaviour change |
| `Tests/MRCheckpointV2Tests.cpp` | 12 tests implementing the P5B-2 migration matrix |

## v2 schema (`FMRCheckpointV2`)
- **Launch identity (separate from the scan):** `LocalProfileId`, `IdentityMode`, `OpaqueSubjectId` (always empty), `bAccessResolved`, `bIdentityResolved`, `bAvatarConfirmed`, `AvatarRef`.
- **Station / tavern:** `bStationEntered`, `bTavernReached`, `bTavianEncounterStarted`, `bTavianEncounterDone`, `bDepartureReached`.
- **Physical in-world Passport scan + departure authorization (own fields):** `PassportScanResult` {NotScanned, OfflineGuestSimulated, LinkedVerified, LegacyGrandfathered}, `TravelAuthorization` {NotAuthorized, Authorized, LegacyGrandfathered}.
- **Transit / arrival:** `bTransitSeen`, `bTransitSkippedUnavailable`, `bCoreArrived`.
- **Per-location safe spawns:** `SafeSpawns[] {LocationId, SpawnPointId}` (one per location; replaces the single v1 spawn).
- **Completion / legacy:** `bOnboardingCompleted`, `bLegacyCompleted` (explicit), `LegacyOrigin` {None, V1Mapped, V1Completed, V1Fallback}, `LegacyV1` (verbatim v1 snapshot, audit only), `CurrentState`, `Content` versions (P5A stamp).
- **v2 state names** (`EMROnboardingStateV2`, 12 states, INACTIVE data): START, ACCESS_CHECK, IDENTITY_CHECK, AVATAR_CHECK, STATION_ENTRY, TAVERN_APPROACH, TAVIAN_ENCOUNTER, DEPARTURE_APPROACH, PASSPORT_SCAN, TRANSIT_TO_CORE, CORE_ARRIVAL, FREE_EXPLORE; `FirstIncompleteState()` is a pure function no machine uses yet.
- **Validation:** strict chain ordering; scan requires reaching the departure terminal; authorization requires a recorded scan; transit requires authorization; arrival requires a transit outcome; completion requires the full chain **or** the explicit legacy marker; grandfathered values only on a legacy-completed record, which may not claim any station/transit/arrival step; legacy-*mapped* records may carry the tavern/encounter flags ahead of station entry (they resume at STATION_ENTRY) but nothing further; the resume pointer never runs ahead.
- **On disk:** `UMRProgressSaveGameV2` derives from `UMRProgressSaveGame` (`SaveVersion = 2`, own `Checksum2`) inside the same `MRPG` envelope. Because it is-a v1 save with a higher version, the **v1 store in this build treats it as a newer version**: it never loads it as v1 and refuses to overwrite it (tested).

## Migration rules (`MigrateV1ToV2`, pure, in memory, deterministic)
Input is never mutated; no file is read or written; a damaged profile id gets a deterministic derived id. Carried **for certain**: access, identity (v1 `bPassportChecked` → `bIdentityResolved`), avatar (+ref) unless the avatar save is checked and contradicts it, profile id, content versions. The v1 record is always kept in `LegacyV1`.
| Case | v1 input | v2 result |
|---|---|---|
| A | before the avatar is confirmed | carry identity facts; resume at the first incomplete v2 state |
| B | avatar done; arrival cinematic pending/seen | resume STATION_ENTRY; the v1 arrival outcome is **not** the v2 transit |
| C | CORE_SPAWN done, no objective/dialogue | resume STATION_ENTRY; the v1 Core safe spawn stays in `LegacyV1` only |
| D1 | Tavian flags + the **approved** Tavian dialogue id completed in the narrative save | carry tavern/encounter flags; resume STATION_ENTRY then straight on; nothing replayed |
| D2 | Tavian flags without usable evidence (no narrative save, no approved ids, dialogue not completed) **or an interrupted/not-completed v1 dialogue** | not carried; the conversation restarts (D-7); one-time effects already applied are not repeated |
| E | `bOnboardingCompleted` | **explicit legacy completion**: FREE_EXPLORE, `LegacyGrandfathered` scan/authorization markers, no station/transit/arrival claimed |
| F | unknown state name, failed v1 `Validate()`, non-offline identity data | **safe fallback**: only verified identity/avatar facts, `V1Fallback`, never completed, always strictly earlier than the truth |
A safe spawn is assigned only for case E and only if the v1 spawn's `MapId` equals an **approved** Core location id supplied through `FMRMigrationMap` (empty today, so none is ever assigned). Approved Tavian dialogue/effect ids come from the same map. **No canonical id is hard-coded.**
Never touched or inferred: mission status, completed dialogues, the one-time-effect ledger, scans, transits, arrivals. `MigrateSaveObject`: ≤1 migrates (v0 through the existing chain, on a copy), 2 passes through unchanged (idempotent), **>2 is rejected with a reason**, null is rejected.

## Persistence (`FMRCheckpointV2Store`)
- **`Load` is read-only.** v2 slots load natively; a v1/v0 slot is migrated in memory; newer-version and corrupt slots are ignored and preserved; the newest valid generation wins (v2 preferred on a tie); no valid slot → a fresh v2 record in memory. It never writes and never makes a backup.
- **`Save`** (A/B like v1): writes the alternate slot via temp file + atomic replace + read-back verification; refuses inconsistent records, newer-version targets, and **the default player slot** (v2 is not activated for it).
- **Backups:** before the **first** v2 write both existing non-v2 slot files (v1, v0, and corrupt ones as evidence) are *copied* to `<slot>.sav.v1.bak`; a different file already at that name is **never overwritten** (a numbered `.v1.N.bak` is used); an identical backup is reused (no duplicates); a brand-new player needs none; later writes back up a non-v2 file only if they are about to replace it. If a backup fails, nothing is written.
- **Interruption:** a crash before the atomic replace leaves both real slot files untouched (a stray `.tmp` is harmless); a torn write into the target slot leaves the latest valid slot intact and `Load` recovers it; the torn file is preserved and backed up before the next write.
- Test hooks simulate failure after the backups, after the temp write, and as a torn target write.

## Cross-save consistency (`ReconcileSaves`, read-only)
Compares the onboarding record with the avatar save, the narrative save and the one-time ledger using evidence only (`FMRSaveEvidence`; unchecked/unavailable = unknown, never false). It reports, with the evidence attached and **without modifying anything**: `AVATAR_MISSING`, `AVATAR_REF_MISMATCH`, `AVATAR_REVISION_DIFFERS`, `COMPLETED_WITHOUT_AVATAR`, `NARRATIVE_UNAVAILABLE`, `TAVIAN_DONE_WITHOUT_EVIDENCE`, `NARRATIVE_TAVIAN_DONE_ONB_NOT`, `INTERRUPTED_ENCOUNTER_EFFECTS`, `LEDGER_MISSING_FOR_COMPLETED`, `MISSION_BEFORE_ENCOUNTER`, `EVIDENCE_IDS_UNAPPROVED`, `LEGACY_GRANDFATHERED_NO_SCAN`, and `V2_STRUCTURAL` (a conflict). It never invents a completed mission, dialogue, scan or arrival, never auto-advances, never replays, never resets. `GatherSaveEvidence` reads the real avatar subsystem and narrative store (verified read-only by byte comparison).

## Tests (`MoonRacer.CheckpointV2.*`, 12) — the P5B-2 matrix
Schema/separation/round-trip (M-schema); every legacy state with invariants (M02–M12); completed players with every mission status (M14/M15); Tavian evidence, no evidence, unavailable narrative, interrupted dialogue (M16/M17/M30); an exhaustive fuzz of **every** flag combination × 12 state names × quest statuses × avatar/evidence variants (≈150k migrations) asserting the invariants (valid output, never claims station/scan/transit/arrival outside E, tavern flags only with evidence, snapshot preserved, input unmutated, deterministic, no safe spawn without an approved id) (M25/M28); version wrapper incl. v0, v2 pass-through and rejected v3 (M20/M24); read-only loads, slot selection, corrupt/mixed slots (M01/M20–M23); backups (M26/M27); interrupted writes; newer versions and the v1-store downgrade protection (M24/M31); cross-save reconciliation against real dedicated stores incl. a corrupt narrative save (M29); default-slot protection (M32).

## Remaining design decisions
D-9…D-17 and D-6′ from the proposal are still open. Specific to this work: approved ids for `FMRMigrationMap` (Core location, Tavian dialogue/effect ids) need canon; the policy for "a v1 slot with a higher generation than the v2 slot" (currently: the higher generation wins and is migrated; the v2 file is left untouched); whether onboarding should auto-advance when the narrative save shows the Tavian conversation done (currently: report only, D-14); and activation conditions for the default slot.
