# AV2-D8 — Avatar Creator V2 asset audit (read-only)

Status: **audit only.** Nothing was imported, renamed, moved, deleted or modified. No Unreal content, code, saves, onboarding or manifests were touched.
Design context: `Docs/AvatarCreatorV2_Design_AV2-D1_to_D7.md` (unchanged). Companions: `AvatarCreatorV2_Human_Character_Integration_Plan.md`, `MoonRacer_AssetBible_Classification_Proposal.md`.

## 1. Asset Bible root

The Asset Bible is **not** listed among this session's workspace folders. I located it by search:

`/Users/bearcubz/Desktop/image_asset_biblev1.2/` (children: `00_REFERENCE_ASSETS`, `01_RUNTIME_ASSETS`, `02_PROPOSED_ASSETS`, `03_ASSET_DOCUMENTATION`, `04_3D_SOURCE_ASSETS`)

Other folders with similar names exist and were **not** used: `/Users/bearcubz/Desktop/image asset bible/MOON_RACER_IMAGE_ASSET_BIBLE` (no `04_3D_SOURCE_ASSETS`) and `/Users/bearcubz/Desktop/asset bible/MOON_RACER_GAME_ASSET_BIBLE*`. **[D-AUD-1]** owner to confirm `image_asset_biblev1.2` is the authoritative root.

Method: `sips` (dimensions, alpha flag, format), `ffmpeg` (alpha-channel statistics, contact sheets in the session scratchpad only), MD5 for duplicate detection, and direct viewing of the images. All 192 PNGs decode; 0 corrupt/zero-byte. Nothing was written under the Asset Bible.

## 2. The headline finding

`04_3D_SOURCE_ASSETS` contains **192 PNG files and nothing else** (plus 4 `.DS_Store`). There is **no** `.fbx/.glb/.gltf/.usd/.blend/.uasset`, no skeleton, no rig, no morph data, no groom, no animation. Folders `RIGS/HUMANOID`, `RIGS/SPECIES_SPECIFIC`, `ANIMATIONS/{FACIAL,INTERACTIONS,LOCOMOTION}`, `CHARACTERS/NPCS`, `CHARACTERS/SPECIES_VARIANTS` exist and are **empty**. Nothing under "AvatarCreatorV2" is a 3D asset.

## 3. `04_3D_SOURCE_ASSETS/AvatarCreatorV2/` inventory

Folder spelling is as on disk: `avatar_reference_phots` (sic) with `avatar_customizations_with_transparent_background` nested inside it.

### 3.1 Top-level (11 files, 1670–1672 × 941, all opaque) — UI concept screens (2D)

| File | Shows (viewed) |
|---|---|
| avatar_creation_human_male.png | "Avatar Creator V2 — Full customization", hair tab, male in cryosleep pod |
| avatar_creation_human_female.png | Cryosleep, Appearance › Face (sliders), top nav bar, female |
| avatar_creation_human_female_overview.png | Same family as above (see §6 duplicates) |
| avatar_creation_human_face.png | Facial-features screen |
| avatar_creation_mythraxian.png / _face.png | Mythraxian hair/face screens (1670/1671 px wide) |
| avatar_creation_alien_male.png | Alien male hair screen |
| avatar_creation_glitch.png | Glitch screen |
| avatar_creation_crest_selection.png | "Avatar Creator V2" crest selection with 23 named crests |
| avatar_crest_reverification.png | "House & Crest" screen with crest customization + "House benefits" |
| finalize_avatar_screen.png | Final confirmation ("Vexa Null", Glitch, House Obsidian) |

Classification: **2D reference images / UI concept art.** Not textures, not UI assets (text and widgets are baked into the raster). The cryosleep reference the earlier D-A1 decision requested **is now available** (they carry the pod).

### 3.2 `avatar_reference_phots/` (44 files, 1385–1536 wide, opaque except one) — 2D catalog sheets

Per-species sheets: `{species}_{male|female}_{eyes|hairstyles|outfits|signal-accents}.png`. Species covered: **ai** (eyes, hairstyles, hairstyles2, outfits, signal-accents — no sex split), **alien** m/f, **glitch** m/f, **human** m/f, **hybrid** m/f, **mythraxian** (eyes, hairstyles, outfits only — no signal-accents sheet). Human files by exact name:

* Male: `human_male_eyes.png` (1535×1024), `human_male_hairstyles.png` (1536×1024, **the only sheet with an alpha flag**; viewed: 18 labelled hair styles H01–H18 on a baked-in portrait background — see below), `human_male_hair_waves.png`, `human_male_outfits.png` (1402×1122), `human_male_signal-accents.png`, `human_male_signal-accent-minimal.png`.
* Female: `Human_female_hairstyles.png` (capital H), `human_female_hairstyles2.png`, `human_female_eyes.png`, `human_female_outfits.png`, `human_female_signal-accents.png` (all 1536×1024).

