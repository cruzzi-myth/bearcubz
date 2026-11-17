# Moon Racer Asset Bible — classification & naming proposal (for owner review)

Status: **proposal only.** The Asset Bible (`/Users/bearcubz/Desktop/image_asset_biblev1.2/`) was read, not modified. No UUID filename is renamed or proposed for rename in place; the proposal is a mapping table + a rule set for *new* organisation that the owner may adopt.
Scope: `04_3D_SOURCE_ASSETS/{ENVIRONMENTS,OBJECTS,VEHICLES}` (plus the duplicates in `CHARACTERS/CUSTOMIZATION`). Companion: `AvatarCreatorV2_AV2-D8_Asset_Audit.md`.

Method and confidence: every file was decoded (0 corrupt, 0 empty). Contents were classified from **downscaled contact sheets I viewed** (tile ≈ 400×225), so titles on small UIs were read at low resolution. Confidence: **High** = byte-identical to a named file or unambiguous title; **Med** = title legible on the contact sheet; **Low** = inferred from layout; **Unclassified** = awaiting full-size visual review. "n/a" alpha = opaque. UUID names are preserved.

## 1. Summary

| Folder | Files | Unique (MD5) | What they actually are |
|---|---|---|---|
| ENVIRONMENTS | 55 | 54 (one " 2" copy) | **Almost no environments.** UI screen mock-ups (≈35), avatar-creator screens (11, all duplicates of AvatarCreatorV2 files), one crest sheet, a few vehicle/weapon UI pages. Not playable-location art. |
| OBJECTS | 14 | 12 | Icon / relic / weapon / helmet catalog sheets; 3 of them duplicate ENVIRONMENTS files |
| VEHICLES | 8 | 7 | Vehicle contact sheets and "legendary vehicle" cards |
| (CHARACTERS/CUSTOMIZATION) | 17 | — | Fully duplicated from ENVIRONMENTS/OBJECTS; no unique content |

No file in these folders is a 3D asset. None is a verified playable location.

## 2. ENVIRONMENTS — per-file table

Dimensions in px. α = file has alpha. **Proposed names are suggestions for owner review**; they follow the rule in §5.

