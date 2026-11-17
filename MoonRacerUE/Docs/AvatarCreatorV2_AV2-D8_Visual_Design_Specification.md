# Avatar Creator V2 — AV2-D8 visual design specification

Status: **design only.** Nothing implemented; V1 creator, onboarding V1/V2, checkpoint V2, saves, manifests, Asset Bible untouched. Extends (does not replace) `Docs/AvatarCreatorV2_Design_AV2-D1_to_D7.md`, which is unchanged. Companions: `…_AV2-D8_Asset_Requirements.md`, `…_AV2-D8_Implementation_Roadmap.md`, `…_AV2-D8_Asset_Audit.md`.

## 0. Reference intake (Task 2)

Asset Bible root used (read-only): `/Users/bearcubz/Desktop/image_asset_biblev1.2/` (not a listed workspace folder; found by search; **[D-AUD-1]**).

| # | Requested reference | Status | Where / how inspected |
|---|---|---|---|
| 1 | Updated cryosleep chamber | **Inspected** (as it appears *inside* the creator screens; there is no standalone chamber image) | `04_3D_SOURCE_ASSETS/AvatarCreatorV2/avatar_creation_human_male.png`, `…human_female.png`, `…_overview.png` |
| 2 | Full customization screen | **Inspected** | `avatar_creation_human_male.png`, `_human_face.png`, `_mythraxian*.png`, `_alien_male.png`, `_glitch.png` |
| 3 | Final confirmation | **Inspected** | `finalize_avatar_screen.png` |
| 4 | Faction Reputation menu | **Found, inspected at contact-sheet size only** | `ENVIRONMENTS/2654D4A7-3814-4C75-B4D2-AA5FDA9CC709.png` (Med) |
| 5 | Tribe menu | **Found, contact-sheet size only** | `ENVIRONMENTS/192C97DB-….png`, `7B78CB51-….png` |
| 6 | Vehicle customization | **Found, contact-sheet size only** | `ENVIRONMENTS/3B8CA148-….png`; also `00_REFERENCE_ASSETS/GAMEPLAY/VEHICLE_GARAGE/mr_vehicles_and_garages_neon_cyberpunk_garage_customization.png` (not opened) |
| 7 | Other menus | Found, contact-sheet size only: Artifacts, Weapons, Missions, Storage, Race Selection, Skills, Companions, etc. | classification proposal §2 |

Not substituted: no website or SIGNAL PORTAL artwork was used. Not verified: **menu pixel values** (colours, fonts, exact geometry) — the menu images were viewed only as ~400 px tiles, so §10 values are *pending verification* unless stated as observed. Still missing: a standalone chamber **environment** concept (no walkable-bay art, no side/rear views of the pod); any turnaround of the characters; any approved crest art.
**Reference intake list (what the owner should supply or confirm):** (a) full-resolution versions of the menu references in rows 4–7 or confirm the UUID files are authoritative; (b) a chamber environment concept with sightlines to the pod from side/rear and an empty-pod version; (c) the station facility name (canon); (d) approved House list and crest art; (e) typeface files/names used by the UI; (f) any voice-asset plan.

## 1. Review of D1–D7 and reconciliations (Task 1)

Preserved unchanged: capability-gated controls; ids-only saves; MRAV integrity; default-slot guard; no gameplay attributes; V1 stays until V2 validated; onboarding untouched; crest = separate record with immutable original and append-only history; no faction fields.

