# Moon Racer — Phase 3B Architecture: Player Onboarding

**Status:** PROPOSAL for owner approval. Nothing in this document is implemented. No gameplay code, content, or production file was changed to produce it.
**Date:** 2026-11-16 · **Engine:** UE 5.8.4 · **Project:** `MoonRacerUE/` (authoritative)
**Scope:** onboarding only — START → … → FREE_EXPLORE. Not Phase 3C/3D.

## 0. How to read this

- **BLOCKED** = the design cannot be finalised or built because canonical information is missing (§7). I do not guess these.
- **PLACEHOLDER** = a clearly labelled stand-in so the machinery can be built and tested without inventing canon. A placeholder is never shown to players as real lore and never replaces canonical art, names or dialogue.
- **FREE** = can be built now, independent of canon.
- Content IDs in this document written as `<…_TBD>` are intentionally unresolved.

## 1. Facts this design relies on (verified, not assumed)

| Fact | Source |
|---|---|
| Avatar appearance is saved locally via `UMRAvatarSaveSubsystem` (slot `MRAvatar_Local`, versioned, migration + sanitising). `AvatarId` + `Revision` identify an avatar. | Phase 3A code |
| `AMRPlayerCharacter` can load and apply the saved avatar at BeginPlay (`bLoadSavedAvatarOnBeginPlay`). | Phase 3A code |
| The website already has a **server-side** `onboarding_stage` with values `passport_created → species_selection → avatar_customization → avatar_complete → core_arrival → active_player`. `core_arrival` and `active_player` are **reserved and not reachable by any RPC yet**. | `network-app/src/types/player.ts`, migration `…avatar_phase2c…` |
| Species is **permanently locked server-side** once confirmed (DB constraints + `confirm_avatar_species`). The Unreal creator currently lets a local player pick any of the six species freely. | same |
| Web identity is read through `get_my_player_state()` (RLS-scoped) and Passport linking uses `link_my_passport` / `claim_passport`. | `network-app/src/services/playerState.ts` |
| Core manifest v1.2.0 and v2.0 are **not available** to me; no Tavian Rell record, no confirmed tavern name or ID, no bartender identity, no first-mission definition exist in any file I can read. | Packet 00 audit |

**Consequence:** the web Passport remains the source of identity (per the master instructions). Until an approved server contract exists, the Unreal client may only keep **local** progress and must never write `onboarding_stage`.

## 2. Design principles

1. **Explicit, resumable state machine.** Every state has a stable ID, entry conditions, a completion flag, a safe resume point and a test.
2. **Progress ≠ appearance ≠ identity.** Three separate stores: avatar appearance (exists), onboarding progress (new, local), Passport/identity (website, untouched).
3. **Checkpoints only on completion edges.** Never mid-animation or mid-line; resume is always to the start of the interrupted state.
4. **Honest modes.** An offline prototype is never presented as a logged-in online account.
5. **Fail safe, never fabricate.** Missing content blocks the flow with a diagnostic; it is not replaced by invented lore.
6. **Data-driven flow.** Transitions live in a data asset, so adding/reordering states after canon arrives does not require rewriting logic.
7. **No duplicate Passport identities.** The client never creates a Passport; it hands off to the website.

## 3. Onboarding state machine

### 3.1 Diagram