Classification: **UI reference / catalog contact sheets** (several styles per image, labels baked in). **Not** individually usable thumbnails; **not** texture sources. Naming irregularities (case, hyphen/underscore, `glitch-female_hairstyles`, `glitch_male_signal_accents`) are noted for the classification proposal, not changed.

Viewed `human_male_hairstyles.png`: eighteen styles (Blonde Dreads (Signal), Dark Dreads, Brown Dreads, Platinum Braids, Black Braids, Ash Blonde Braids, Top Knot, Messy Bun, Half Up/Half Down, Long Waves, Medium Waves, Short Surfer, Short Fade, Blade Fade, Buzz Cut, Shaved, Long Straight, Wet Look), all rendered on the same model wearing sunglasses and an ear implant. These are **concept renders**, and the headers say "player avatar assets /human/racer/hair/" — an intended future path, not an existing asset.

### 3.3 `avatar_customizations_with_transparent_background/` (33 files) — transparent-background renders

All have an alpha channel. Alpha statistics (mean alpha 155–214 of 255, min 0) show **partial/soft transparency across most of the frame — a vignette/halo is baked into the alpha**, so they are *not* clean cut-outs. Viewed: each file is a **complete character render with one option applied** (e.g. `human_male_outfit_cloak.png` = full figure with hair, sunglasses and cloak), **not an isolated layer** that can be stacked.

| Category | Male | Female |
|---|---|---|
| Base | `human_male_base.png` (1024×1536; black T-shirt) | `human_female_base.png` (1024×1536; black tank top) |
| Eyes | `human_male-eyes_dark.png` (hyphen), `human_male_eyes_magenta.png`, `human_male_eyes_scan.png`, `human_male_eyes_visor.png` (all 1024×1536) | `human_female_eyes_amber.png` (1312×1199), `_dark` (1254×1254), `_glow` (1145×1374), `_scan-v2` (1145×1374), `_scan` (1312×1199), `_visor` (1312×1199) |
| Hair | `human_male_hair_braids`, `_crop`, `_crop-v2`, `_shave`, `_waves` (1024×1536) | `human_female_hair_braids` (1145×1374), `_crop` (1312×1199), `_shave`, `_waves` (1145×1374) |
| Outfits | `_outfit_cloak`, `_outfit_racer-jacket`, `_outfit_uniform`, `_outer-rim_outfit` (1024×1536) | `_outer-rim_outfit` (1024×1536), `_outfit_uniform` (1024×1535) — **no cloak, no racer jacket** |
| Signal accents | `_signal_amber`, `_signal_cyan`, `_signal_magenta` (1180×1333) | `_signal_amber` (1025×1535), `_signal_cyan`, `_signal_dark`, `_signal_magenta` (1024×1536) |

Mixed dimensions (6 distinct sizes) mean these cannot be composited as aligned layers without re-registration. Classification: **2D reference/preview renders — usable as design targets and possible marketing/preview stills; unusable as runtime layers, textures, or meshes.**

## 4. Requested checklist answers (items 1–10)

| # | Item | Result |
|---|---|---|
| 1 | Human male base | `…/transparent_background/human_male_base.png`; also `CHARACTERS/HUMANOID_BASES/human_male-base.png` (1024×1536, alpha) and `00_REFERENCE_ASSETS/AVATAR_VISUAL_REFERENCES/HUMAN/MALE/BASE/human_male-base.png`. All 2D. |
| 2 | Human female base | `…/transparent_background/human_female_base.png`; `CHARACTERS/HUMANOID_BASES/female_human-base--img.png` (1024×1536, alpha). All 2D. Note `human_female_base.png` and `female_human-base--img.png` look identical (hash not equal; visually the same render). |
| 3 | Male hair | 5 transparent composites + 1 sheet (18 styles) + `human_male_hair_waves.png` |
| 4 | Female hair | 4 transparent composites + 2 sheets |
| 5 | Eyes | male 4, female 6 composites; one sheet each |
| 6 | Outfits | male 4 composites, female 2 composites; one sheet each |
| 7 | Accessories | **None in AvatarCreatorV2.** Accessory references are elsewhere: `00_REFERENCE_ASSETS/AVATAR_VISUAL_REFERENCES/ACCESSORIES/` (7 sheets, not individually inventoried here) |
| 8 | Skin/material | **No skin or material references exist.** Skin is baked into the renders. "Signal accents" are lighting/colour variants of the whole render |
| 9 | Preview/interface | The 11 top-level creator screens (§3.1) |
| 10 | Other | Species sheets for ai/alien/glitch/hybrid/mythraxian (not in scope of this human-first pass) |

## 5. Interpretation limits

* Image formats/alpha flags describe containers, not usefulness; `hasAlpha=yes` was **not** treated as "transparent layer".
* I did not run any import test; "potential texture source" is a judgement: none of these are tileable or UV-aligned, so **none** qualify.
* The 2D character renders show characters for which no 3D model is supplied anywhere in the Bible or the project.