| UUID (file `.png`) | Size | α | Proposed descriptive name | Conf. |
|---|---|---|---|---|
| 020FF614-8FFF-4008-B622-1906EB259E51 | 1374×1145 | n | ui_discovery_exploration_journal | Med |
| 07226C9F-C631-405D-A3CC-92F848861F20 | 1536×1024 | n | ui_artifacts_collection | Med |
| 0AD2DFE9-6DC6-4913-A6D5-4472F786D284 | 1672×941 | n | **= AvatarCreatorV2/avatar_creation_human_male** | High |
| 0B450759-075F-41AC-BE94-5A1CBEBEDDF4 | 1536×1024 | n | ui_race_selection_worlds | Med |
| 0E532AC3-DF52-4020-9E67-33F42D528D0C | 1536×1024 | n | ui_artifacts_oracle_shard | Med |
| 0FD83CC3-32E0-48EA-88F3-3A9D94929A74 | 1536×1024 | n | ui_weapons_catalog | Med |
| 109260DD-7D93-4FF2-96B9-80BEEBEEEC67 | 1374×1145 | n | ui_galactic_commerce | Med |
| 143AADDC-DD5E-47C4-BED8-8B8DCF3AEC91 | 1672×941 | n | ui_vehicle_selection_grid (also in OBJECTS) | Med |
| 192C97DB-CD23-4C55-A319-A76A056B9E30 | 1536×1024 | n | ui_moon_racer_tribe | Med |
| 2430BD61-8841-48FF-A5EF-782270CFFE03 | 1374×1145 | n | ui_companions_relationships | Med |
| 2654D4A7-3814-4C75-B4D2-AA5FDA9CC709 | 1536×1024 | n | ui_faction_reputation | Med |
| 2A361011-2D33-498C-948F-1B3986F64F06 | 1536×1024 | n | ui_romeos_castle | Med |
| 2BDE3844-0D58-4DB9-ABCA-6514475F5228 | 1536×1024 | n | ui_planet_arrival_aurelith_5 | Med |
| 2C08F99A-E781-4872-93F9-D75A99C50AC4 | 1672×941 | n | **= AvatarCreatorV2/avatar_creation_human_female_overview** | High |
| 2F1FAD79-9ABD-42F7-970F-21A6F4701D67 | 1536×1024 | n | ui_signal_deep_signal | Med |
| 3669448F-3EE9-4159-90D7-4ADA68F943D1 | 1672×941 | n | **= AvatarCreatorV2/avatar_creation_human_face** | High |
| 3A8196AB-DD3D-40F3-98BA-82E52C1B2897 | 1536×1024 | **y** | ui_relics_collection (alpha not verified as clean) | Low |
| 3B8CA148-8B65-4913-9AD8-360FDB32E561 | 1536×1024 | n | ui_vehicle_customization | Med |
| 3F47D8BC-9E18-4D62-B697-A5CBCF50B192 | 1536×1024 | n | ui_multiplayer_network | Med |
| 40D2D513-4688-4CAF-821A-9269A6B71BFE | 1374×1145 | n | ui_crafting_modding_enchantment | Med |
| 42D64EE0-B4BB-494E-B665-20A164842C81 | 1672×941 | n | **= AvatarCreatorV2/finalize_avatar_screen** | High |
| 458B1ECB-1637-40C6-A543-CB20B26DE6F3 | 1536×1024 | n | ui_galactic_static | Med |
| 4B5E96B7-177C-4FE1-9FAB-85069B4529A3 | 1536×1024 | n | ui_residential_district | Med |
| 4E0C573A-B8E4-466D-8395-E3200952C1FD | 1536×1024 | n | ui_missions_job_board | Med |
| 5369A673-94DE-4CD3-BC3C-EDA887DC29C5 | 1671×941 | n | **= AvatarCreatorV2/avatar_creation_mythraxian_face** | High |
| 59FE14DB-0255-4795-9419-DFF00DF6365D | 1774×887 | n | concept_all_house_and_guild_crests (**concept, unapproved**) | Med |
| 5CCA6A67-7FE4-4D0F-9496-646A8E39D569 (+ " 2" copy) | 1672×941 | n | **= AvatarCreatorV2/avatar_crest_reverification**; the " 2" file is an exact duplicate | High |
| 5E221193-D1EB-4299-BEB1-FB63069FEC1C | 1024×1536 | n | ui_vehicle_showroom_portrait | Low |
| 5F8FADED-8BA1-4C60-B47C-2AA1AE3CE9E4 | 1670×941 | n | **= AvatarCreatorV2/avatar_creation_mythraxian** | High |
| 744B444A-B4C2-4BCD-AD1F-21516C98E84B | 1536×1024 | n | ui_vehicles_built_for_more (also in VEHICLES) | Med |
| 79E9D997-C402-4E85-BAA7-4E73E1D3F6B1 | 1672×941 | n | **= AvatarCreatorV2/avatar_creation_glitch** | High |
| 7B78CB51-C2A7-4A4C-8ADE-AB61B387AAE3 | 1536×1024 | n | ui_moon_racer_tribe_variant | Med |
| 7C73C7C1-B756-4FB1-9E12-E85AE27EBEAB | 1672×941 | n | **= AvatarCreatorV2/avatar_creation_crest_selection** | High |
| 865EAA48-0351-49C4-9C1F-3C337B38AD09 | 1536×1024 | n | ui_race_selection_variant | Low |
| 8F963CD0-0F43-46E5-BC2B-1F74B764BBE9 | 1536×1024 | n | ui_vehicle_garage_hero | Low |
| 8FD66EEC-876D-4279-84B5-6ED5C1EA4444 | 1536×1024 | n | ui_death_defeat_recovery | Med |
| 92846D1F-3652-467F-947D-6E34B9E54354 | 1536×1024 | n | ui_weapons_armory_collage (also OBJECTS, CUSTOMIZATION) | Med |
| A37D4EC1-9292-4DA4-B39A-B3F5687A3422 | 1536×1024 | n | ui_player_apartment | Med |
| A3CF43B5-91A9-492F-8EBD-1BED79E0A1B8 | 1536×1024 | n | ui_blacklight_square | Med |
| A677D8D9-3DF7-43F6-95A4-5525FCF4EDAE | 1536×1024 | n | ui_core_transit_stations | Med |
| A7BA3212-8F78-4559-83C5-A1B974DB464C | 1536×1024 | n | ui_skills_abilities | Med |
| A8DB4C26-5E5B-471A-9D80-FCEF35DA18CA | 1536×1024 | n | ui_artifact_detail_oracle_shard | Med |
| AAB1FEA0-D4BC-435D-A001-86B877745F59 | 1536×1024 | n | ui_weapons_catalog_variant (also OBJECTS) | Med |
| AB480501-227C-45DC-B829-4E2C7095921E | 1374×1145 | n | ui_racing_career_circuits | Med |
| AEC3A563-C9C7-4471-99A2-88372C9E475A | 1672×941 | n | **= AvatarCreatorV2/avatar_creation_alien_male** | High |
| B12CE9F3-9236-4FF3-86B1-6A014EF05F31 | 1536×1024 | **y** | ui_racing_helmets_catalog | Med |
| B4110E79-6528-40FB-B433-68681056E02B | 1536×1024 | n | ui_artifacts_collection_variant | Med |
| B8191C2A-2FCD-4AB9-A61E-7C14A0026209 | 1374×1145 | n | ui_mission_recover_republic_data | Med |
| C4DFFDCD-7D74-4016-B7E7-BFB8B33E49EE | 1536×1024 | n | ui_artifacts_oracle_shard_variant | Med |
| C6C944C9-920D-4632-9168-3140C61D57BA | 1672×941 | n | **= AvatarCreatorV2/avatar_creation_human_female** | High |
| C9306015-AD9D-4FB6-A08A-7B508E32DA80 | 1536×1024 | n | ui_storage | Med |
| E927EEB5-D83C-4D3C-9962-53BA3CC57D41 | 1536×1024 | n | ui_race_selection_variant_2 | Low |
| EA05FD70-0C0A-48E9-9D20-018D3CF72AEA | 1536×1024 | n | ui_lower_core | Med |
| EA7936EC-5378-4F35-912F-7A3D11734430 | 1536×1024 | n | ui_republic_law_system | Med |