```mermaid
stateDiagram-v2
    [*] --> START
    START --> ACCESS_CHECK
    ACCESS_CHECK --> PASSPORT_CHECK : mode resolved
    ACCESS_CHECK --> ACCESS_CHECK : retry (recoverable)
    PASSPORT_CHECK --> AVATAR_CHECK : identity state recorded
    PASSPORT_CHECK --> PASSPORT_HANDOFF : online + no Passport
    PASSPORT_HANDOFF --> PASSPORT_CHECK : user returns, re-check
    AVATAR_CHECK --> AVATAR_CHECK : Avatar Creator open
    AVATAR_CHECK --> ARRIVAL_CINEMATIC : valid avatar confirmed
    ARRIVAL_CINEMATIC --> CORE_SPAWN : played or skipped
    CORE_SPAWN --> FIRST_OBJECTIVE : pawn spawned, avatar applied
    FIRST_OBJECTIVE --> TAVIAN_DIALOGUE : reached tavern trigger
    TAVIAN_DIALOGUE --> BARTENDER_HANDOFF : dialogue end node
    BARTENDER_HANDOFF --> FIRST_MISSION : bartender interaction done
    FIRST_MISSION --> FREE_EXPLORE : mission terminal condition (see D-6)
    FREE_EXPLORE --> [*]
    note right of PASSPORT_HANDOFF : support state; not in the 11-state spine
```

`PASSPORT_HANDOFF` is a **support state** I added for the online case (send the player to the website to create/link a Passport, then re-check). It is not in your 11-state spine and is only needed once online identity exists; it can be omitted in the offline-first build.

### 3.2 Transition table

`Done flag` is the persisted completion marker. `Checkpoint` = a write of the progress save happens on the *exit* edge.

| # | State ID | Purpose | Entry condition | Work performed | Exit condition (→ next) | Done flag | Checkpoint on exit | Canon dependency |
|---|---|---|---|---|---|---|---|---|
| 1 | `START` | Boot into the onboarding router. | Game launch / "Continue" / "New". | Load progress save; run **resume router** (§3.4). | Router chose a target state. | — | No | None — **FREE** |
| 2 | `ACCESS_CHECK` | Decide *whether and how* play is allowed. | From START. | Resolve **Mode**: `OfflinePrototype` (only mode implemented in v1) or `Online` (placeholder). Verify local prerequisites (content registry present, save slot writable, engine/build version). | Mode resolved and recorded. | `AccessResolved` | Yes (mode) | None — **FREE** (online variant PLACEHOLDER) |
| 3 | `PASSPORT_CHECK` | Establish identity state without creating identities. | Access resolved. | Offline: record `IdentityState = OfflineGuest` (no account claims). Online (future): ask `IMRPassportProvider` → `Linked / NoPassport / AuthRequired / Error`. | Identity state recorded. `NoPassport` → `PASSPORT_HANDOFF` (website). | `PassportChecked` | Yes (identity *state*, not identity data) | Passport contract **BLOCKED** (online only); offline **FREE** |
| 4 | `AVATAR_CHECK` | Ensure a valid confirmed avatar exists. | Passport checked. | Load avatar save through `UMRAvatarSaveSubsystem`; validate against catalog. Valid → pass. Missing/invalid → open Avatar Creator and wait for **Confirm**. | A valid confirmed avatar exists (`AvatarId`+`Revision` recorded). | `AvatarConfirmed` | Yes (avatar *reference*) | Species-lock policy for linked accounts **BLOCKED** (D-2); creator itself **FREE** |
| 5 | `ARRIVAL_CINEMATIC` | Short arrival sequence into Sector 00 / The Core. | Avatar confirmed. | If `ArrivalSeen` → **skip**. Else `IMRCinematicService` plays arrival (skippable). | Finished or skipped. | `ArrivalSeen` | Yes | Content **BLOCKED** (no cinematic, no approved Sector 00/Core arrival text). Skip/flag logic **FREE**. |
| 6 | `CORE_SPAWN` | Put the avatar in the first Core space. | Arrival seen/skipped. | Load the Core slice level; spawn pawn at `LastSafeSpawn` (or the default arrival spawn); apply saved avatar; verify controls. | Level ready AND pawn possessed AND avatar applied. | `CoreSpawned` | Yes (`LastSafeSpawn`) | Core world content + location IDs **BLOCKED**; spawn/safe-spawn machinery **FREE** with a dev graybox |
| 7 | `FIRST_OBJECTIVE` | Give the player a first goal toward the tavern. | Core spawned. | Show objective (HUD), enable the destination trigger. | Player enters the destination trigger. | `FirstObjectiveDone` | Yes | Objective text + tavern identity/ID/name **BLOCKED** (B-02) |
| 8 | `TAVIAN_DIALOGUE` | First conversation with Tavian Rell. | Objective done. | Interact → deterministic authored dialogue graph → end node. | Dialogue end node reached. | `TavianIntroduced` | Yes | Tavian Rell record + dialogue **BLOCKED** (B-03). Dialogue *engine* **FREE** with test fixtures. |
| 9 | `BARTENDER_HANDOFF` | Tavian directs player to the bartender. | Tavian introduced. | Objective updates; bartender interaction. | Bartender interaction completed. | `BartenderHandoff` | Yes | Bartender identity + dialogue **BLOCKED** (B-04). I will not assume the `MIQ-3LLE_NEBULA_LOUNGE_BARTENDER` art file is the bartender. |
| 10 | `FIRST_MISSION` | Offer and track the first small objective. | Handoff done. | `IMRQuestService`: Offered → Active → (Completed). Journal/reward update. | See **D-6** (accept vs. complete). | `FirstQuestStatus` | Yes (each status change) | Mission definition + reward **BLOCKED** (B-05). Quest *state machinery* **FREE**. |
| 11 | `FREE_EXPLORE` | Normal play. | Mission terminal condition met. | Persist `OnboardingCompleted`; replays skip all onboarding states. | — | `OnboardingCompleted` | Yes | None beyond the above |

