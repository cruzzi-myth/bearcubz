# Phase 3B P5A — Canon discrepancy: where Tavian Rell appears in the onboarding sequence

**Status: DOCUMENTED, NOT RECONCILED.** The onboarding state machine was not changed. Nothing here is a ruling; it is the list of what must change once the final sequence is confirmed.

## The two sequences

**Implemented (Phase 3B P1, accepted, tested — preserved as-is):**

`START → ACCESS_CHECK → PASSPORT_CHECK → AVATAR_CHECK → ARRIVAL_CINEMATIC → CORE_SPAWN → FIRST_OBJECTIVE → TAVIAN_DIALOGUE → BARTENDER_HANDOFF → FIRST_MISSION → FREE_EXPLORE`

Tavian Rell (state 8) and the bartender (state 9) come **after** the player has arrived at the Core.

**Established narrative (stated in the P5A authorization, not yet confirmed as a final sequence):**

Tavian Rell is aboard the **Galactic Space Station**, at the **Last Orbit Tavern**, **before** the player's **departure-terminal Passport scan** and **travel to the Core**.

## Where they conflict

| Topic | Implemented | Established narrative |
|---|---|---|
| Location of the Tavian conversation | The Core (after CORE_SPAWN) | Galactic Space Station, Last Orbit Tavern |
| Order vs. arrival at the Core | after | before (the player has not yet travelled) |
| Passport scan | `PASSPORT_CHECK`, second state, headless, offline-guest | In-fiction, at the departure terminal, after the Tavian conversation |
| Arrival cinematic | before CORE_SPAWN, after avatar | possibly the travel to the Core (unconfirmed) |
| Bartender | after Tavian, at the Core tavern | unspecified (station tavern? Core?) |
| First mission offer | after the bartender, at the Core | unspecified |

## Open questions that must be answered before any change

1. Is the station sequence strictly **before** everything currently in the spine after AVATAR_CHECK, or does it also move AVATAR_CHECK?
2. Is the departure-terminal Passport scan the in-fiction face of today's `PASSPORT_CHECK`, or a separate story beat? (Current rules: offline guest, D-1; `PASSPORT_HANDOFF` deferred, D-8; no live Passport in Unreal.)
3. Does the bartender stay in the sequence, and where (station or Core)?
4. Where is the first mission offered and accepted (D-6 requires FREE_EXPLORE on acceptance)?
5. What does the arrival cinematic depict, and does it follow the Passport scan?
6. Tavern name: the P5A authorization says **Last Orbit**; the earlier blocker B-02 recorded "Lost Orbit" (earlier instruction) versus "Last Orbit" (Asset Bible file name). The two sources now agree on "Last Orbit", but B-02 still needs a formal ruling and a canonical location ID.

## Changes needed once the sequence is confirmed (NOT implemented)

**State machine** (`Source/MoonRacer/Onboarding/MROnboardingTypes.*`, `MROnboardingSubsystem.cpp`)
- New/reordered states: a station location state (spawn at the station), the Tavian conversation at the tavern, a departure/terminal state, the Passport scan state, the travel/arrival states. Update `EMROnboardingState`, `Spine()`, `StateId`, `ParseState`, `Successor`, `ExitEventFor`, `EMROnboardingEvent`.
- `FMRProgressFlags` / `FMRProgressRecord::IsStateDone` and the ordering rules in `Validate()` (they assume the current order).
- `ComputeResumePlan` / `ComputeNext` (resume routing, "re-run ACCESS and PASSPORT on launch", "respawn first" rule — currently keyed to CORE_SPAWN).
- `LastSafeSpawn` becomes per-location; the safe-spawn recovery must know the station and the Core.

**Content IDs** (`FMRFlowContent`, `DA_MR_OnboardingFlow`): station location, station spawn, tavern, Tavian and bartender records, the Passport-scan interaction, the Core arrival. All **BLOCKED** until approved records exist (B-01..B-07).

**Persistence:** a progress save-version bump (v1 → v2) with a migration that maps every existing v1 state to the new order **without resetting progress**; the content-version stamp already added in P5A will flag old checkpoints. Only fixture data exists today, so no real player progress is at risk, but the migration is still required before any real save exists.

**Tests:** the 20 onboarding automation tests, the 4 onboarding world processes, and the P5A onboarding-binding test assert the current order and must be updated together with the state machine.

**Docs:** `Phase3B_Onboarding_Architecture.md` §4–§8.

## What P5A already supports regardless of the outcome
- Conversations are standalone data (`UMRDialogueGraph`) bound to an NPC id; they do not encode their place in the onboarding sequence. Moving Tavian to the station changes only which state starts the conversation and where the NPC actor stands.
- NPC availability can be gated by a fact (`UMRNpcRecord::AvailabilityFact`) so a conversation can be unavailable until an earlier beat has happened.
- Missions are independent of onboarding; the state machine only asks the quest service to accept one.
- The interaction foundation (`UMRInteractableComponent` / `UMRInteractorComponent`) works in any map.

---
**Update (P5B-1):** the narrative order has since been settled — the station tavern encounter precedes the departure-terminal Passport scan and transit to the Core, and Tavian Rell is the bartender. See `Phase3B_Canon_Rulings.md`. The implemented state machine is still unchanged; the redesign and save migration remain unauthorized.
