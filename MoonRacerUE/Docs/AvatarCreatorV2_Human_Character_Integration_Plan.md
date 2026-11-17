# Avatar Creator V2 — human male / female character integration plan

Status: **planning only.** Nothing imported, no code or save change. Builds on `Docs/AvatarCreatorV2_Design_AV2-D1_to_D7.md` (unchanged; capability-matrix approach preserved) and the findings in `AvatarCreatorV2_AV2-D8_Asset_Audit.md`.

## 1. Feasibility verdict

| Resource | Exists? | Evidence | Class |
|---|---|---|---|
| Human male / female **3D** skeletal mesh | **No** | Bible `04_3D_SOURCE_ASSETS` = 192 PNGs only; project has only Manny/Quinn | missing |
| Moon Racer skeleton / rig | **No** (Epic mannequin skeleton + `CR_Mannequin_*` control rigs) | `Content/Characters/Mannequins` | placeholder |
| Humanoid animation | **Yes, placeholder** (`ABP_MR_Humanoid`, Epic locomotion/pistol/rifle anims) | `Content/MoonRacer/Characters/Animation` | placeholder |
| Morph targets / blendshapes | **No** | no morph assets; no source code references them | missing |
| Hair meshes / grooms | **No** | no assets; no code | missing |
| Modular clothing | **No** (only rigid static-mesh **accessories** on attachment points) | `DA_MR_HumanoidAttachmentPoints`, `MRAvatarCatalog` | partial |
| Materials / textures | Mannequin materials/instances only | `MI_Manny_*`, `MI_Quinn_*` | placeholder |
| Skin/eye/hair material parameter system | **No** | — | missing |
| Avatar catalog + save + creator widget | **Yes** (id-based; Manny/Quinn dev bodies) | `Source/MoonRacer/Avatar/` | existing |

**The 2D files do not provide a working 3D character.** They are concept renders; at best they are visual targets for modelling and look-development.

## 2. One shared architecture, two configurations

* One **customization schema** and one UI; a **character configuration** per (`species=human`, `body=male|female`). A configuration is a data asset listing, per category, the options it supports and their asset references. Categories absent from a configuration render as hidden or disabled-with-reason (D4 rule).
* Both configurations target one shared skeleton (the humanoid skeleton the project already uses; whether it stays the Epic mannequin skeleton or becomes a Moon Racer skeleton is **[D-HC-1]**). Male/female differ by mesh, morph set, option lists and camera presets, not by code.
* Save representation (additive, see D6 of the design doc): current `FMRAvatarAppearance` ids stay valid; new categories live in a versioned extension block. Species id remains `human`; `BodyBaseId` distinguishes male/female (e.g. an id per body, **ids not invented here**).

## 3. Category plan (16 required areas)

Legend: ✔ exists now · ◐ placeholder · ✘ missing. "UE type" = needed Unreal asset type. All "preview" behaviour: change is applied to the live 3D avatar immediately; never to a 2D picture.