### 3.3 Failure handling (per state)

| State | Failure | Handling |
|---|---|---|
| ACCESS_CHECK | Registry/catalog missing, save slot unwritable | Recoverable: show diagnostic, offer Retry. Persistent failure → stay; never proceed with partial state. |
| PASSPORT_CHECK | Network/auth failure (online) | Offer **Continue Offline** (clearly labelled "not signed in") or Retry. Never silently downgrade. |
| PASSPORT_CHECK | No Passport | Hand off to website registration; never create one in Unreal. |
| AVATAR_CHECK | Avatar save corrupt/obsolete | Existing loader sanitises or falls back to default; if no valid avatar, open the creator. Progress is kept. |
| AVATAR_CHECK | Species conflicts with server lock (future) | **BLOCKED** on D-2; default proposal: server value wins and the creator hides the species step. |
| ARRIVAL_CINEMATIC | Asset missing/fails | Skip with a logged warning; set `ArrivalSeen` only if the player actually passed the state (not on failure) — see below. |
| CORE_SPAWN | Level fails to load / spawn blocked | Retry once; then fall back to the *previous* safe spawn; then show a blocking diagnostic. Never spawn the avatar in void. |
| CORE_SPAWN | Avatar apply fails | Existing rollback applies the default avatar; log and continue. |
| FIRST_OBJECTIVE … FIRST_MISSION | Player stuck / soft-locked | **Stuck-player recovery:** "Return to safe spawn" (pause menu) always teleports to `LastSafeSpawn`; plus a dev command to jump to a checkpoint. |
| Any | Save write fails | Keep the in-memory state, retry on the next edge, surface a non-blocking warning. Never discard progress silently. |
| Any | Unknown/newer save version | Do not overwrite. Back it up, start from START, tell the player. |

For `ARRIVAL_CINEMATIC`: a failed cinematic is **skipped for this session** but `ArrivalSeen` is *not* set, so the player gets it once the asset exists.

### 3.4 Resume behaviour

`START` runs a **resume router**:

