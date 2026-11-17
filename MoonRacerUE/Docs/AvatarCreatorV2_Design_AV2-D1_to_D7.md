# Avatar Creator V2 — design package (MR-UX-AVATAR-V2-001 v1.1 + Addendum 1.2)

Status: **design only.** No code, assets, saves, onboarding, canon or manifests were changed. The existing development Avatar Creator stays the only implemented creator. Items marked **[DECISION]** need approval; items marked **[CANON]** are blocked on narrative/canon and are not invented here.

---

## AV2-D1 — Reference consolidation

**What was available.**
* The two specification documents (v1.1, addendum 1.2).
* The current implementation (`Avatar/MRAvatarTypes.h`, `MRAvatarCatalog.h`, `MRAvatarSaveGame.h`, `MRAvatarCreatorWidget.h`).
* The Moon Racer menu/portal references on the Desktop ("Portal Asset images") for the shared UI language.

**What was NOT available.** The "Updated Cryosleep Chamber image" is not attached to this session and is not in the Asset Bible folders. Nothing below describes that image beyond the specification's own text. **[DECISION D-A1]** supply the image so D5 can be checked against it.

**Facts taken from the specs (used as requirements):**
1. Layout: left navigation / centre 3D avatar + environment / right context panel / bottom stage bar. Resolution-adaptive.
2. Look: dark translucent angular panels, cyan primary highlights, violet/magenta secondary, image-based selectors, consistent hover/select/confirm states, smooth transitions. Shared *style*, not shared layouts.
3. Seven top-level stages: Appearance (Species, Body, Face, Hair/Features, Clothing, Accessories), Identity, Origin & Background, Voice, Presets, Final Review, plus the House Crest experience (addendum).
4. Right panel shows **only** the selected category's controls.
5. Controls must modify only properties the selected asset supports; unsupported controls must not look functional.
6. Must preserve: avatar save integrity, species ids, compatible customization data, onboarding, narrative progression, default-slot protections. No gameplay attribute changes.
7. The canonical environment location is unresolved; the chamber must respect "opening sequence begins aboard the Galactic Space Station" (the reference's Core signage is therefore not copied).

**Reconciliation notes (conflicts/gaps, not resolved here):**
* Spec lists Origin/Background (homeworld, background, affiliation, role) and says "subject to narrative approval". These can imply canon and gameplay; they are designed as **data-driven, empty until approved** (D4).
* Addendum E says a crest grants no faction membership; Origin "Affiliation" would overlap conceptually. **[DECISION D-A2]** keep them separate fields with no automatic coupling.
* Species list uses display names (Human…Glitch); the code already holds the six permanent ids `human, hybrid, ai, alien, mythraxian, glitch`. No new species are introduced.

---

## AV2-D2 — Interface architecture

**Screen regions** (anchored, scale-aware; reference design 16:9, tested conceptually at 16:10, 21:9, and a 1280×720 floor):

| Region | Content | Behaviour |
|---|---|---|
| Left rail | Stage list: Appearance (with sub-tabs Species, Body, Face, Hair/Features, Clothing, Accessories), Identity, Origin, Voice, Presets, House Crest, Final Review | one stage active; completed stages show a check; stages with no supported controls show as "unavailable" and are not enterable |
| Centre | live 3D avatar in the chamber; no panel overlaps the avatar's safe area (centre 40% width) | rotate (drag), zoom (wheel), reset view |
| Right panel | controls for the active stage/sub-tab only | scrolls internally; never grows over the centre safe area |
| Bottom bar | Back / Next stage, Preview toggle (hide UI), Randomize (current stage / all), Reset stage, Confirm (only in Final Review) | Confirm disabled until validation passes |

**Responsive rules.** Panels have min/max widths as a fraction of screen width (left ≈ 18–22 %, right ≈ 24–30 %); below a width threshold the left rail collapses to icons and the right panel narrows; UI scale follows DPI. The centre safe area is a hard constraint used by the camera framing (D3).

**Interaction model.** Mouse and keyboard first (the current creator already supports real mouse events; that behaviour is kept), then gamepad: D-pad moves between rail/panel/bottom regions, shoulder buttons change stage, right stick orbits. Every focusable control shows the same three states: hover (cyan edge), selected (cyan fill + glow), confirming (brief violet pulse). Disabled options are dimmed with a reason tooltip ("no asset for this species").

**Control types** (reusable widgets): image tile selector (outfits, hair, presets, crests), slider with numeric readout and reset, colour swatch grid + custom picker, toggle, text field with validation message, voice sample list with play/stop.

**Accessibility.** Text min size, contrast ≥ 4.5:1 on panels, no information by colour alone, full keyboard path, reduce-motion setting that replaces camera glides with cuts.

**Stage flow and gating.** Stages are free-order except Final Review (requires all *required* stages valid). Required today: Species, Body, Identity name (once Identity exists). Everything else optional. A "dirty" marker shows unsaved changes; leaving via Back asks to keep/discard.

---

## AV2-D3 — Character presentation

**Camera rig.** One orbit camera on a spring arm around a focus point; per-stage presets define *focus height, distance, FOV, yaw offset, and screen-space offset* so the avatar sits in the centre safe area:

| Stage | Framing |
|---|---|
| Species, Body, Clothing | full body, slight low angle |
| Face | head-and-shoulders, focus at eye line |
| Hair/Features | head close-up |
| Accessories | context-sensitive: focus on the attachment point's bone/socket of the selected accessory |
| Final Review | slow cinematic full-body orbit, auto-stops on input |

* Transitions: critically-damped interpolation (≈0.6–0.9 s), interruptible; **never** cuts through the avatar or the pod; collision probe on the arm.
* Rotation/zoom: clamped per stage (e.g. face zoom limited to prevent clipping into the head); a "reset view" control; zoom does not move the avatar off the safe area.
* Idle animation: looping breathing idle (existing humanoid idle); stage-triggered one-shots (turn to profile for Face, hand raise for Accessories) are **optional polish**, not required for validity.
* Lighting: a stable key/rim light rig separate from chamber lighting so colour choices (skin, clothes) are judged fairly; chamber colour lights (cyan/violet) are accents only.
* Preview toggle hides UI; Final Review can show a turntable.
* Performance budget (design target): one skeletal avatar + chamber; no per-frame rebuild of meshes — appearance changes apply on commit of a control change, with a short blend where supported.

---

## AV2-D4 — Customization capability matrix

Legend: **Supported** = representable today by the existing appearance schema/catalog and the humanoid rig. **Extend** = needs an additive schema field plus asset/system work. **Blocked** = needs canon or approved assets. The rule: *a control is shown as functional only if its capability flag is true for the selected species/body asset; otherwise it is hidden or shown disabled with a reason* (a per-option `Capabilities` bitset in the catalog — see D7).

Current implementation facts (code): appearance = `SpeciesId, BodyBaseId, HairId, EyesId, OutfitId, AccessoryIds[], SignalAccentId, MaterialVariantId` + `Revision`/`AvatarId`. Bodies are Epic Manny/Quinn dev meshes on a shared humanoid skeleton. Accessories are rigid static meshes on named attachment points. All six species are **Unassessed** (no species meshes). Status per option: `Pending / DevPlaceholder / Approved`.

| Spec control | Today | Needs | Unreal systems | Status |
|---|---|---|---|---|
| Species (6) | id stored; no species meshes | species body assets | catalog entries, species-specific skeletal meshes/skeletons or shared rig + variants | **Supported (id)** / **Blocked (assets)** |
| Body type | dev Manny/Quinn selection | approved body meshes | catalog `Bodies` | **Supported (dev)** |
| Height, muscularity, proportions, shoulder/torso/chest/waist/hips/limbs | none | body morph targets or bone-scale parameters + schema floats | Morph Targets / Control Rig / bone scaling; clamped ranges; retarget-safe | **Extend** (needs rigged assets) |
| Face presets, face shape, jaw, cheekbones, chin, eyes, nose, mouth | `EyesId` only | facial morph target set (or MetaHuman-style rig) per face asset; presets as morph value sets | Morph Targets, Pose Asset/Control Rig | **Extend / Blocked (assets)** |
| Skin / surface colour | `MaterialVariantId` (discrete) | colour parameters in a material instance (MPC/dynamic MI) + schema colour fields | Material Instance Dynamic | **Extend** |
| Hair styles, hair colour | `HairId` (option list); no colour | hair meshes (cards/groom), colour params | Static/skeletal hair, Groom (optional) | **Supported (id)** / **Extend (colour)** |
| Facial hair, species features | none | meshes per species, compatibility rules | catalog slots + compat table | **Extend / Blocked (species canon)** |
| Tattoos, markings, scars | none | decal/layered material system, mask textures | Material layers / RVT decals | **Extend** |
| Outfit presets, upper/lower, footwear | `OutfitId` (single) | split slots + meshes; material tints | modular skeletal clothing, leader-pose/merged | **Extend** (single outfit is supported today) |
| Clothing colours/materials | `MaterialVariantId` | per-slot colour params | MID | **Extend** |
| Accessories (wearables, head, cosmetic cybernetics) | `AccessoryIds[]` on attachment points | skinned/cosmetic meshes beyond rigid props | attachment points, species-compat | **Supported (rigid dev)** |
| Signal accent | `SignalAccentId` | – | existing | **Supported** |
| Character name, callsign | none | new identity fields; validation (length, charset, profanity policy), uniqueness policy | save schema; UI text input | **Extend** — **[DECISION D-A3]** are names local-only or later tied to Passport? (kept local; no Passport coupling) |
| Homeworld, background, affiliation, role | none | approved option lists | data-driven catalog | **Blocked [CANON]** — UI built but ships empty/hidden |
| Voice select/preview, species-compatible voices | none | voice assets, audio preview, compat table | MetaSounds/Sound Cues | **Blocked (assets)** |
| Presets (appearance, randomize, saved profiles) | none | preset records (appearance snapshots), randomizer respecting capabilities/compat, N saved profiles | schema + store | **Extend** (randomize can ship on supported slots first) |
| Final review, save, return | local save with validation | review stage + confirm flow | existing save + new stage | **Extend (UI only)** |
| House Crest | none | crest catalog (ids, art), original/active/history record | see Crest section | **Extend / Blocked [CANON]** for real crests |

**Capability gating algorithm (design).** For the active species+body asset, `GetCapabilities()` returns the supported control set; the UI builds each stage from that set. A stage with an empty set is shown unavailable. Presets/randomize iterate only over supported, compatible slots. Stored appearance may contain values for controls the asset later loses; they are preserved in the save but not applied (same "Pending" principle the code uses today).

**No gameplay statistics.** All fields are cosmetic. Origin/Background/Role are explicitly **non-mechanical** until separately approved.

---

## AV2-D5 — Cryosleep environment

**Intent.** A believable pod bay, not a backdrop: it should read as a real room around the avatar. **Location is unresolved [CANON]**; per the spec's ordering the creator happens *before* the station sequence, so it must not be authored as "Core". Working label: **TEST_FIXTURE_NONCANON cryosleep bay**, with all signage/text placeholders until canon names the location.

**Spatial layout (relative, no canonical geography):**
* Central cylindrical pod, glass front open for the avatar to stand inside/in front; illuminated circular platform (diameter ≈ 3–4 m) acting as the turntable.
* Overhead scanner ring on a gantry above the platform (animated slow sweep during stage changes; steady during review).
* Walkable background: raised catwalk behind the pod, workstations with holographic screens, industrial pipework; depth layers (foreground rails, mid pod, far catwalk) for parallax during orbit.
* Camera never leaves a bounded volume; walls/props placed to be non-intrusive from every orbit angle.

**Lighting & effects:** cyan primary practicals, violet secondary fill, neutral key/rim dedicated to the avatar (D3); volumetric fog / vapor from pod vents (Niagara, low-cost), light shafts through vapor, holographic UI-style projections in the world (Widget/Niagara planes), emissive strips. **Fallbacks:** a low-cost quality tier (no volumetrics, baked/static lights) so it holds on lower hardware; effects do not affect the avatar's colour readability.

**Physical interaction (non-gameplay):** the platform lights react to hover/selection; the scanner sweeps on species/body changes; the pod door animates open at entry and closes at confirm (transition hook, D6); vents puff on stage change. No physics the player can break.

**Technical approach (design):** a dedicated level `L_MR_AvatarCreatorV2` (not built now), modular kit for pod, gantry, catwalk, with TEST_FIXTURE greybox first; final art through the Asset Bible pipeline after approval. The existing dev creator map stays untouched.

---

## AV2-D6 — Final review, save and transition

**Final Review stage.** Full-body presentation with slow orbit; an "inspect" mode (zoom to face/hands/accessories); a read-only summary list of choices (names of selected options, colours, crest); validation panel showing blocking errors (must fix) and notices (pending-asset options are stored but not shown as applied — same wording principle as today). Buttons: **Return to customization** (goes back to a chosen stage), **Save** (writes progress without finishing), **Confirm** (finalizes).

**Save behaviour (design; extends, never replaces, the present guarantees).**
* Reuse the existing integrity envelope (verified before deserialization), temp-file + atomic replace, read-back, newer-version refusal, backup-before-replace of legacy files, dedicated test slots, default-slot guard.
* Schema: `FMRAvatarAppearance` v1 stays readable forever. V2 adds **optional** sections (body/face parameters, colours, identity, origin, voice, presets) with a schema bump and a pure migration v1→v2 that adds *no* values (everything new = "not set"). A v1 reader sees v2 as newer and refuses to overwrite, exactly as the onboarding v2 files behave.
* Identity/crest/preset-profile data is kept in **separate versioned records** keyed by `AvatarId` (see crest section), so a change in one cannot corrupt another ("avoid overwriting unrelated save data").
* Confirm = validate → write → fire the existing `OnAvatarSaved` event (so onboarding's AVATAR_CHECK/avatar reference work unchanged). `Revision` increments only on confirm. A cancelled/closed creator never touches the saved avatar.

**Transition into onboarding.** The creator ends at the existing hand-off: avatar saved → onboarding receives `AvatarConfirmed`. Visual transition (design): pod closes, scanner sweep, fade to the *approved* next sequence. Because the active onboarding sequence is not to be changed, V2 must **only** emit the same event and leave the destination to whichever flow (v1 or the approved v2) is active. **[DECISION D-A4]** the cinematic between pod and station is a separate canon-dependent deliverable.

**Edits after onboarding.** Re-entering the creator later is a policy question already pending (D-4 avatar editing after onboarding). Not decided here.

---

## House Crest (Addendum 1.2)

**Data model (separate record `MRCrest`, keyed by `AvatarId`):**
```
OriginalCrestId   : stable id, set once at first confirmation, never edited
ActiveCrestId     : the currently displayed crest
ActiveColours     : primary/secondary (cosmetic params for the active crest)
History[]         : append-only entries { CrestId, Colours, ChangedAt, Reason/CheckpointId, PriorActiveCrestId }
SchemaVersion, Revision
```
* Invariants: `OriginalCrestId` immutable; `History` append-only; `ActiveCrestId` must be a valid catalog id; changing active **never** modifies `OriginalCrestId`; history keeps every change.
* Crest ids are **stable opaque ids** from a crest catalog (like the species/option ids); validation rejects unknown ids, preserves unknown-but-well-formed ids from newer builds without applying them.
* Legacy avatars with no crest record load unchanged; "no crest yet" is a valid state and the creator offers selection on next edit/confirm without touching other saves.
* **Authorization of later changes:** a change is accepted only through an API that requires a *checkpoint authorization token id* from an approved list. The list of checkpoints is **empty and undefined** until narrative design approves it **[DECISION D-A5]**; with an empty list, *no* post-creation change is possible (the safe default). The creator's initial selection is the only allowed write outside a checkpoint, and only once.
* **Faction separation:** the crest record has **no** reputation/permission/faction fields. Any mapping crest↔canonical House is a separate table owned by narrative approval **[CANON]**; nothing reads crest data to grant anything.

**UI.** Dedicated stage "House Crest": gallery of image tiles (stable ids), large holographic preview (rotating crest + optional character preview where the crest is shown on gear/banner, only if supported), primary/secondary colour pickers, **Confirm** and **Reset** (reset restores the last saved state, never the original during later edits). A badge shows "Original" vs "Active" when they differ. **No canonical crest art is created here [CANON]**; fixtures use `TEST_FIXTURE_NONCANON` geometric placeholders.

---

## Shared UI language
A small token set (colour, spacing, type scale, panel shape, motion curves) defined once and consumed by all Moon Racer UIs: cyan `primary`, violet/magenta `secondary`, dark translucent `surface`, angular clipped corners, one display font + one body font, standard hover/select/confirm animations. Layouts stay per-system. **[DECISION D-A6]** provide the menu reference files that define the exact tokens (the Desktop "Portal Asset images" are web-portal captures; confirm they are the intended source).

---

## Open decisions / blockers (summary)
D-A1 cryosleep reference image · D-A2 origin affiliation vs crest separation · D-A3 name/callsign scope · D-A4 pod→station transition ownership · D-A5 crest-change checkpoints (undefined ⇒ none allowed) · D-A6 UI token source · **[CANON]** environment location & naming, species assets/features/voices, Origin/Background lists, real crests and any House mapping, avatar editing after onboarding (D-4).

---

## AV2-D7 — Technical implementation plan (draft outline only; becomes actionable after D2–D6 approval)

Bounded phases, each independently testable, each keeping the old creator and v1/v2 onboarding untouched:
1. **V2-0 Schema & capabilities (no UI):** additive appearance v2 (optional sections), pure migration, per-option `Capabilities`, crest record + store with the existing envelope/backup/downgrade tests, default-slot guards. Automation only.
2. **V2-1 UI shell:** shared tokens, region layout, stage rail, capability-driven right panel on greybox, existing supported controls (species/body/hair/eyes/outfit/accessories/accent/material) — parity with the dev creator.
3. **V2-2 Camera & presentation:** orbit rig, per-stage framing, safe-area constraints, review turntable.
4. **V2-3 Chamber (greybox → kit):** `L_MR_AvatarCreatorV2`, lighting tiers, vapor/scanner effects.
5. **V2-4 Identity, presets, randomize, final review:** name/callsign validation, preset records, capability-respecting randomizer, review/save/return/confirm.
6. **V2-5 Crest stage:** gallery, preview, colours, original/active/history, checkpoint-authorized changes (empty list).
7. **V2-6 Extended controls as assets arrive:** morph/colour/tattoo/voice per capability matrix.
8. **V2-7 Integration & validation:** emit the existing `OnAvatarSaved`, run v1/v2 onboarding regressions, save-integrity suites, packaging notes (dev maps/drivers listed for exclusion).

Test strategy: pure-logic automation for schema/migration/capabilities/crest invariants; widget tests via the existing real-mouse driver pattern; world drivers for camera/visual smoke with screenshots; dedicated slots only.

**Not authorized by this document:** code changes, asset imports, canonical crest or species assets, onboarding changes, Core manifest changes.