| # | D1–D7 says | New direction / reference shows | Proposed reconciliation (not silently applied) |
|---|---|---|---|
| R1 | Seven stages (Appearance, Identity, Origin & Background, Voice, Presets, House Crest, Final Review) | Six stages; 14 categories; screens show tabs Appearance / Identity / House & Crest / Background / Voice / Finalize | Adopt **six stages** (§2). Origin/Background/Voice collapse into **Identity** (category 14: sub-tabs *Name & Callsign · Origin & Background · Voice*), keeping every earlier requirement. Presets become a **utility** (top-bar Presets + Save Preset), not a stage. |
| R2 | Appearance sub-stages Species, Body, Face, Hair, Clothing, Accessories | 14 categories incl. Markings, Skin & Surface, Augmentations, Colors & Materials, Ears & Horns | Keep all old items; new categories are **shown but capability-gated** (most unavailable today). |
| R3 | Chamber location unresolved; no Core signage | Reference signage reads "THE CORE", "THE CORE CRYOSLEEP FACILITY", "SECTOR 00 – THE CORE" | **Correct** to a neutral placeholder `[STATION FACILITY — NAME PENDING CANON]`. Never use "Core" on the chamber. |
| R4 | No gameplay attributes | Reference has **Gameplay Attributes** tab, House Benefits (Alignment/Influence/Reputation), "Alignment: Lawful Neutral", Role | **Omit** those. Not in V2. Final review shows no alignment/benefit/reputation. |
| R5 | Origin Affiliation vs crest separate (D-A2) | Screen shows "House Obsidian" next to "Role/Background" | Keep **House** (crest system) and **origin affiliation** separate; the review shows them in separate rows. |
| R6 | Crest record: original/active crest only | Task 6: **Original House / Active House** + crests + history + authorized checkpoint | Extend the crest record by a **House id pair**; ids are opaque strings from an approved list (empty today). No names or ids invented. |
| R7 | Name/callsign scope **[D-A3]** | Screen shows "Name, callsign, **pronouns**" and Gender, Height, Build | Name+callsign local (decided). **Pronouns, gender, height cm, build label are not in the schema**; they stay hidden until approved **[D-D8-4]**. Height may only be a cosmetic scale; never a stat. |
| R8 | Hair/eyes etc. by id | Reference shows hair **parameters** (Length, Volume, Texture, Fade, Flow, Messiness), colour tabs, effects (Bioluminescent), intensity | Treated as future capability; shown **disabled with reason** until hair assets with such parameters exist. |
| R9 | Crest cosmetic variants | Screens show Crest Style/Color, Emblem/Frame/Accents/Material/FX | Cosmetic variants allowed **only if approved** **[D-D8-5]**; default none. |
| R10 | Presets stage | "Quick Presets: Racer/Explorer/Merchant/Legend" | Those imply **class/role**; they would look gameplay-linked. Presets are **appearance-only** looks; role-named presets are removed pending decision **[D-D8-6]**. |
| R11 | Species display names | Screen says "RACE & BASE", "Race / Origin: Glitch (Human Augmented)" | Use **Species**; ids unchanged; no "(Human Augmented)" text unless canon. |
| R12 | Cryosleep chamber ≠ gameplay HUD | Top nav bar (Map, Missions, Crew…, Credits 48,250, ONLINE) | Omit; creator is pre-gameplay. |
| R13 | Final review exists | "Export" button, "Randomize Variation" | Export deferred (needs file/PII policy **[D-D8-7]**); randomize allowed, appearance only. |
| R14 | Camera per stage | Screens show **View** thumbnails (face, head, back, full) | Adopt as the **camera preset strip** (§4). |

## 2. Information architecture (Task 3)

**Fourteen categories → six stages**

| Stage | Categories |
|---|---|
| 1 Species & Base | 01 Species & Base |
| 2 Appearance | 02 Body · 03 Head Shape · 04 Facial Features · 05 Ears & Horns · 06 Hair & Styles · 07 Markings & Patterns · 08 Eyes · 09 Skin & Surface · 10 Augmentations |
| 3 Style & Gear | 11 Attire & Armor · 12 Colors & Materials (Accessories live in 11) |
| 4 House Crest | 13 House Crest |
| 5 Identity | 14 Identity & Profile (Name & Callsign · Origin & Background · Voice) |
| 6 Final Review | summary only |

**Navigation hierarchy.** Left rail: 14 numbered categories (the numbering in the reference), grouped by stage; bottom stage bar: six steps with progress; top bar: title, Presets, Import/Export (deferred), Settings, Help. Clicking a category selects it; stage Next/Back moves between stages in order but any visited category is freely re-enterable. Final Review is reachable only when all **required** categories are valid.