1. Load progress (§4). None → new player → `ACCESS_CHECK`.
2. `OnboardingCompleted` → go straight to `FREE_EXPLORE`; skip everything (returning player).
3. Otherwise resume at the **first state whose done flag is false**, with these rules:
   - Re-validate prerequisites rather than trusting flags: e.g. if `AvatarConfirmed` is set but the avatar save is missing/invalid, resume at `AVATAR_CHECK`.
   - `ARRIVAL_CINEMATIC` is skipped if `ArrivalSeen`.
   - `CORE_SPAWN` always re-runs (a level must be loaded), but uses `LastSafeSpawn`.
   - `TAVIAN_DIALOGUE` / `BARTENDER_HANDOFF` resume at the **start of the dialogue** (no mid-conversation resume in v1).
   - `FIRST_MISSION` resumes in the saved `FirstQuestStatus`.
4. Identity mode is re-resolved each launch; an offline save is never promoted to an online identity automatically.

### 3.5 Checkpoint boundaries

Checkpoints are written **only when a state completes** (its done flag flips) and at a few explicit moments:

`AccessResolved` · `PassportChecked` · `AvatarConfirmed` · `ArrivalSeen` · `CoreSpawned (+LastSafeSpawn)` · `FirstObjectiveDone` · `TavianIntroduced` · `BartenderHandoff` · `FirstQuestStatus` change · `OnboardingCompleted`. Also `LastSafeSpawn` updates when the player crosses a designated safe-zone volume (post-spawn).

## 4. Checkpoint persistence design

### 4.1 Separation

| Store | Class / slot | Owner | Contents |
|---|---|---|---|
| Avatar appearance | `UMRAvatarSaveGame` / `MRAvatar_Local` | Phase 3A (exists) | Appearance only |
| **Onboarding progress** | **`UMRProgressSaveGame` / `MRProgress_Local`** (new) | Phase 3B | State + flags + safe spawn + references |
| Passport / identity | Website + Supabase | Website (untouched) | Identity, server `onboarding_stage`, species lock |

Progress stores only an **avatar reference** (`AvatarId`, `Revision`), never appearance data, and no Passport/credential fields.

### 4.2 Proposed schema (v1)

```
UMRProgressSaveGame
  int32   SaveVersion              // 1
  int32   WriteGeneration          // monotonically increasing; used for A/B slot choice
  FGuid   LocalProfileId           // local-only; NOT a Passport id
  EMRIdentityMode IdentityMode     // OfflineGuest | OnlineLinked (placeholder, unused in v1)
  FString OpaqueSubjectId          // EMPTY in v1. Reserved for an approved server contract; never a credential.
  FName   CurrentState             // stable state ID, e.g. "TAVIAN_DIALOGUE"
  FMRProgressFlags Flags {
      bool bAccessResolved, bPassportChecked, bAvatarConfirmed,
      bArrivalSeen, bCoreSpawned, bFirstObjectiveDone,
      bTavianIntroduced, bBartenderHandoff, bOnboardingCompleted
      EMRQuestStatus FirstQuestStatus   // NotOffered | Offered | Active | Completed
  }
  FMRSafeSpawn LastSafeSpawn { FName MapId; FName SpawnPointId; }   // IDs, not coordinates
  FMRAvatarRef AvatarRef { FGuid AvatarId; int32 Revision; }
  FMRContentVersions Content { FName CoreManifestVersion; FName QuestRegistryVersion; FName DialogueVersion; }  // "unresolved" until canon
  FString Notice                   // "Local development progress. Not a Passport record."
```
State IDs and flag names match your master list (`onboardingCompleted`, `arrivalSeen`, `tavianIntroduced`, `bartenderHandoff`, `firstQuestStatus`, `lastSafeSpawn`).

### 4.3 Rules