Note: "Race Selection", "Tribe", "Faction Reputation", "Vehicle Customization" — the menus named in the AV2-D8 shared-UI task — are **here**, in ENVIRONMENTS, under UUID names (`2654D4A7…` faction reputation, `192C97DB…`/`7B78CB51…` tribe, `3B8CA148…` vehicle customization). They are not environments. Because titles were read from contact sheets, confirm at full size before relying on a name.

## 3. OBJECTS and VEHICLES

| UUID | Size | α | Proposed name | Conf. |
|---|---|---|---|---|
| OBJECTS/0CBB10AF-5340-4BFE-A563-B34D06095E11 | 1536×1024 | y | catalog_weapons_collage | Med |
| OBJECTS/0F01B0BA-5141-4778-88A6-F728966E97FE | 1536×1024 | y | catalog_icon_glyph_sheet | Low |
| OBJECTS/31BC3A87-56FB-4DEA-B721-3CF4E3433A80 | 1536×1024 | y | catalog_relics_on_colour | Low |
| OBJECTS/3C27C086-E4DB-483D-A13F-866818DDA2A7 | 1536×1024 | n | catalog_relics_checkerboard_baked | Med |
| OBJECTS/45AFDBA2-FFA0-4370-99F6-7DF08C00655E | 1536×1024 | n | catalog_relics_checkerboard_baked_violet | Med |
| OBJECTS/6C6A66E3-6A9A-43BC-AAA9-383AC45EBE99 | 1536×1024 | y | catalog_relics_on_colour_2 | Low |
| OBJECTS/70994ACD-91D6-4379-9D7E-AE55CAAD1DF9 | 1536×1024 | y | catalog_items_resources | Low |
| OBJECTS/98FF2998-7B77-43AB-89D3-AE3ED993FFE0 | 1536×1024 | y | catalog_crystals_artifacts | Low |
| OBJECTS/A09525B8-F55D-483E-905F-F6599F00840E | 1536×1024 | y | catalog_relics_of_the_beyond | Med |
| OBJECTS/DB225DFB-… and F822B2CB-… (byte-identical pair, also in CUSTOMIZATION) | 1536×1024 | y | catalog_firearms_collage | Med |
| OBJECTS/143AADDC-…, 92846D1F-…, AAB1FEA0-… | — | — | duplicates of ENVIRONMENTS files (§4) | High |
| VEHICLES/3DFE593F-B356-430A-ADD1-8AE79F1D44C0 | 1536×1024 | y | vehicles_legendary_cards | Med |
| VEHICLES/645BCEA3-9FBC-4CB4-8EFB-B4BAF283EED3 | 1536×1024 | y | vehicles_collage_glow | Low |
| VEHICLES/856EE826-C781-4B0E-A96F-090F9465B94B | 1536×1024 | y | vehicles_parts_wheels_collage | Low |
| VEHICLES/9188A9B2-7A4D-4388-8A96-8ECD5FFF6A1B | 1536×1024 | y | vehicles_bikes_collage | Low |
| VEHICLES/AD32603E-481F-4AC5-A3F8-39870498CB34 | 1536×1024 | y | vehicles_dense_collage | Low |
| VEHICLES/C9A43893-FE82-4795-B9BD-8B046F6837F8 | 1536×1024 | **n** | vehicles_catalog_checkerboard_baked | Med |
| VEHICLES/FA17BADB-2ECA-4C3D-8ED3-DCDE74608A39 | 1536×1024 | **n** | vehicles_legendary_cards_checkerboard_baked | Med |
| VEHICLES/744B444A-… | — | — | duplicate of ENVIRONMENTS/744B444A (§4) | High |