**Selected-category behaviour.** Exactly one category is active; the right panel shows only that category's controls (D2 rule); the camera glides to the category's preset (§4); the left rail marks active (highlight), complete (tick), invalid (warning), unavailable (dimmed, tooltip with reason).

**Contextual panel layout.** Header (category name + reset-category) → option tabs (e.g. Hair Style / Length / Colour) → thumbnail grid (paged) → parameter sliders → colour/material block. A section that has no supported content collapses to a single line "Not available for this species/body — <reason>".

**Preview thumbnails.** Generated from the **live asset** (render-target capture of the asset on the current body with neutral lighting) — not from static art; fallback: a labelled placeholder tile. Thumbnails are non-interactive until the option is `DevPlaceholder` or `Approved`; `Pending` tiles are shown disabled.

**Sliders and selectors.** Slider: label, track, diamond handle, numeric readout, per-slider reset, keyboard ±1 / ±10; range and default come from the asset's morph definition (never from the UI). Selector: tile grid with a selected state, arrows/paging, optional search. Toggle for binary variants. Colour: swatch row + hue strip + RGB/hex entry, clamped to the allowed palette if the asset restricts it.

**Camera controls.** Rail of icon buttons (recentre, zoom +/−, pan, fullscreen/hide-UI) plus **View** preset thumbnails (Full, Head, Back, …); drag = orbit, wheel = zoom, right-drag = pan within limits, double-click = reset. Gamepad: stick orbit, triggers zoom, shoulder buttons cycle presets.

**Randomization.** *Randomize stage* and *Randomize all*. Only touches **supported** controls; respects locks (per-control padlock); deterministic seed shown so a result can be reproduced; always undoable (one-step undo/redo history of 20). Never randomizes identity text, House, or species unless explicitly selected.

**Reset.** *Reset category* (right-panel), *Reset stage*, *Reset all* (modal confirm). Reset returns to the species/body defaults from the catalog, not to blank; never touches Identity text or House unless the stage reset targets them; House original selection is **not resettable** once finalized (§6).

**Save/Load presets.** Preset = appearance snapshot (ids + slider values + colours); **excludes** name, callsign, House, origin, voice. Local file list with name, date, species/body; Load validates against the current catalog and reports unsupported entries ("3 of 12 options unavailable — skipped"). A preset from a different species is refused or partially applied only with a modal explanation. Presets live outside the avatar save, with the same integrity envelope; they never write to avatar slots.

**Final confirmation.** §8.

**Back-navigation behaviour.** Back (stage bar) never discards edits. Leaving the creator (Exit) with unsaved edits → modal Save draft / Discard / Cancel. Backing out of Final Review keeps all state. Draft autosave is a separate "draft" record, not the committed avatar, and cannot overwrite a finalized avatar. Escape = Back one level (modal → panel → creator exit confirm).

**Validation & error states.** Per-field inline (red outline + message), per-category badge, per-stage gating, and a Final Review checklist. States: *valid*, *warning* (placeholder/pending asset in use), *error* (blocks), *unavailable*, *loading*, *load-failed* (asset missing → falls back to default and flags). Error text always names the field and the fix. Never silent-correct a save: any repair is reported (existing `Reconcile`/`Validate` behaviour in the V1 catalog is reused).

**No gameplay statistics.** Body/head/face morphs are cosmetic; nothing in the creator reads or writes attributes, and no tooltip implies an effect.

## 3. Species customization capability matrix (Task 5)

Classes — **A** supported by existing implementation · **B** possible but needs new assets · **C** needs a species-specific rig/morph/material system · **D** not applicable / awaiting approval.

Common facts: the six canonical ids exist in the catalog, all **Unassessed** (no species 3D model). Bodies are Manny/Quinn dev meshes only. No morph, groom or modular clothing assets exist (verified in project and Bible). 2D species concept sheets exist for all six species (eyes/hair/outfits; AI and Mythraxian have no sex split; Mythraxian lacks a signal-accent sheet) but **are not 3D assets**.