- **Versioning & migration:** same pattern as the avatar save — `SaveVersion` integer, a stepwise `MigrateProgress()` (v0 → v1 → …), future-version saves are ignored but **never overwritten**.
- **Atomic-ish writes:** two slots `MRProgress_Local_A` / `_B` with `WriteGeneration`. Write the *other* slot, then (if it reads back valid) consider it current. Load picks the highest valid generation. Protects against a crash mid-write.
- **Validation on load:** flag/state consistency (a later flag implies earlier ones), content IDs checked against the registry; invalid → fall back to the latest valid earlier checkpoint and report (same "sanitise, don't crash" approach as the avatar loader).
- **Avatar linkage:** on `AVATAR_CHECK`, compare `AvatarRef` with the avatar save. A changed/edited avatar is fine (reference updates). A missing avatar sends the player back to the creator without resetting later progress.
- **Test isolation:** `-MRProgressSlot=<name>` and `-MRProgressFresh`, mirroring the avatar slot flags; the real default slot is never used by tests.
- **No network, no Supabase:** purely local in v1.
- **Server relationship (BLOCKED):** whether/how local progress ever syncs, and how it maps to the server's `core_arrival` / `active_player` stages, needs an approved contract (D-3). The Unreal client will not write server onboarding state.

### 4.4 Runtime component

`UMROnboardingSubsystem : UGameInstanceSubsystem` owns the state machine and the progress store. It loads a data asset `DA_MR_OnboardingFlow` (state list, transitions, done-flag names, required services) and exposes `AdvanceTo`, `ReportEvent(EventId)`, `GetState`, plus delegates for HUD/debug. A development overlay shows `CurrentState`, flags, content versions, save generation and slot name.

## 5. Integration boundaries

All integrations are **interfaces with null/placeholder implementations first**, so the state machine is testable without canon.

| Interface | Direction | Contract (design) | Existing today | Status |
|---|---|---|---|---|
| **Avatar Creator completion** | Creator → Onboarding | Event `OnAvatarConfirmed(AvatarId, Revision)` raised by the creator's Confirm path; Onboarding requests "open creator" via a launcher. | Creator + save exist; **no completion event yet** (small additive change needed). | FREE |
| **Passport verification** | Onboarding ↔ `IMRPassportProvider` | `RequestStatus() → {Linked, NoPassport, AuthRequired, Error, OfflineGuest}`; `OpenWebsiteRegistration()` (external browser). Auth is a reviewed OAuth/PKCE or external-browser handoff with server-mediated token exchange — **not** a webview password flow and not an assumed shared web session. | None in Unreal. Web has `get_my_player_state`, `link_my_passport`, `claim_passport`. | Offline impl FREE; online **BLOCKED** (contract D-1/D-3) |
| **Core world loading** | Onboarding → `IMRWorldService` | `LoadLocation(LocationId) → Ready/Failed`, `GetSpawn(SpawnPointId)`. Location/spawn IDs come from the approved registry. | `L_MR_*` dev maps only. | Service FREE; real Core slice **BLOCKED** (B-01, B-02) |
| **Player spawning** | `IMRWorldService` → pawn | Spawn `BP_MR_AvatarPlayerCharacter` at `SpawnPointId`; avatar auto-applied; report `PawnReady`. | Pawn + avatar load exist. | FREE |
| **Cinematic playback** | Onboarding → `IMRCinematicService` | `Play(CinematicId, bSkippable) → Finished/Skipped/Failed`. Level Sequence based. | None. | Service FREE; content **BLOCKED** (B-06) |
| **NPC interactions** | Pawn → `IMRInteractable` / `IMRDialogueService` | `Interact(ActorId)`; `RunDialogue(GraphId) → EndNodeId`; dialogue memory hook. Deterministic authored graphs first; any AI-backed dialogue later, behind a moderated service, with no secrets in the client. | None. | Engine FREE (test fixtures); canon content **BLOCKED** (B-03, B-04) |
| **First mission activation** | Dialogue/Onboarding → `IMRQuestService` | `Offer/Accept/Complete(QuestId)`; status events; journal + reward hooks (ZIP currency; never BIT). | None. | Service FREE; mission **BLOCKED** (B-05) |
| **Progress store** | Onboarding ↔ `UMRProgressSaveGame` | §4. | Avatar save pattern exists. | FREE |
| **HUD / objective tracker / subtitles** | Onboarding → UMG | Objective text from content IDs (never hard-coded lore). | Dev creator UI exists. | Skeleton FREE; strings **BLOCKED** |