## 6. Exact-duplicate set (MD5)

The AvatarCreatorV2 top-level screens are byte-identical copies of UUID-named files in `ENVIRONMENTS/` **and** `CHARACTERS/CUSTOMIZATION/` (three copies each): e.g. `AvatarCreatorV2/avatar_creation_human_male.png` = `ENVIRONMENTS/0AD2DFE9-6DC6-4913-A6D5-4472F786D284.png` = `CHARACTERS/CUSTOMIZATION/0AD2DFE9-….png`. Full list in `MoonRacer_AssetBible_Classification_Proposal.md` §4. Since the named copies already exist, UUID copies are redundant but must **not** be deleted by me.

## 7. House Crest asset status (Task 6)

* **Approved crest art: none found.** No folder name or file I inspected marks any crest as approved. `03_ASSET_DOCUMENTATION/` (CANON_STATUS.txt, ASSET_STATUS.txt, …) was **not read** in this audit, so owner should confirm it does not approve any crest **[D-AUD-2]**.
* **Concept crest art exists** (not approved): `ENVIRONMENTS/59FE14DB-0255-4795-9419-DFF00DF6365D.png` (1774×887, opaque; a sheet titled "All House & Guild Crests" with roughly two dozen emblems; exact count not verified), and the in-screen crest grids in `avatar_creation_crest_selection.png` / `avatar_crest_reverification.png` (23 names). These are baked, non-transparent images: unusable as runtime crests.
* The concept screens use names that this project has **not** approved (The Republic, Echolon Racing Federation, Galactic Racing League, House Glacier, House Static, Racer Guilds, The Outer Rim, …, "House Obsidian/Obsidian House"). "House Velyhar" in the male hair screen vs. other names shows internal inconsistency in the concept art. **Do not treat any as canonical.** The designs in the screens also carry alignment/influence/reputation/benefit text, which conflicts with the no-faction-coupling rule (see Visual Design Specification §1).
* Faction/house crest hints exist elsewhere in `00_REFERENCE_ASSETS` (e.g. `CHARACTERS/GLACIER`, `CHARACTERS/HOUSE_OF_RAGER`, `VISUAL_LANGUAGE/HOUSE_OF_RAGER_LANGUAGE`); they were not evaluated as crest sources.
* Therefore: no crest asset is available for implementation; placeholder crests must be labelled `TEST_FIXTURE`.

## 8. Cryosleep chamber reference findings (Task 4)

Viewed: human male, human female (two), face, finalize, crest screens. Consistent elements: central cylindrical glass cryosleep pod on a ring-lit pedestal; cyan emissive rings and rim light, violet/magenta emissive trim, white-blue vapor at pedestal base; dark metallic armature with panel lines; busy background — gantry/balcony, holographic monitors, lab staff, cases/crates, a large window to a planet in some views; character full-height inside the pod, visually dominant; camera slightly low, symmetrical.

**Signage that must be corrected for this location:** "THE CORE / GALACTIC STATION" (wall sign), "THE CORE CRYOSLEEP FACILITY — Identity Initialization Bay 02 — ONLINE" (HUD card), and "SECTOR 00 – THE CORE ONLINE" (top HUD, female screen). Also "CRYOSLEEP / IDENTITY INITIALIZATION BAY 02" is **not** a canonical name; use neutral placeholders (e.g. `[STATION FACILITY NAME — CANON PENDING]`). Gold appears only on crest/rank elements, not on the chamber.

Observed problems for implementation: a top navigation bar with Credits (48,250), Map/Missions/Crew/etc. (gameplay HUD in a pre-gameplay screen), "Gameplay Attributes" tab, "House Benefits" tab, "Alignment: Lawful Neutral", and gender/height/build fields. All are flagged as reconciliations in the Visual Design Specification.

## 9. Environment / Object / Vehicle summary

See `MoonRacer_AssetBible_Classification_Proposal.md`. In short: **`ENVIRONMENTS/` (55 files) contains almost no environments.** It is overwhelmingly UI screen mock-ups (menus), with avatar-creator screens and one crest sheet; `OBJECTS/` (14) are icon/relic/weapon catalog sheets; `VEHICLES/` (8) are vehicle sheets. No playable-location art can be assumed from those folders.

## 10. Unreal project check (Task 3 inputs)

Verified by `find` on `MoonRacerUE/Content` and `grep` on `Source`: skeletal meshes = only Epic `SKM_Manny_Simple`, `SKM_Quinn_Simple`, `SK_Mannequin` (+ `PA_Mannequin`, control rigs `CR_Mannequin_*`); animation blueprint `ABP_MR_Humanoid`; data `DA_MR_AvatarCatalog`, `DA_MR_HumanoidAttachmentPoints`; **no** morph-target, groom or hair assets, and no source code referencing `MorphTarget`/`Groom`. Moon Racer humans therefore have **no** 3D character today. Details in the integration plan.
