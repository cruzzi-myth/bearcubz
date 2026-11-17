# Phase 3B P5B-3A — development-only code and maps to exclude from Shipping eventually (DOCUMENT ONLY)

**No packaging change is made by P5B-3A.** `Config/DefaultGame.ini` is exactly as left by P5B-2 (three `DirectoriesToNeverCook` entries). This list says what should *later* be excluded and in what order. Each item needs approval before any change.

## Already excluded from every cook (P5B-2)
`/Game/MoonRacer/Narrative/Generated/TEST_FIXTURE_BUNDLE`, `/Game/MoonRacer/Maps/L_MR_InteractionDev`, `/Game/MoonRacer/Maps/L_MR_OnboardingDev`.

## Development-only maps (not yet excluded)
| Map | Notes |
|---|---|
| `L_MR_AnimationTest` | hosts `AMRAnimationTestDriver` |
| `L_MR_AvatarCreator`, `L_MR_AvatarSpawnTest` | host `AMRAvatarTestDriver`; the **Avatar Creator widget/controller are production code** — only these test maps are dev |
| `DISPOSABLE_DIAG_V1…V8` (8 maps in `/Game/MoonRacer/Diagnostics`) | disposable rendering diagnostics |
Recommendation: relocate them under one `/Game/MoonRacer/Dev/…` folder (path change → needs approval, docs/commands update) so a single never-cook folder entry covers them, **or** add per-map entries as in P5B-2.

## Development-only C++ (compiled into every configuration today)
| Code | Role | Safe to compile out of Shipping? |
|---|---|---|
| `Dev/MRAnimationTestDriver.*`, `Dev/MRAvatarTestDriver.*`, `Dev/MROnboardingTestDriver.*`, `Dev/MRInteractionTestDriver.*` | world-process test drivers (run only with `-MRAnimTest` / `-MRAvatarTest` / `-MROnbTest` / `-MRNarrTest`; they refuse default slots) | **Yes**, but only AFTER the maps that place them are never-cooked (a cooked map referencing a missing class would warn) |
| `Dev/MRNarrativeFixtures.*` | TEST FIXTURE content builder (used by drivers/tests) | Yes (with the drivers/tests) |
| `Tests/*.cpp` (all) | automation tests | **Already excluded** (`WITH_DEV_AUTOMATION_TESTS`) |
| `Narrative/MRInteraction.*` — `AMRDevNpcActor` | primitive NPC stand-in actor placed in the dev maps | the **actor** yes; the interactable/interactor components are reusable production foundation and stay |
| `Narrative/Import/MRNarrativeImporter.*` | importer; asset generation is already `#if WITH_EDITOR`; the commandlet class exists in all builds but is inert | optional (commandlet class could be editor-only) |
| `Onboarding/MRDevOnboardingServices.*` | TEST FIXTURE service placeholders that the **live onboarding flow currently wires** (`UseDevServices`) | **No — not yet.** It is part of the running v1 flow until real services replace it; removing it would break onboarding |
| `Onboarding/MRCheckpointV2*.*` | v2 infrastructure (not active) | keep (not dev-only; it is the future production schema) |
Suggested mechanism: wrap driver/fixture sources in `#if !UE_BUILD_SHIPPING` (or move them to a non-shipping module). The runtime gates already refuse fixtures in a Production process and shipping builds are always Production, so this is defence in depth, not the primary safeguard.

## Order of operations (when authorized)
1. Decide the Dev-folder relocation vs per-map entries; update docs/commands.
2. Never-cook the remaining dev maps; re-run the `-CookAll` package comparison from `Phase3B_P5B2_Packaging_Safety.md`.
3. Compile the drivers/fixtures out of Shipping; rebuild Shipping; re-run the comparison; run the editor test suites.
4. Leave `MRDevOnboardingServices` until real services exist.
5. Optionally add the cook comparison to a pre-release checklist.

---

## Addendum (P5B-3B) — additional dev-only C++ to consider for Shipping exclusion (document only; packaging config NOT changed)

P5B-3B added development-only code. It is already inert in Shipping by construction (`MROnboardingV2Dev` is compile-time false under `UE_BUILD_SHIPPING`, and `UMROnboardingV2Subsystem::ShouldCreateSubsystem` returns false), and its tests are excluded by `WITH_DEV_AUTOMATION_TESTS`. If a later packaging task chooses to strip dev code entirely:

| Item | Removable from Shipping? | Note |
|---|---|---|
| `Dev/MROnboardingV2TestDriver.*` | yes | world test driver; spawned only by the dev subsystem |
| `Tests/MROnboardingV2MachineTests.cpp` | already excluded | `WITH_DEV_AUTOMATION_TESTS` |
| `UMRDevPassportScanService`, `UMRDevV2*Service` (in `Onboarding/MRV2Services.*`) | yes, with the machine | TEST FIXTURE services |
| `UMROnboardingMachineV2`, `UMROnboardingV2Subsystem` | yes, **once** nothing production references them | not referenced by any default flow today |
| `IMRPassportScanService`, `MRDeparture::Evaluate`, `FMRV2FixtureContent` | **keep** the interface and evaluator; remove only the fixture content defaults | these are the seams real services will implement |
| `FMRCheckpointV2Store` mixed-generation policy | **keep** | production-relevant persistence logic |

No maps were added (the graybox is spawned at runtime by the driver), so there are no new maps to exclude.

## Addendum — Avatar Creator V2 I1+I2 (development-only code to consider excluding from Shipping)

Document only; no packaging configuration was changed. These are compile-time refused in Shipping (`MRAvatarV2Dev::IsShippingBuild()`), but their code and assets are still present in a package unless excluded:
* Code: `Source/MoonRacer/AvatarV2/*` (gate, camera, chamber, session, UI, controller/game mode), `Source/MoonRacer/Dev/MRAvatarV2TestDriver.*`, `Source/MoonRacer/Tests/MRAvatarV2Tests.cpp` (tests are editor-only already).
* Content: `/Game/MoonRacer/Maps/L_MR_AvatarCreatorV2Dev`, `/Game/MoonRacer/AvatarV2Dev/*` (three development materials).
* Recommendation (for later, with approval): add the map and the `AvatarV2Dev` folder to the NeverCook list alongside the existing dev assets, and move the `AvatarV2` source directory behind a `WITH_MR_DEV_TOOLS` build define.