## 6. Dependency matrix

Legend: ● hard dependency (blocked without it) · ○ soft/placeholder possible · — none.

| State / interface | Core manifest (v1.2 / v2.0) | Tavian Rell record | Tavern name/ID | Bartender | First mission | 3D Core assets | Cinematic assets | Passport contract |
|---|---|---|---|---|---|---|---|---|
| START | — | — | — | — | — | — | — | — |
| ACCESS_CHECK | — | — | — | — | — | — | — | ○ (online only) |
| PASSPORT_CHECK | — | — | — | — | — | — | — | ● online / — offline |
| AVATAR_CHECK | — | — | — | — | — | ○ (species 3D) | — | ○ (species lock) |
| ARRIVAL_CINEMATIC | ● | — | — | — | — | ○ | ● | — |
| CORE_SPAWN | ● | — | ○ | — | — | ● | — | — |
| FIRST_OBJECTIVE | ● | — | ● | — | ○ | ● | — | — |
| TAVIAN_DIALOGUE | ● | ● | ● | ○ | — | ● | — | — |
| BARTENDER_HANDOFF | ● | ● | ● | ● | ○ | ● | — | — |
| FIRST_MISSION | ● | ○ | ● | ● | ● | ● | — | — |
| FREE_EXPLORE | ● | — | ○ | — | — | ● | — | — |

## 7. Canonical-content blocker list

None of these will be invented or "fixed" by me.

| ID | Blocker | Blocks | Needed from you |
|---|---|---|---|
| B-01 | **Core manifest authority.** v1.2.0 (frozen) and Library v2.0 are not available; which is approved is unknown; diff/collisions not done. | All Core content; location/NPC/quest ID registry | Both files + a ruling |
| B-02 | **Tavern identity.** Display name unresolved ("Lost Orbit" per your instructions vs "Last Orbit" in the asset-bible file name). `core-tavern` as the location key is unverified. | FIRST_OBJECTIVE, TAVIAN_DIALOGUE, BARTENDER_HANDOFF, spawn/objective text | Ruling on name + canonical ID |
| B-03 | **Tavian Rell NPC record** (identity, voice, traveler/rumour content, dialogue, art, placement). No such record exists in any file I can read. | TAVIAN_DIALOGUE | The record + authored dialogue |
| B-04 | **Bartender identity and dialogue.** A candidate art file exists but is **not** confirmed as the bartender. | BARTENDER_HANDOFF | Identity + dialogue |
| B-05 | **First mission** definition (objective, trigger, completion condition, reward in ZIP). | FIRST_MISSION | The mission spec |
| B-06 | **Arrival content:** the arrival cinematic and approved Sector 00 / Core arrival description. | ARRIVAL_CINEMATIC | Brief and/or assets |
| B-07 | **Core 3D environment** (transit approach, corridor, tavern interior/entrance, skyline). Only 2D reference art and an empty 3D source folder exist. | CORE_SPAWN … FIRST_MISSION | 3D assets or an approved graybox policy |
| B-08 | **Server contract** for identity handoff, and for how local onboarding maps to server `onboarding_stage` (`core_arrival`, `active_player`). | Online PASSPORT_CHECK; any progress sync | Backend design approval |
| B-09 | **Species-lock policy in Unreal** (see D-2). | AVATAR_CHECK for linked accounts | Decision |

**What is NOT blocked:** state machine core, flow data asset, progress save + migration + atomic writes, resume router, debug overlay, interface definitions + null implementations, offline passport mode, avatar-completion event, stuck-player recovery, automated resume/corruption tests, and a dev-labelled graybox for plumbing tests.

## 8. Open decisions for the owner

