# Phase 3B P5B-1 — safe, explicit content registration

Content-independent; TEST FIXTURE — NONCANON only. Importing a bundle never makes it live; **registration is a separate, explicit act**. The onboarding flow and its content ids are untouched.

## Architecture
```
imported folder  .../Generated/<bundleId>/<hash12>/   (immutable; COMPLETE.json describes it)
        │ FMRNarrativeRegistrar::Register(subsystem, request)
        │   1 request gates     environment named? process allows it? (before anything is loaded)
        │   2 load ONE folder   verify every record against the import metadata (identity)
        │   3 verify            bundle id/hash pin, classification, versions, record flags, provenance,
        │                       references, text keys (bundle's own strings), production text rules
        │   4 save check        existing narrative save compatible?  conflict → REFUSED, nothing changes
        │   5 commit            snapshot → strings → swap → history   (any failure → snapshot restored)
        ▼
UMRNarrativeSubsystem registry  (+ FMRRegistrationInfo: id, hash, classification, environment)
```
`FMRNarrativeRegistrar` (`Narrative/Registration/`) is stateless; the history of successful registrations lives on the subsystem. Registry primitives on the subsystem: `CaptureRegistry`, `StageStrings`, `SwapRegistry`, `RestoreRegistry`.

## Environment policy
- A request **must** name `Development` or `Production`; `Unspecified` is refused.
- The **process** environment (`MRNarrative::CurrentEnvironment()`): `Production` in shipping builds (cannot be overridden), otherwise `Development` unless `-MRNarrativeEnv=Production`. A Development request in a Production process is refused (`ENV_NOT_PERMITTED`).
- Production environment: only `PRODUCTION` bundles; `FIXTURE_NOT_ALLOWED` for fixtures; fixture text (`TEST FIXTURE - NONCANON`) refused; every record needs approved provenance.
- `UMRNarrativeSubsystem::RegisterBundle` (the lower-level path) also forces "no fixtures" in a Production process.
- `LoadActive(..., bProductionOnly=true)` and the registrar refuse a fixture bundle before loading assets.
- **Cook exclusion (recommendation, NOT applied):** to also keep the fixture assets out of packaged builds, add `/Game/MoonRacer/Narrative/Generated/TEST_FIXTURE_BUNDLE` and the dev maps to `DirectoriesToNeverCook` in `DefaultGame.ini`. That is a project setting and needs approval. The runtime gates above already make them unreachable in shipping.
- Nothing registers a bundle into `DA_MR_OnboardingFlow` or the onboarding machine.

## Failure and rollback
Failure at any commit step restores the previous registry — records, versions, migrations, identity and **string tables** — and the history is unchanged (hooks cover failures before strings, after strings, after the swap). A refusal before the commit changes nothing at all.
`Rollback` re-registers the previous history entry through the full pipeline (re-verification, environment gates, save check); with no previous entry it refuses (`NO_PREVIOUS_BUNDLE`); a damaged target is refused and the current registry is kept. A specific historical folder can be registered by `BundleHash`. History is in memory (per session).

## Save compatibility (checked before any change)
| Condition | Result |
|---|---|
| save written by a newer build | `SAVE_NEWER_VERSION` — refused, save untouched |
| mission Active/Offered in the save but absent from the bundle | `ACTIVE_MISSION_REMOVED` — refused unless `bAcceptRemovedMissions` (then retained, not applied) |
| recorded completed objectives are not a prefix of the new objective order | `OBJECTIVE_ORDER_CONFLICT` — refused |
| one-time effect id in the ledger absent from the bundle and not migrated | Production: `EFFECT_HISTORY_CONFLICT` (refused); Development: note |
| completed/Offered-but-inactive missions, dialogues absent from the bundle | note — retained, unused |
| version change | allowed: progress kept, save re-stamped (mismatch reported) |
Approved **effect-id migrations** (manifest `effectMigrations`) are carried into the saved ledger on registration (new id added, old id kept), so a renamed one-time effect does not fire again. The registrar never deletes saved data.

## Importer hardening
- **Duplicate JSON keys** (nested included) are `DUPLICATE_KEY` errors naming the object path; strict schema is unchanged.
- **One-time effect ids:** in a PRODUCTION→PRODUCTION import a removed or renamed id is `EFFECT_ID_MIGRATION_REQUIRED` unless the manifest declares an approved migration: `"effectMigrations":[{"from":"OLD","to":"NEW","action":"rename"|"retire","approvalId":"…"}]` (`to` required for rename; the `from` must be in the previous active bundle, absent from the new one; the `to` must exist; unknown/invalid migrations are errors). Fixtures keep a warning (`EFFECT_ID_CHANGED`).
- Each generated folder is now **self-describing** (`COMPLETE.json` holds id, hash, classification, versions, record hashes, effect ids, migrations, assets), which is what makes per-folder verification and rollback possible.

## Localization compatibility (design only — nothing replaced)
The FText/string-table abstraction is unchanged: records hold keys, text resolves via `MRNarrative::ResolveText`, and only `HasString`, `ResolveText` and `RegisterStrings` touch string tables.
**Future native-localization adapter:** (1) the importer emits native `UStringTable` assets (one per logical table) in addition to / instead of `UMRNarrativeStringTable`, with the bundle id as namespace and the record keys unchanged; (2) a small adapter maps a logical table id to the asset path and reimplements the three functions above behind the same signatures; (3) UE's localization gather (String Table gatherer / Localization Dashboard) then exports `.po`, translators work on keys, and the adapter selects by active culture; (4) key stability rules: keys never change meaning, are never reused, and are covered by the same version rules as other records; (5) plural/gender-sensitive text uses ICU format args in the source text (no code change). Open decisions: asset-path ids vs logical ids at runtime, culture fallback chain, and whether localized text participates in the bundle hash (recommended: yes).

## Known limits
Registration history is per session; the process environment cannot be changed at runtime in shipping; asset generation remains editor-only; the cook exclusion above is unapplied.