| Category | Existing | Missing (human m/f) | UE asset types | Compatibility requirement | Preview behaviour | Save data | Depends on |
|---|---|---|---|---|---|---|---|
| Species | ✔ id `human` in catalog (Unassessed) | assessment, species config | catalog entry + config DA | six canonical ids unchanged | pod avatar swaps; unsupported species show "no model" | `SpeciesId` (exists) | none |
| Body type | ◐ Manny/Quinn dev meshes | real m/f human mesh | `USkeletalMesh`, `USkeleton`/PhysicsAsset | same skeleton as animations | instant mesh swap, same pose | `BodyBaseId` (exists) | 3D body (I3) |
| Body proportions | ✘ | morph targets / skeleton scaling | morph targets or `UPoseAsset`/bone-scale rig | cosmetic only; **no gameplay stats** | slider drives morph live | new sliders block (floats, versioned, clamped) | morph set (I3) |
| Head shape | ✘ | head morphs | morph targets | head mesh topology shared | slider live; face close-up cam | slider block | morphs |
| Facial features | ✘ | face morphs (jaw, cheeks, chin, nose, mouth…) | morph targets, facial pose asset | same; ARKit-style optional | slider live | slider block | morphs |
| Eyes | ◐ id slot only (no asset behind it, Pending) | eye mesh/materials, colour/emissive params | eye material instance, parameters | one eye layout on both m/f | live colour/pattern swap | `EyesId` (exists) + colours | materials |
| Skin & surface | ✘ | skin MI parameters (tint, roughness, scars) | master material + MIs, texture sets | both bodies share UV layout per m/f | live | colour/param block | materials |
| Hair | ◐ id slot (Pending) | hair assets (cards or grooms), hair colour params | `UGroomAsset` or card meshes + hair material | attach to head socket | live swap | `HairId` (exists) + colours | hair assets |
| Markings/patterns | ✘ | decal/texture layers | decal material / layered textures | UV-stable | live | marking ids + colours | skin materials |
| Clothing | ◐ outfit id slot (Pending) | modular garments or full outfits | `USkeletalMesh` garments (+ masks) | skinned to shared skeleton; body-hide masks | live; torso camera | `OutfitId` (exists) | I5 |
| Accessories | ✔ rigid static meshes at attachment points (placeholders) | real art | `UStaticMesh`, sockets | socket names on `DA_MR_HumanoidAttachmentPoints` | live | `AccessoryIds[]` (exists) | none for placeholders |
| Augmentations | ✘ | cybernetic parts | meshes/decals/material layers | socket/mask | live | ids block | I5 |
| Colours & materials | ◐ `SignalAccentId`, `MaterialVariantId` exist (Pending) | colour-parameter material graph | MIs / `UMaterialParameterCollection` | per-asset supported params | live | colours block | materials |
| House Crest | ✘ | crest art (none approved) | `UTexture2D`, decal/badge material | crest on equipment is cosmetic only | crest preview + on-character | separate crest record (D1–D7) | canon art |
| Identity/profile | ✘ | name, callsign, origin, voice | text fields; voice assets (none) | local data only; no Passport | none (text) | identity record | policy |
| Final review | ✘ | review screen | UMG, render targets | previews = real saved state | full-body/face/side/rear from the live avatar | none | all above |

Unsupported rule: any row whose cell is ✘ is **hidden, or shown disabled with the reason string**, never a live-looking control (see also the Visual Design Specification §3).

## 4. Differences and risks specific to male vs female

* The 2D set is **unbalanced**: male has cloak + racer jacket (4 outfits), female only 2 outfit composites; male signal accents 3, female 4 (incl. dark); eyes male 4 vs female 6. A parity decision is needed **[D-HC-2]**.
* Dimension mismatch between files (6 distinct sizes) → even as concept targets, framing differs; modelling should use turnarounds drawn to one spec, not these renders.
* Photoreal skin/hair in the renders implies a high-fidelity pipeline (MetaHuman-class or bespoke); the project has none. **[D-HC-3]** pick the production route (bespoke DCC mesh + morphs; MetaHuman-style; marketplace base) — licensing/rights not assessed here.
* Hair: groom assets cost more at runtime (needs a platform review: this project targets macOS/Metal; Shipping/packaging rules documented elsewhere are unchanged).

## 5. Reusable existing implementation

`MRAvatarCatalog` (option statuses Pending/DevPlaceholder/Approved), `MRAvatarSaveGame` (+ MRAV integrity envelope, atomic replace, legacy-v0 backup, default-slot guard), `MRAvatarCustomizationComponent` (applies ids), `UMRAvatarCreatorWidget` (real mouse), `OnAvatarSaved` (hook onboarding uses). The current widget remains **V1**; V2 is additive.

## 6. Recommended smallest credible next milestone (no canonical art, no narrative)

**"V2 shell on dev meshes."** Using only what exists: build the V2 layout (left nav / chamber viewport / right panel / bottom stage bar) in a **separate map** with a TEST_FIXTURE greybox pod and the *existing* Manny/Quinn body options and *existing* accessory options, applying real changes through the existing component, with every other category hidden or disabled-with-reason. This exercises camera rig, 3D inspection, per-stage cameras, capability gating and save round-trip, without a single new character asset and without touching V1 or onboarding. A parallel *non-code* track starts the real human male/female 3D source brief (see Asset Requirements). Recommended authorization: AV2-I1 + AV2-I2 (see Roadmap).

## 7. Decisions

* **D-HC-1** Skeleton: keep Epic mannequin skeleton or adopt a Moon Racer skeleton?
* **D-HC-2** Male/female option parity target.
* **D-HC-3** Production route for photoreal humans (bespoke / MetaHuman-style / purchased).
* **D-HC-4** Whether the 2D composites may serve as concept targets for modellers (rights/consent unspecified).
* **D-HC-5** Whether height (cm) and "gender" fields from the concept screens exist; the schema today has neither.
