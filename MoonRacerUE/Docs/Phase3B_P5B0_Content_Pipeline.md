# Phase 3B P5B-0 — narrative content pipeline

Content-independent. Everything built and tested here uses **TEST FIXTURE — NONCANON** records. No canonical NPC, dialogue, mission or world content is imported, the Asset Bible is not read, and the onboarding state machine is unchanged.

## Pipeline
```
NarrativeSource/<bundle>/*.json  (reviewed, version-controlled, never written by Unreal)
   │ 1 READ + STRICT SCHEMA CHECK   (JSON, types, unknown fields, enums, ids, file hashes, unlisted files)
   │ 2 STAGE in memory              (transient records + staged string tables)
   │ 3 VALIDATE the whole bundle    (P5A validator + import rules; production policy if PRODUCTION)
   │      any error → REJECTED, nothing written
   │ 4 COMMIT (editor only)         immutable, content-addressed assets  .../Generated/<bundleId>/<hash12>/…
   │      all assets saved → COMPLETE.json → ACTIVE.json flipped atomically (temp + move)
   ▼
FMRNarrativeImporter::LoadActive(...)  → FMRNarrativeBundle   ──(explicit, separate act)──▶ UMRNarrativeSubsystem::RegisterBundle
```
Nothing is registered or published automatically: not into the narrative subsystem, not into `DA_MR_OnboardingFlow`, not into the onboarding machine.

Entry points: `FMRNarrativeImporter::Stage/Import/LoadActive/ReadActive` (`Narrative/Import/MRNarrativeImporter.*`) and the commandlet `-run=MRNarrativeImport -Source=<dir> [-Out=/Game/...] [-ValidateOnly] [-Production]` (exit code 0 = ok).

## Source format: JSON, schemaVersion 1
Chosen because it is plain text (diffable, reviewable, tool-friendly outside Unreal), UE already parses it, and it maps one-to-one to the P5A records. The schema is **strict**: wrong types, unknown fields and bad enum values are errors. Ids: letters, digits, `_`, ≤ 64 chars.

`bundle.json` — manifest
```
{ "schemaVersion":1, "bundleId":"…", "classification":"TEST_FIXTURE"|"PRODUCTION",
  "dialogueVersion":"…", "questVersion":"…",
  "approval": { "approvalId","approvedBy","approvedOn","sourceDocumentId" },   // required for PRODUCTION
  "files": [ {"path":"strings.json","sha1":"<sha1 of the raw file>"}, … ] }       // the ONLY files imported; sha1 = review integrity
```
Every other `*.json` in the folder must be listed (an unlisted file is an error: unreviewed content is never imported).

| file `kind` | shape |
|---|---|
| `strings` | `{schemaVersion, kind, tableId, locale?, entries:{key:text}}` — localisation keys → source text |
| `npcs` | `records[]: {id, stringTable, displayNameKey, defaultDialogueId?, availabilityFact?, provenance?, testFixture?, contentVersion?}` |
| `dialogues` | `records[]: {id, npcId, stringTable, start, nodes[], provenance?, testFixture?, contentVersion?}`; node `{id, type:line|choice|branch|end, speaker?, textKey?, next?, choices[]?, onEnter[]?, completionEvent?}`; choice `{id, textKey?, next, conditions[]?, effects[]?}` |
| `missions` | `records[]: {id, stringTable, titleKey, summaryKey?, offeringNpcId?, objectives[{id,textKey,completionEvent}], provenance?, testFixture?, contentVersion?}` |

condition `{type: fact_set|fact_not_set|mission_status|dialogue_completed|objective_completed, subject, status?}`; effect `{type: set_fact|clear_fact|offer_mission|accept_mission|complete_objective|emit_event, subject, oneTime?, effectId?}`; `provenance {sourceDocumentId, approvalId, note}`. There are no reward fields (none approved).
Versions: every NPC/dialogue/string table takes the bundle's `dialogueVersion`; every mission takes `questVersion`. A record may restate `contentVersion`; if it differs from the bundle it is a `VERSION_CONFLICT`.
Fixture example: `NarrativeSource/TEST_FIXTURE_BUNDLE/` (mirrors the P5A code fixtures). Authoring helper (not used by the importer): `Scripts/Tools/narrative_manifest_sha1.py`.

