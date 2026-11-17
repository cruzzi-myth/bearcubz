# Phase 3B P5A — narrative & interaction systems foundation

Content-independent. **No canonical story content exists in this code.** All content is `TEST FIXTURE - NONCANON`.
Companion: `Phase3B_P5A_Canon_Discrepancy.md` (sequence conflict, documented but not reconciled).

## Files (`Source/MoonRacer/`)
| Area | Files |
|---|---|
| Schemas | `Narrative/MRNarrativeTypes.*` |
| Validation | `Narrative/MRNarrativeValidator.*` |
| Dialogue runtime | `Narrative/MRDialogueRuntime.*` |
| Registry, missions, objectives, state | `Narrative/MRNarrativeSubsystem.*` |
| Persistence | `Narrative/MRNarrativeSaveGame.*` (envelope `MRNV`) |
| Onboarding seams | `Narrative/MRNarrativeServices.*` (`MRNarrative::BindOnboarding`) |
| Interaction | `Narrative/MRInteraction.*` |
| HUD | `Narrative/MRNarrativeHud.*` |
| Fixtures (dev) | `Dev/MRNarrativeFixtures.*` |
| World test driver (dev) | `Dev/MRInteractionTestDriver.*`, map `Content/MoonRacer/Maps/L_MR_InteractionDev` (script `Scripts/Editor/mr_create_interaction_dev_map.py`) |
| Tests | `Tests/MRNarrativeAutomationTests.cpp` (`MoonRacer.Narrative.*`) |
| Modified | `Onboarding/MRIntegrationInterfaces.h` (non-breaking: `Cancelled`, `CancelDialogue()`, `IsDialogueActive()`), `Onboarding/MROnboardingSubsystem.*` (content-version safety) |

## Schema
Records reference each other by stable `FName` ids only. Text is never stored in a record: records hold string-table keys; `MRNarrative::ResolveText` returns `FText::FromStringTable`.
`UMRNarrativeRecordBase` = `RecordId`, `ContentVersion`, `Provenance{SourceDocumentId, ApprovalId, Note}`, `bTestFixture`.
- `UMRNpcRecord`: `StringTableId`, `DisplayNameKey`, `DefaultDialogueGraphId`, `AvailabilityFact`.
- `UMRDialogueGraph`: `NpcId`, `StringTableId`, `StartNodeId`, `Nodes[]`.
- `FMRDialogueNode`: `NodeId`, `Type {Line, Choice, Branch, End}`, `SpeakerNpcId` (None = player), `TextKey`, `NextNodeId`, `Choices[]`, `OnEnterEffects[]`, `CompletionEventId` (End).
- `FMRDialogueChoice`: `ChoiceId`, `TextKey`, `NextNodeId`, `Conditions[]`, `Effects[]`.
- Conditions: `FactSet`, `FactNotSet`, `MissionStatus`, `DialogueCompleted`, `ObjectiveCompleted`. Effects: `SetFact`, `ClearFact`, `OfferMission`, `AcceptMission`, `CompleteObjective`, `EmitEvent`; an effect may be `bOneTime` with a bundle-unique `EffectId`.
- `UMRMissionRecord`: `StringTableId`, `TitleKey`, `SummaryKey`, `OfferingNpcId`, sequential `Objectives[] {ObjectiveId, TextKey, CompletionEventId}`. **No reward fields by design (none approved).**

## Dialogue runtime (deterministic)
Line → Continue; Choice → Choose (conditional choices hidden when their conditions fail; hidden choices cannot be taken); Branch → silent, first satisfied choice; End → completes with `CompletionEventId`. Cancel at any point → `Cancelled`. Restart always begins at `StartNodeId` (D-7). One-time effects are written to a persistent ledger **before** they are applied, so interruption, replay or relaunch can never fire them twice. A conversation records completion (`bFirstCompletion`) only on reaching an End node.

## Validation (`MRNarrative::ValidateBundle`) — a bundle with any error is rejected whole
Unique ids; valid NPC/graph/mission/objective references; valid edges; reachability of every node; every reachable node can reach an End; no silent Branch-only cycles; unconditional fallback choice; valid conditions/effects; one-time effects have unique ids; string-table keys exist; one dialogue version and one quest version per bundle; provenance required for non-fixtures; fixture records must use the `TEST_FIXTURE_` prefix and may never be present under a production policy or be referenced by canonical records. Diagnostics carry a stable code, the record id and an actionable message.

## Missions & objectives
Offer → Accept (idempotent; never re-activates or resets a completed mission). Objectives complete strictly in order, by event (`NotifyGameEvent`) or by effect. Last objective completes the mission. D-6 is preserved: the onboarding state machine is unchanged and still enters FREE_EXPLORE when the mission is **accepted**. The tracker shows the first mission with an active objective (or a standalone onboarding objective).

## Persistence & content versions
Narrative state (facts, completed dialogues, one-time ledger, completed objectives, mission statuses) persists in its own file, `MRNarrative_Local.sav` by default (`-MRNarrativeSlot=` selects a dedicated slot), with the same protections as the other stores: verified envelope before any engine deserialisation, temp-file + atomic replace, corrupt/newer files never loaded and never destroyed (a corrupt original is copied to `.bak` before replacement; a newer-version file is never overwritten).
`FMRContentVersions` is now **stamped** into every onboarding checkpoint (`UMROnboardingSubsystem::ExpectedVersions`, default `unresolved` so existing saves and tests are unaffected) and **validated on restore**. On a mismatch: progress is kept (no reset; a completed player stays completed), the stale safe spawn is not trusted (the default spawn is used), the mismatch is reported, and the checkpoint is re-stamped on the next transition. A fresh record never reports a mismatch. Narrative state with a version mismatch is also kept; entries for content that no longer exists are retained but not applied.

## Interaction & HUD
`UMRInteractableComponent` (NPC id, range, availability) on any actor; `UMRInteractorComponent` on the pawn finds the nearest interactable in range, shows the prompt, binds **E**, and starts the NPC's dialogue. `AMRDevNpcActor` is a primitive dev stand-in. `UMRNarrativeHudWidget` (UMG, built in C++): prompt, objective tracker, dialogue panel (speaker, text, numbered responses, Continue, Cancel). Keyboard: Up/Down (W/S), Enter/Space, 1–9, Esc; mouse: click. While a conversation runs, movement/look are blocked and the cursor is shown; both are restored on finish or cancel.

## Commands
```
# automation
UnrealEditor-Cmd MoonRacer.uproject -ExecCmds="Automation RunTests MoonRacer.Narrative; Quit" -unattended -nullrhi -nosplash -nosound
# world processes (dedicated slots are mandatory; the driver refuses the default slots)
UnrealEditor.app/Contents/MacOS/UnrealEditor MoonRacer.uproject /Game/MoonRacer/Maps/L_MR_InteractionDev -game -windowed -ResX=1280 -ResY=720 \
  -UseFixedTimeStep -FPS=60 -MRNarrativeSlot=MRNarrative_DevAcceptance -MRAvatarSlot=MRAvatar_NarrDev [-MRNarrativeFresh] -MRNarrTest=interact|resume
```

## Known limitations
- Onboarding's FIRST_OBJECTIVE is a standalone (non-mission) objective; its trigger volume/waypoint is not built (P5B).
- Dialogue/mission content is built in C++ as fixtures; the importer that turns approved source documents into these records is P5B.
- Quest completion beyond objective events, failure/abandon, rewards, and a journal UI are out of scope.
- The HUD is a minimal dev UI (no gamepad navigation, no theming).
