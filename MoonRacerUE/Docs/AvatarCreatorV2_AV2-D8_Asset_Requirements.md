# Avatar Creator V2 — AV2-D8 asset requirements

Status: **requirements list only.** No asset created, imported or approved. Context: `AvatarCreatorV2_AV2-D8_Visual_Design_Specification.md`, `AvatarCreatorV2_Human_Character_Integration_Plan.md`, `AvatarCreatorV2_AV2-D8_Asset_Audit.md`.

Legend — **Have**: exists and usable now · **Concept**: 2D reference only (cannot ship) · **Need**: nothing usable exists. Priority: **P0** needed for the first milestone, **P1** first real-character milestone, **P2** later. "Canon" = awaits owner/narrative approval; fixtures must be labelled `TEST_FIXTURE`.

## A. Characters (human first)

| Asset | Spec | Have? | Pri | Canon |
|---|---|---|---|---|
| Human male skeletal mesh | LOD0 ≈ 60–100 k tris target (to be set by budget), shared skeleton, A-pose or T-pose source, UV set for skin/eye/teeth, cloth-hide masks | Concept (`human_male_base.png`) | P1 | no |
| Human female skeletal mesh | as above | Concept (`human_female_base.png`) | P1 | no |
| Skeleton + physics asset | Epic-compatible or Moon Racer skeleton **[D-HC-1]**; socket set matching `DA_MR_HumanoidAttachmentPoints` | Have (Epic placeholder) | P0 | no |
| Body morph set (m/f) | height-neutral cosmetic: mass, muscle, shoulders, waist, hips, limbs; limits/defaults data-driven | Need | P1 | no |
| Head/face morph set (m/f) | head shape, jaw, cheeks, chin, brow, nose, mouth, ears; paired corrective morphs | Need | P1 | no |
| Facial pose / animation | idle blink, breathing; optional expression poses for face close-up | Need | P1 | no |
| Idle/pod animation | standing idle, slight sway, turn-to-camera, awakening animation | Have partial (locomotion only) | P1 | no |
| Eye assets | eye mesh + material (iris, emissive), colour params; designs seen: amber, dark, glow, scan, visor, magenta | Concept (m 4, f 6) | P1 | no |
| Hair assets | per style: groom or hair-card mesh + material; colour/gradient/emissive params. Concept names: Signal Crop, Void Braids, Drift Waves, Static Shave (+ 18 style sheet) | Concept | P1 | no |
| Skin materials | master skin material, tint/roughness/scar params, texture sets per m/f | Need | P1 | no |
| Markings/decals | decal textures, UV-stable | Need | P2 | maybe |
| Augmentation parts | cybernetic ear/eye/arm parts, sockets | Need | P2 | maybe |
| Clothing / armor | skinned garments to the shared skeleton: uniform, racer jacket, signal cloak, outer-rim gear (male 4 / female 2 concepts) | Concept | P1 | no |
| Accessories | static meshes at attachment points | Have placeholders (verify list in catalog) | P0 | no |
| Species 3D (hybrid, ai, alien, mythraxian, glitch) | per species mesh/morph/material | Concept (2D) | P2 | **species look partly canon** |
| Dev bodies | Manny/Quinn | Have | P0 | no |

## B. Environment (chamber)

| Asset | Have? | Pri |
|---|---|---|
| Pod (glass cylinder, ring, pedestal, collar) | Concept (inside creator screens) | P0 as greybox, P1 final |
| Chamber bay kit (walls, gantry, racks, window frame) | Concept | P1 |
| Background props (monitors, crates, consoles) | Concept | P2 |
| Background staff | Concept silhouettes | P2 |
| Vapor FX (flipbook/volumetric) | Need | P1 |
| Glass, emissive, hologram materials | Need | P1 |
| Light rig (key/rim/kicker/fill, presets per stage) | Need | P0 |
| Skybox/space view | Need | P2 |
| Audio: pod hum, vapor hiss, UI ticks, confirm, finalize stinger | Need | P1 |
| Signage | **Need, canon**: facility name pending; no "Core" | P2 |

## C. UI

| Asset | Have? | Pri |
|---|---|---|
| Design tokens (colour/type/space) | PV (not extracted) | P0 |
| Fonts (families, licences) | PV | P0 |
| Panel/frame 9-slice art, button/slider/tab/tile styles | Concept (baked in screens) | P0 |
| Icon set (14 categories, camera tools, validation, stage bar) | Concept | P0/P1 |
| Wordmark/logo | Have (`UI/EMBLEMS_ICONS_SIGNALS/mr_emblems_icons_signals_moon_racer_wordmark_logo.jpeg`) – jpeg, opaque; vector/PNG-alpha source needed | P0 |
| Thumbnails | generated at runtime from live assets | P1 |
| Colour swatch lists | Need | P1 |
| Hover/click/transition sounds | Need | P1 |

## D. House Crest

| Asset | Have? | Pri | Canon |
|---|---|---|---|
| Approved House list | **Need** | — | **yes** |
| Official crest art per House (vector/PNG-alpha, 512²+) | **Concept only** (`ENVIRONMENTS/59FE14DB…`, in-screen grids; opaque, unapproved) | P1 | **yes** |
| Crest badge decal/mesh for equipment | Need | P2 | no |
| Placeholder crests (`TEST_FIXTURE_NONCANON`) for dev | Need | P0 | no |

## E. Data assets (project side)

Character configuration DAs (per species/body) · morph/slider definition DA · hair/eye/skin material parameter definitions · camera preset DA · crest registry DA (empty) · identity validation rules DA. All new, **none** created.

## F. Source-file requirements for any supplied 3D art

Formats: `.fbx` or `.usd(z)` plus textures (PNG/EXR, power-of-two where possible); naming `SKM_MR_Human_Male_Body`, `SK_MR_Humanoid`, etc. (proposal; follow project naming); scale in cm; unit-less or reported; neutral pose; no baked lighting in skin; licences recorded in `ASSET_LICENSES.csv`; no files from the 2D concept art are to be used as textures. Do **not** import until approved.

## G. Gaps summary (to start the real human characters)

Required before any real human customization works: a 3D male body, a 3D female body, a skeleton decision, a morph set, hair, eyes, a skin material, at least one garment per body, and one dev crest placeholder. For the **first milestone** (V2 shell on dev meshes) the only assets needed are: greybox pod, a light rig, placeholder UI styles, and dev crest placeholders — all producible without canon.
