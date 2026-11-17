# Phase 3B P5B-2 (Task A) — keeping development fixtures out of shipping builds

## What was inspected
- `Config/DefaultGame.ini` had **no** `ProjectPackagingSettings` (no map list, no always-cook folders, no never-cook folders). `Config/DefaultEngine.ini`: `GameDefaultMap` and `EditorStartupMap` are still the template `/Game/ThirdPerson/Lvl_ThirdPerson`. `MoonRacer.uproject` has no content-affecting cook settings.
- **Baseline default cook (Mac, no flags):** 580 packages, 69 under `/Game`, **zero MoonRacer packages**. Today no MoonRacer content at all — fixtures or production — is cooked, because the default map is the template map.
- **Worst-case cook (`-CookAll`) before any change:** 775 packages, 260 under `/Game`, including **all 28 MoonRacer packages**, and therefore every fixture. The exposure is real the moment someone cooks everything, lists a dev map, adds an always-cook folder, or points the default map at MoonRacer content.

## Confirmed TEST_FIXTURE_NONCANON assets (excluded)
Confirmed by a search of the asset files for the fixture markers, and by construction:
| Package | Why it is a fixture |
|---|---|
| `/Game/MoonRacer/Narrative/Generated/TEST_FIXTURE_BUNDLE/<hash>/` — `NPC_TEST_FIXTURE_NPC_ALPHA`, `NPC_TEST_FIXTURE_NPC_BETA`, `DLG_TEST_FIXTURE_DIALOGUE_ALPHA`, `DLG_TEST_FIXTURE_DIALOGUE_BETA`, `MSN_TEST_FIXTURE_MISSION`, `STR_TEST_FIXTURE_NONCANON_STRINGS` (6) | generated from `NarrativeSource/TEST_FIXTURE_BUNDLE`; every record flagged `bTestFixture`, ids `TEST_FIXTURE_*` |
| `/Game/MoonRacer/Maps/L_MR_InteractionDev` | contains the `TEST_FIXTURE_NPC_*` stand-in actors, the labelled fixture text and the interaction test driver |
| `/Game/MoonRacer/Maps/L_MR_OnboardingDev` | labelled "TEST FIXTURE - NONCANON" and hosts the onboarding test driver |

## Deliberately NOT excluded
| Asset | Reason |
|---|---|
| `DA_MR_OnboardingFlow` | the onboarding system's configuration asset (a production-system asset). Its fixture content ids are the C++ *defaults*, not stored in the asset; it is the file real ids will be authored into. |
| characters, BPs, game modes, `DA_MR_AvatarCatalog`, `ABP_MR_Humanoid`, attachment points | shared/production systems |
| `L_MR_AnimationTest`, `L_MR_AvatarCreator`, `L_MR_AvatarSpawnTest`, `DISPOSABLE_DIAG_*` (8 maps) | development-only, but **not** TEST_FIXTURE_NONCANON content; not in this authorization. See "Open items". |
| `Content/MoonRacer/Narrative/Generated/**/ACTIVE.json`, `COMPLETE.json` | not packages; never cooked or staged by default |

## The configuration change (the only one)
`Config/DefaultGame.ini` (project-local; a pre-change copy is in the session scratchpad as `DefaultGame.ini.before_p5b2`):
```
[/Script/UnrealEd.ProjectPackagingSettings]
+DirectoriesToNeverCook=(Path="/Game/MoonRacer/Narrative/Generated/TEST_FIXTURE_BUNDLE")
+DirectoriesToNeverCook=(Path="/Game/MoonRacer/Maps/L_MR_InteractionDev")
+DirectoriesToNeverCook=(Path="/Game/MoonRacer/Maps/L_MR_OnboardingDev")
```
No global Unreal Engine setting, no engine file, and no asset was touched or deleted. The cooker matches a never-cook entry as a path prefix **or an exact package path** (checked in the engine source and by cook), so the two maps are excluded individually without excluding `/Game/MoonRacer/Maps` (which will hold production maps).
Trade-offs: this is a cook-time exclusion, so it applies to **every** cook (including a Development-configuration package), not only Shipping — fixtures are for the editor and uncooked `-game` runs. Entries name exact fixture content; a future fixture needs its own entry (see "Rule for new fixtures").

## Verification performed (Mac, `UnrealEditor-Cmd -run=Cook -TargetPlatform=Mac`)
| Cook | Before | After |
|---|---|---|
| `-CookAll` (worst case) | 775 packages, 28 MoonRacer, **8 fixture packages** | **767**; exactly the 8 fixture packages gone, **0 added**; all 20 other MoonRacer packages still cooked |
| `-Map=/Game/MoonRacer/Maps/L_MR_InteractionDev` (someone lists a fixture map) | — | the map is **not** cooked; 0 fixture packages |
| default cook | 580 / 69 `/Game` / 0 MoonRacer | **identical** (580 / 69 / 0) |
| cooked output searched for `TEST_FIXTURE` text | — | none found |
Package lists were compared from the cooker's `Metadata/ReferencedSet.txt` (kept in the session scratchpad).
Development access: the change only affects cooking. Automation tests and the `-game` world processes were rerun afterwards and still load the fixtures (see the completion report).

## What is NOT verified (limitations)
- **A full Shipping package** (BuildCookRun → staged Shipping app, run) was not performed. The Mac **cook** was verified, and the **Shipping compile of the game target succeeded** (`Build.sh MoonRacer Mac Shipping`, 77 files compiled, produced `Binaries/Mac/MoonRacer-Mac-Shipping`), which also confirms the `UE_BUILD_SHIPPING` environment gate and the editor-only importer code compile in a Shipping configuration. No packaged build was launched, so "fixtures are absent from a shipped app" is established for the cook output, not for a launched Shipping app.
- Staging/pak behaviour (`DirectoriesToAlwaysStageAsUFS` etc.) is unconfigured and was not exercised.
- Windows/Linux/mobile cooks were not run (the setting is platform-independent).
- **Code** (not assets) is not excluded by this change: the dev test drivers, `AMRDevNpcActor`, and `MRNarrativeFixtures` compile into the game module in every configuration. They are inert unless launched with `-MROnbTest` / `-MRNarrTest` / `-MRAvatarTest` / `-MRAnimTest`, and the drivers refuse the default slots. Runtime gates (`UMRNarrativeSubsystem::RegisterBundle`, the registrar, `LoadActive`) refuse fixtures in a Production process, and shipping builds are always Production.

## Open items / rule for new fixtures
1. **Decide** whether `L_MR_AnimationTest`, `L_MR_AvatarCreator`, `L_MR_AvatarSpawnTest` and the 8 `DISPOSABLE_DIAG_*` maps (development-only, not fixture-marked) should also be never-cooked or relocated under one `Dev` folder so a single folder entry covers them. (Relocation changes asset paths used by docs and test commands, so it needs approval.)
2. **Recommend** compiling the dev test drivers and fixture builders out of Shipping (`#if !UE_BUILD_SHIPPING`) — a code change, not made here.
3. **Rule for new fixtures:** any new TEST_FIXTURE asset must either live under `/Game/MoonRacer/Narrative/Generated/TEST_FIXTURE_*` (already covered by a new entry per bundle id) or get its own `DirectoriesToNeverCook` line in the same commit. A cheap guard is to re-run the `-CookAll` comparison above.
4. Re-run the cook comparison whenever the packaging settings, the default map, or the Generated folder layout changes.