| Feature | human | hybrid | ai | alien | mythraxian | glitch |
|---|---|---|---|---|---|---|
| Species id selection | **A** | **A** | **A** | **A** | **A** | **A** |
| Body base | **A** dev (Manny/Quinn) → B for real m/f | B | B/C | C | C | B/C |
| Body proportions | B | C | C | C | C | C |
| Head & face morphs | B | C | C (non-organic head?) **D** until canon | C | C | C |
| Eyes | B (id slot exists, no asset) | B | B/C (emissive) | C | C | C |
| Hair | B | B | D (concept shows hair-like forms; **canon unconfirmed**) | C/D | C/D | B/C |
| Horns & ears | D | D/C | D | C | C | D |
| Skin & surface | B | C | C (synthetic) | C | C | C |
| Markings | B | C | C | C | C | C |
| Cybernetic augmentations | B | C | **D/B** (a body that is already synthetic: canon) | C | C | C |
| Clothing | B (outfit id slot exists, Pending) | B/C | B/C | C | C | B/C |
| Armor | B | B/C | B/C | C | C | B/C |
| Accessories | **A** (rigid static meshes at attachment points, placeholder) | A | A | A if skeleton compatible, else C | C | A |
| Colour customization | B (accent/material slots exist, no assets) | B | B | B | B | B |
| Visual effects | B (emissive) | B | B/C | C | C | C (glitch FX) |

Rules: a cell is **functional only when its supporting asset/implementation is named** — today only "Species id selection", "Body base (dev)" and "Accessories (placeholder)" qualify (class A). All others are unavailable in the UI. Manny/Quinn are labelled development placeholders in the UI ("Development body — not a Moon Racer design"). Ears/Horns and Ear-related ranges for non-human species are **canon-dependent (D)** and not assumed.

## 4. Cryosleep environment (Task 4) — design only

**Location.** Aboard the Galactic Space Station; facility name canon-pending (`[STATION FACILITY — NAME PENDING CANON]`); no location id; **never "Core"**. No claim of being a playable level: it is a creator stage.

**Geometry (approximate, for greybox).** Pod: cylinder ≈ 1.2–1.4 m inside diameter, ≈ 2.6 m glass height, pedestal ring ≈ 2.2 m outer diameter and ≈ 0.35 m high, overhead collar ring ≈ 0.4 m. Character stands at pod centre (0,0,0), facing +X with ±15° idle sway only. Chamber bay behind the pod ≈ 10 m wide × 8 m deep × 6 m high, with a balcony/gantry at ≈ 3.5 m, a 4 × 3 m station window (optional), and side wall equipment racks. Figures are starting values for the greybox, not canon dimensions.

**Cameras** (orbit rig, spring arm; focus point at the avatar; limits below are proposals):
| Preset | Focus | Distance | Pitch | Yaw | FOV |
|---|---|---|---|---|---|
| Full body (default) | pelvis→head centre | 3.2–4.0 m | −5…+10° | ±180° free | 40° |
| Face close-up | eye height | 0.7–1.1 m | −15…+15° | ±60° | 28° |
| Head & shoulders | upper chest | 1.4–1.8 m | −10…+10° | ±90° | 32° |
| Side | mid-body | 3.0–3.6 m | 0° | locked at ±90° with ±20° free | 38° |
| Rear | mid-body | 3.0–3.6 m | 0° | 180° with ±20° free | 38° |
| Feet/boots | knee→floor | 1.4–1.8 m | +5…+25° | ±90° | 34° |
Zoom limits clamp per preset; the camera never enters the glass; transitions 0.35–0.5 s ease-in-out; reduce-motion → cut. Pod glass is excluded from the character's depth/refraction at close-up to keep the face unobstructed (glass fades to ≈ 15 % opacity inside 1.2 m).

**Lighting layers.** (1) Key: soft cool-white spot, ≈ 5600 K, from front-high-left; (2) Cyan rim from behind-left and behind-right (emissive pod rings drive it); (3) Violet/magenta kicker low from the sides; (4) Selective **gold** accent only on crest/rank/props (not on the character by default); (5) Fill from a faint bounce card; (6) Ambient dim station cyan; (7) Per-stage tweak (face stage brightens key, lowers rim). Values: pending look-dev; no colour hex claims from the references.