| ID | Decision | My recommendation |
|---|---|---|
| D-1 | Is v1 **offline/guest only**, with online identity deferred? | Yes — build and test offline first; keep the provider interface. |
| D-2 | If a linked account has a server-locked species, does the Unreal creator hide/lock the species step? | Server value wins; show it read-only. Offline guests may choose freely (labelled dev). |
| D-3 | Will local progress ever sync to the server, and who may advance `core_arrival`/`active_player`? | No sync in v1. Any server write goes through a reviewed RPC, never the client directly. |
| D-4 | Can the avatar be edited after onboarding completes? | Yes, via creator; progress keeps only the reference. |
| D-5 | Replays: skip cinematic always, or offer "Replay arrival"? | Skip by default; optional replay later. |
| D-6 | Does `FIRST_MISSION` end FREE_EXPLORE entry on **accept** or **complete**? | Enter `FREE_EXPLORE` on *accept* (mission continues as normal quest); `OnboardingCompleted` set then. Needs confirmation. |
| D-7 | Dialogue resume granularity: restart conversation vs. resume at node. | Restart at conversation start (simple, safe) for v1. |
| D-8 | Should the `PASSPORT_HANDOFF` support state exist in v1? | Omit until online identity is approved. |

## 9. Proposed implementation sequence (each step is gated on your approval)

| Step | Work | Needs canon? | Exit test |
|---|---|---|---|
| **P0** | Intake: decisions D-1…D-8; canon items B-01…B-07 as they arrive. | — | Decisions recorded |
| **P1** | Framework: `UMROnboardingSubsystem`, state/flag enums, `DA_MR_OnboardingFlow`, `UMRProgressSaveGame` + migration + A/B writes + validation, dev overlay, `-MRProgressSlot/-Fresh`. | No | Automation tests: transitions, invalid transitions rejected, save/load/migrate/corrupt/future-version, A/B crash safety |
| **P2** | Interfaces + **null/placeholder** implementations; avatar-confirmed event from the creator; offline passport provider; stuck-player "return to safe spawn". | No | Whole spine runs end-to-end on **clearly labelled test fixtures** (not canon) in a dev map |
| **P3** | Resume matrix tests: kill/relaunch at every checkpoint; returning player; skip logic; avatar deleted mid-onboarding. | No | Resume tests green for all 11 states |
| **P4** | HUD skeleton (objective tracker, subtitles, pause/safe-return, location label) with placeholder strings. | No (strings placeholder) | Visual + automated-mouse checks; human check pending |
| **P5** | **Canon-dependent content:** Core slice blockout/art pass, arrival cinematic, Tavian, bartender, first mission, objective text. | **Yes (B-01…B-07)** | Real-content acceptance run |
| **P6** | Online identity handoff (external-browser/PKCE, server-mediated), `core_arrival`/`active_player` mapping. | **Yes (B-08)** + backend work | Separate security review; no Supabase change without approval |
| **P7** | End-to-end acceptance + regression: existing 39 animation checks, avatar suites, template levels, website/portal untouched. | — | Report with human vs automated vs direct-call separation |

P1–P4 deliver a fully testable, canon-free spine. P5 cannot start until the canon blockers are resolved; P6 is independent and optional for the first playable.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Placeholder content mistaken for canon | Dev labels in UI and IDs (`DEV_…`), fixtures confined to a dev map, never packaged as production. |
| Species-lock divergence between web and Unreal | D-2 decision before any online work. |
| Save corruption/soft-lock | A/B slots, validation, safe-spawn recovery, versioned migration. |
| Canon changes after content is built | Data-driven flow + content-version stamp in the save, so checkpoints can be re-validated. |
| Cold-start flakiness seen earlier when launching on this Mac | Undiagnosed; keep test launches as plain direct invocations; not a design dependency. |

## 11. Out of scope here

Combat, vehicles, economy, faction AI, city generation, multiplayer, Phase 3C/3D, any change to the website, SIGNAL PORTAL, Passport, voting, events, Supabase, or canonical manifests.