**Baked checkerboard:** four files (`OBJECTS/3C27C086…`, `OBJECTS/45AFDBA2…`, `VEHICLES/C9A43893…`, `VEHICLES/FA17BADB…`) show a grey-white checker *as pixels* with no alpha; the "transparency" is fake and must not be used as a cut-out. All are catalog sheets with several items per image — **none** is a single extractable object, 3D model or UV texture.

## 4. Duplicates (byte-identical, MD5)

Groups (each = same bytes): ENVIRONMENTS/143AADDC ↔ OBJECTS/143AADDC; ENVIRONMENTS/744B444A ↔ VEHICLES/744B444A; ENVIRONMENTS/AAB1FEA0 ↔ OBJECTS/AAB1FEA0; ENVIRONMENTS/92846D1F ↔ OBJECTS/92846D1F ↔ CHARACTERS/CUSTOMIZATION/92846D1F; ENVIRONMENTS/5CCA6A67 ↔ ENVIRONMENTS/5CCA6A67 "2" ↔ CHARACTERS/CUSTOMIZATION/5CCA6A67 ↔ AvatarCreatorV2/avatar_crest_reverification; OBJECTS/DB225DFB ↔ OBJECTS/F822B2CB ↔ CUSTOMIZATION/DB225DFB ↔ CUSTOMIZATION/F822B2CB; and 10 triples ENVIRONMENTS ↔ CHARACTERS/CUSTOMIZATION ↔ AvatarCreatorV2 (0AD2DFE9, 2C08F99A, 3669448F, 42D64EE0, 5369A673, 5F8FADED, 79E9D997, 7C73C7C1, AEC3A563, C6C944C9). Seventeen files in `CHARACTERS/CUSTOMIZATION` are fully redundant except `526611AC…`, `6B1A840C…`, `76284BB2…` (not matched to any duplicate group; **unclassified**, awaiting visual review).
Similarity-level duplicates (same layout, different bytes, e.g. two Tribe menus, three Race Selection variants) were noted by eye only.

## 5. Proposed rules (owner to approve before anything moves)

1. **Never rename UUID files in place.** Add a sidecar manifest (`ASSET_CLASSIFICATION.csv`: uuid, proposed_name, category, confidence, canon_status, duplicate_of).
2. Category prefixes: `ui_` (menu mock-ups), `concept_` (art without runtime use), `catalog_` (multi-item sheets), `ref_` (reference), `src_` (future real source: `.fbx/.blend/.uasset`).
3. Move candidates, **proposed only**: ENVIRONMENTS `ui_*` → a `UI_REFERENCE/` area; avatar-creator screens → leave under AvatarCreatorV2; keep a single copy and replace duplicates with the manifest entry **after** owner approval.
4. Reserve `ENVIRONMENTS/` for real environment art (none exists today).
5. Fix naming irregularities when the folder is next curated: `avatar_reference_phots` → `…photos`; consistent separators; `Human_female_hairstyles` case; `human_male-eyes_dark`; `alien_female_BASE 2.png` (space).
6. Mark every file with a `canon_status` (`concept|reference|approved`); nothing is `approved` until the owner says so.

## 6. Open items

* **[D-CLS-1]** Approve rules 1–6, or provide different ones.
* **[D-CLS-2]** Confirm the Low/Med-confidence titles at full resolution (a ~15-minute visual pass).
* **[D-CLS-3]** `CHARACTERS/CUSTOMIZATION/526611AC…`, `6B1A840C…`, `76284BB2…` remain unclassified.
* **[D-CLS-4]** Whether an environment concept folder exists elsewhere (e.g. `00_REFERENCE_ASSETS/CORE`, `GAMEPLAY/`): this audit covered only the three folders requested.