**Glass, vapor, holograms.** Glass: translucent with thin-film reflections and subtle edge Fresnel, no refraction on the character; Vapor: low-lying volumetric/ flipbook mist at the pedestal, drifting 0.05 m/s; HUD hologram elements anchored on the pod ring (readout rings, scan line) and in-world monitors in the background; **no** holograms across the face.

**Background machinery / ambient animation.** Slow ring rotation, pulsing emissives (0.2–0.5 Hz), steam venting every 12–20 s, distant staff silhouettes as billboards or looping cards, blinking console lights, a faint pod hum. Everything optional-quality tiered.

**Audio & feedback.** Pod hum loop, vapor hiss on stage change, soft UI ticks for hover/select, a low confirm tone, stinger for Finalize; spatial: monitors/ambience. Interaction feedback: rotating camera produces a faint servo sound; haptics none (PC). Volume bus separate from gameplay; respects mute.

**Performance & scalability.** Targets: 60 fps at 1080p on the project's development Mac; budget ≈ 6 ms for the environment. Tiers (Low/Med/High): Low = baked light, no volumetrics, billboard crowd off; Med = a few dynamic lights, flipbook vapor; High = volumetric fog and screen-space reflections. Character LOD0 forced in view; capture-thumbnails use a low-res render target (256²) updated on demand. Camera never leaves a small volume, so occlusion/streaming is trivial. All numbers are budgets for validation, not measured.

**Not decided here:** exact bay layout, station window content, crowd presence, and whether the pod is "open" before/after — all **[D-D8-8 environment concept]**.

## 5. Character identity (Task 7)

Name and callsign are **local character data**; no Passport read/write, no network identity. Origin affiliation independent of House. Origin/background lists are **canon-dependent and ship empty** (the UI offers "Skip" or a placeholder). Voice is design-only until supported voice assets exist (disabled).

| Field | Rule |
|---|---|
| Character name | required; Unicode letters, spaces, `'`, `-`, `.`; trimmed; collapse repeated spaces; length 2–24 (proposal); NFC-normalize; no leading/trailing punctuation; no control/format/zero-width characters; no layout-breaking length |
| Callsign | optional; 2–16; letters, digits, `-` `_`; case-preserved; unique **locally** only; may not equal an empty name |
| Moderation | profanity/impersonation check is policy-level; out of scope until a Passport/network design exists; the local build only does syntax validation |
| Origin / background | choose from an approved list (empty now → stays unset); stored as an opaque id; unknown id from a save → shown as "Unavailable", never auto-changed |
| Affiliation | separate from House; free of faction/reputation effects |
| Voice (optional) | selection stored as an id; `None` default; unavailable options not selectable |
| Save/restore | identity lives in a separate versioned record keyed by `AvatarId`; absent record = unset (legacy compatible); partial loads report which fields were repaired; never overwrite another save's name |
| Errors | inline message per field; Finalize stays disabled while the name is invalid |

Pronouns/gender fields appear in the reference but are **not** in scope **[D-D8-4]**.

## 6. House Crest system (Task 6)

