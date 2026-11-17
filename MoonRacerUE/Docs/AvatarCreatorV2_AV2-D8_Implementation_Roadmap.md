# Avatar Creator V2 — AV2-D8 implementation roadmap

Status: **planning labels only.** Nothing implemented; none of these stages is authorized. Context: `AvatarCreatorV2_AV2-D8_Visual_Design_Specification.md`, `…_Asset_Requirements.md`, `AvatarCreatorV2_Human_Character_Integration_Plan.md`, and the D7 outline in `AvatarCreatorV2_Design_AV2-D1_to_D7.md` (V2-0…V2-7), which this roadmap refines but does not replace.

Common rules for every stage: V1 creator and onboarding V1/V2 remain unchanged; new work behind a dev flag in a separate map/mode; the default map and game mode do not change; default-slot guards stay; dedicated test slots; Shipping exclusion of dev-only code is **documented** not configured; no canonical names/ids; fixtures labelled `TEST_FIXTURE_NONCANON`.

Reusable code (all stages): `MRAvatarCatalog`, `MRAvatarSaveGame` + MRAV integrity envelope, `MRAvatarCustomizationComponent`, `UMRAvatarCreatorWidget` (mouse input), `UMRAvatarSaveSubsystem::OnAvatarSaved`, `MRDevGate` pattern from `MROnboardingV2Dev`, automation test harness patterns (`FRig`).

| Stage | Dependencies | Required assets | Missing capability | Acceptance | Test strategy | Save compat. | Risks | Canon blockers |
|---|---|---|---|---|---|---|---|---|
| **AV2-I1 UI foundations + chamber graybox** | none | design tokens (PV), fonts, greybox pod meshes (engine primitives), light rig | shared UI style library (UMG/Slate styles), screen layout host, thumbnail capture | V2 map opens only behind flag; layout regions render at 4 resolutions; greybox pod shown; placeholder labelled; no signage with "Core" | widget/layout automation, screenshot diff on a fixed seed, flag-gating tests | none (no saves) | style drift, font licensing | facility name (use placeholder) |
| **AV2-I2 Camera system + 3D inspection** | I1 | none beyond I1 | orbit rig with per-category presets, limits, reduced-motion | rotate/zoom clamp; 6 presets reachable; no clip into glass; keyboard/gamepad | camera unit tests (limits), PIE manual script, frame-time capture | none | glass depth artefacts at close-up | none |
| **AV2-I3 Species/base capability integration** | I1–I2 | existing dev bodies; real human m/f mesh + skeleton **later** | character-configuration DA, capability gating engine, species gating text | species/body switch applies live; every unsupported control hidden/disabled-with-reason; matrix tests per species | catalog-driven tests: for each species/body assert gating; V1 save round-trip | `SpeciesId`, `BodyBaseId` unchanged | designers expecting controls that don't exist | species assets/canon |
| **AV2-I4 Appearance customization + materials** | I3 + real assets | morph sets, hair, eyes, skin materials | morph/slider runtime, material param pipeline, colour UI | each slider changes the live mesh within limits; reset/random respect locks; undo/redo | morph range tests, determinism of randomization, perf (frame budget) | additive appearance block (versioned); legacy loads unchanged | blocked by 3D art; photoreal hair cost on macOS | none (non-canon art) |
| **AV2-I5 Clothing, armor, accessories, presets** | I3–I4 | garments, accessory meshes | body-hide masks, socket validation, preset store | gear applies without clipping beyond tolerance; preset save/load validates catalog | clipping spot tests, preset round-trip, corrupt preset files | preset files separate from avatar save; no slot overwrite | clipping, asset budget | outfit canon where named |
| **AV2-I6 House Crest + identity** | I1; crest registry **empty** allowed | placeholder crests only | crest record schema, identity validation, UI | with an empty registry the stage degrades gracefully; with fixture crests selection is saved and original immutable; name/callsign validation | schema tests, history append-only tests, failure/rollback tests, no faction writes | new separate crest and identity records; absence = legacy | scope creep into factions | Houses/crests, checkpoint ids, origin/voice lists |
| **AV2-I7 Final review, validation, persistence** | I3–I6 | none new | live preview capture, full validation pass, atomic finalize, `OnAvatarSaved` | previews are live captures; finalize writes once, raises the existing event; failures leave draft; warnings need confirm | end-to-end save/load, failure injection (disk full/corrupt), default-slot refusal, regression of avatar+onboarding suites | commit via existing path; recovery marker | double-write or partial commit | none |
| **AV2-I8 Awakening cinematic + onboarding integration** | I7; **separate authorization** (touches onboarding) | awakening sequence, station transition assets | cinematic player in creator, interface signals (Spec §8), onboarding adapter | cinematic plays after a saved state, skippable, failure does not block; onboarding decides next state | integration tests with v2 onboarding dev flag; never advances checkpoints itself | none beyond I7 | coupling with onboarding state machine | station facility, transition, cinematic canon |

## Smallest useful milestone without canonical assets or narrative

**AV2-I1 + AV2-I2 together ("V2 shell on dev meshes")**, extended minimally with I3's capability gating on the *existing* dev bodies and accessories:

* separate flag-gated map; V2 layout with the 14 categories and six-stage bar (most categories disabled-with-reason),
* greybox pod, light rig, orbit camera with the six presets,
* Species (6 ids), Body (Manny/Quinn dev), Accessories (existing meshes) **really** applied through the existing component and saved through the existing avatar save path to a **dedicated test slot**,
* TEST_FIXTURE labels throughout.

Why: it proves layout, camera, capability gating and save round-trip against real code, needs no new character assets, no canon, no change to V1/onboarding, and its output can be thrown away or built upon.

## Dependencies graph

I1 → I2 → I3 → (I4, I5) → I7 → I8; I6 can start after I1 and finish before I7; real human assets gate I4/I5; canon gates I6/I8.

## Risks (cross-cutting)

1. **No real 3D humans** (largest). 2. UI fidelity vs the baked concept screens (not directly reproducible). 3. Hair/skin cost on macOS. 4. Scope creep into gameplay (class presets, alignment, benefits). 5. Crest/faction coupling. 6. Dual creators diverging (V1 vs V2) until V2 validated. 7. Packaging: dev-only code should be excluded from Shipping later (documented; no config change here).

## Decision register (roadmap-specific)

| ID | Decision |
|---|---|
| D-RM-1 | Authorize AV2-I1+I2 (first milestone) |
| D-RM-2 | Skeleton choice (= D-HC-1) before I3 uses real bodies |
| D-RM-3 | Production route for human 3D (= D-HC-3) |
| D-RM-4 | Authorize an onboarding-adjacent change for I8 later |
| D-RM-5 | UI token/font source (= D-D8-11) |