## Validation (all must pass; any error rejects the whole bundle)
Schema: `JSON_PARSE SCHEMA_TYPE SCHEMA_MISSING_FIELD SCHEMA_UNKNOWN_FIELD SCHEMA_ENUM SCHEMA_VERSION INVALID_ID BAD_PATH HASH_MISMATCH UNLISTED_FILE SOURCE_UNREADABLE`.
Semantics (P5A validator, run against the bundle's **staged** strings): `DUPLICATE_ID UNKNOWN_NPC UNKNOWN_GRAPH UNKNOWN_MISSION UNKNOWN_OBJECTIVE DANGLING_EDGE BAD_START UNREACHABLE_NODE NON_TERMINATING NO_END_NODE BRANCH_CYCLE NO_CHOICES NO_FALLBACK_CHOICE MISSING_STRING_KEY MISSING_VERSION VERSION_MISMATCH DUPLICATE_EFFECT_ID MISSING_EFFECT_ID …`.
Import/production: `VERSION_CONFLICT CLASSIFICATION_MISMATCH MISSING_APPROVAL MISSING_PROVENANCE FIXTURE_NOT_ALLOWED FIXTURE_ID_MISMATCH FIXTURE_LEAK PRODUCTION_FIXTURE_TEXT`.
Each diagnostic carries a stable code, the file/record, and an actionable message. Production rules: manifest approval block required; every record needs `provenance.sourceDocumentId` and `approvalId`; no `testFixture` records, no `TEST_FIXTURE_` ids, no `TEST FIXTURE - NONCANON` text; and `LoadActive(..., bProductionOnly=true)` refuses a fixture bundle.

## Repeatable imports (no duplicates, no partial state)
- **Identity:** a bundle's hash covers canonical content only (sorted keys, no whitespace, excluding raw per-file sha1), so reformatting is not a change.
- **Same hash → `Unchanged`:** nothing is written.
- **New hash → new immutable folder** `<bundleId>/<hash12>/`; only `ACTIVE.json` decides what is live. Old folders are kept (rollback = re-import the earlier source: the existing folder is re-activated without rewriting). Nothing is deleted automatically.
- **Interrupted import:** assets are written first, then `COMPLETE.json`, then `ACTIVE.json` is replaced atomically. An interruption leaves the previous bundle active and loadable; an incomplete folder is never loadable and is rebuilt on retry.
- **Impact report** on every change (see below).

## Content versions and existing saves
Stable ids are the contract: saves reference records by id (completed dialogues, one-time effect ledger, facts, objectives, mission status). The narrative save stamps `dialogueVersion` + `questVersion`; the importer enforces that **the same version always means the same content** (changed content with an unchanged version is `VERSION_CONFLICT`).
| Change (with a version bump) | Effect on an existing save |
|---|---|
| version bump | load reports a version mismatch; **all progress kept**; the save is re-stamped (never reset) |
| changed dialogue | completion record + one-time ledger kept (by id); an interrupted conversation restarts from its first node (D-7) |
| changed mission / objectives | status kept; the current objective is derived from recorded completed objective ids |
| removed mission | its saved status is retained but **not applied**; reported on load (`UnknownMissions`) |
| removed/renamed one-time effect id | the old ledger entry stays; a replacement id will fire once more — the importer warns about this |
| removed NPC/dialogue | ids in saves stay, unused; reported |
Onboarding checkpoints use the P5A content-version stamp: on mismatch progress is kept and the default spawn is used. Importing never modifies a save.

## Fixtures vs. production
`classification` is explicit. A fixture bundle may contain only `testFixture:true` records with `TEST_FIXTURE_` ids; a production bundle none. A bundle id cannot change classification. Generated fixture assets are flagged `bTestFixture`.

## Known limitations / decisions deferred
- String tables are generated as a project data asset (`UMRNarrativeStringTable`, registered as a runtime string table by `MRNarrative::RegisterStrings`); integrating UE's localisation gather/translation workflow (native StringTable assets) is a later decision.
- Duplicate JSON keys inside one object are not detected (UE's parser keeps the last).
- Asset generation is editor-only (commandlet/automation); packaged builds load the generated assets only.
- No importer UI; a commandlet and automation are the interface.
- Pruning of superseded generated folders is manual.