* **Selection UI.** Grid of **approved** Houses only (empty list today → the stage shows "House selection is not available yet" and does not block Finalize **[D-D8-9]**). Selecting a tile shows an **official crest preview** panel (name and motto only if canon provides them) and a Select/Selected button. No benefits, alignment, influence or reputation text.
* **Records (conceptual; separate versioned record keyed by `AvatarId`, additive to D1–D7).** `OriginalHouseId`, `ActiveHouseId`, `OriginalCrestId`, `ActiveCrestId`, `SelectionHistory[]` (append-only: sequence, house id, crest id, utc time, reason code, checkpoint token), `AuthorizedChangeCheckpoint` (empty until approved). All ids opaque strings from an approved registry; none defined here.
* **Original vs active.** At creation they are equal. Original is immutable after Finalize; Active changes only when a checkpoint token from the approved list is presented. The review screen shows the **Original**; a later "House" display may show Active.
* **Crest on equipment.** A crest badge decal/slot on outfit/armor (shoulder, chest) driven by `ActiveCrestId`; cosmetic only; missing badge socket → no crest, no error. Crest cosmetic variations (frame, colour, material, FX) **only if approved**; default none.
* **History & persistence.** Append-only; each entry integrity-checked; a corrupt tail is reported and excluded, never silently deleted. 
* **Future checkpoint integration.** The creator exposes no change path. A later narrative system supplies a checkpoint token; **no checkpoint ids are approved** → every change is refused.
* **Save compatibility.** Absent crest record = legacy avatar; load synthesizes "unset" in memory without writing. Saves never touch faction/reputation data.
* **Failure & rollback.** A crest write is atomic (temp + replace, as the avatar save). If the crest write fails after the avatar write, the avatar remains valid and the House is shown as unset with a retry; if the avatar write fails, no crest is written. A partial history entry is discarded. Finalize is one logical commit with a recovery marker.
* **Not done:** no House names, crest ids, eligibility, faction consequences; the concept-art crest names (e.g. "House Obsidian") are **not canon**.

## 7. Final confirmation (Task 8)

Primary layout = `finalize_avatar_screen.png`: left checklist, centre pod with live avatar, left strip with face/side/rear previews, right summary. 

* **Previews.** Full body (live pod avatar), face close-up, left/right 3/4 and rear: **captured from the live avatar state** on demand into render targets; **no static artwork**. If a capture fails: show a "Preview unavailable" placeholder, never an old image.
* **Checklist (left).** One row per category with ✔ valid, ⚠ placeholder/pending in use, ✖ error.
* **Summary (right).** Name, callsign; species and body summary (display name + "Development body" flag when applicable); original House and crest preview; Origin & background rows (if set); appearance selections (ids → display names); clothing and equipment; colour palette swatches from chosen colours; "visual signature" (decorative waveform) omitted unless it carries real data.
* **Actions.** Back to Edit; Randomize variation (appearance only); Save Preset; Export (deferred); **Finalize Avatar**.
* **Validation before finalizing.** Run the full catalog validation; any **error** blocks; **warnings** (placeholder/pending) require an extra confirm line "This avatar uses development placeholder assets"; verify species id canonical, name valid, default-slot guard, save integrity envelope writable.
* **Failure behaviour.** On write failure keep the creator open with the draft intact, show a specific error (disk, integrity, slot guard), allow retry; never mark onboarding complete.
* **Finalize** writes via the existing avatar save path and raises the **same `OnAvatarSaved` event** the onboarding already uses; nothing else.

## 8. Cinematic ownership (Task 9)

* **Avatar Creator owns** only the local awakening sequence **inside the chamber**: pod opens, lights, vapor release, a 3–6 s presentation of the finalized avatar. It plays **after** a successful save and is skippable.
* **Onboarding owns** the transition from completed character creation into Galactic Space Station gameplay, spawn, and narrative checkpoints.
* **Interface (proposal).** Creator emits `OnAvatarFinalized(AvatarId, SaveRevision)` (equal in effect to the existing `OnAvatarSaved`) and listens for `RequestAwakeningPlayback` and `AwakeningFinished/Skipped/Failed` signals. The creator never calls checkpoint, narrative or onboarding APIs; it never sets a narrative flag. Onboarding decides when to proceed even if the cinematic fails or is skipped; a failed cinematic does not block the save. No change to either onboarding machine; adaptation happens in a later, separately authorized integration step. A cinematic cannot bypass save validation because it is only instantiated from a *saved* state id.

## 9. Shared Moon Racer UI design system (Task 10)

Separation: **O** = observed in the references (contact-sheet or full-size view); **P** = proposed; **PV** = pending verification.

| Area | Observed (O) | Proposed (P) / PV |
|---|---|---|
| Colour | dark near-black navy panels; cyan primary glow/border; violet/magenta secondary glow; selective gold (crests, rank, ornaments); white text | hex values **PV** (no values taken from images); define as tokens: `bg/panel`, `stroke/primary-cyan`, `stroke/secondary-violet`, `accent/gold`, `text/primary`, `text/muted`, `state/ok`, `state/warn`, `state/error` |
| Typography | wide-tracked uppercase headings, condensed sans body, italic stylised "MOON RACER" wordmark, numerals in a larger weight for steps | font families **PV**; proposed hierarchy: Display (title), H1 (category), H2 (section), Body, Caption, Numeric; sizes per 1080p base, min body 14 px at 1080p |
| Panel geometry | angular chamfered corners, thin double line borders with a glowing edge, corner notches | corner chamfer ≈ 8–12 px at 1080p (P), 1–2 px stroke, glow ≤ 6 px |
| Navigation | left numbered list with icons (01–14), active item filled and arrowed; top tabs; bottom numbered stage track with active node ringed | active = cyan/violet fill + arrow; hover = brighter stroke; disabled = 40 % opacity |
| Selection highlight | glowing border (violet in creator, cyan in other menus) | one highlight token per menu family |
| Borders/separators | thin horizontal rules with end-caps | — |
| Icons | thin-line white/cyan glyphs in circles/hexes | 24 px base grid, 2 px stroke; icon set needs authoring |
| Buttons | outlined with glow; primary action filled / brighter ("Finalize Avatar"); icon + label | states: default, hover, pressed, focused, disabled, loading, danger |
| Tooltips | not visible in references | P: 8 px padding, appears 300 ms, max 280 px, never covers avatar centre |
| Sliders | thin track, diamond handle, numeric readout right, label left | P: as §2 |
| Thumbnail cards | square tiles with label, id corner badge ("H01"), expand glyph, paging dots | P: 4×2 grid on the right panel |
| Modals | not visible | P: centred, dimmed backdrop, primary/secondary/cancel; Esc = cancel |
| Motion | not observable from stills | P: hover 120 ms, panel switch 200 ms, camera 350–500 ms, vapor ambient; reduce-motion alternative |
| Accessibility | — | P: contrast ≥ 4.5:1, never rely on colour alone, focus ring 2 px, full keyboard/gamepad path, text scale 90–150 %, colour-blind-safe validity icons |
| Scaling | 16:9 art | P: layout anchored on safe-area fractions; panels use min/max widths; UI scale slider 80–150 %; test 1280×720, 1920×1080, 2560×1440, 3440×1440 |

Shared style, **not identical layouts**: Avatar Creator, Faction Reputation, Tribe and Vehicle Customization share tokens/components; their layouts follow their own tasks.

## 10. Decision register

| ID | Decision | Owner needed |
|---|---|---|
| D-AUD-1 | Confirm authoritative Asset Bible root (`image_asset_biblev1.2`) | owner |
| D-AUD-2 | Confirm `03_ASSET_DOCUMENTATION` does not approve any crest | owner |
| D-D8-1 | Adopt six-stage structure and R1–R14 reconciliations | owner |
| D-D8-2 | Facility name and canon location (replace "THE CORE" signage) | canon |
| D-D8-3 | Approved House list, motto text, crest art | canon |
| D-D8-4 | Pronouns/gender/height/build fields in or out | owner/canon |
| D-D8-5 | Crest cosmetic variations | owner |
| D-D8-6 | Preset naming (Racer/Explorer/Merchant/Legend imply roles) | owner |
| D-D8-7 | Preset/avatar Export, policy for sharing files | owner |
| D-D8-8 | Chamber environment concept (standalone) | art |
| D-D8-9 | Is House selection required to Finalize while the list is empty (proposed: no) | owner |
| D-D8-10 | Hair/eye/skin parameter models (assets define ranges) | art |
| D-D8-11 | UI font/colour tokens: provide or approve extraction from references | art |
| D-D8-12 | Voice assets and policy | canon/audio |
| D-A1…D-A6 | open items from the D1–D7 package (D-A1 partly answered: the reference exists but only inside creator screens) | owner |
| D-HC-1…5 | human 3D production decisions | owner |
