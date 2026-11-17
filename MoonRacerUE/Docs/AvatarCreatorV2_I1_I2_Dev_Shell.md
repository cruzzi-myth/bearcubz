# Avatar Creator V2 — I1 + I2: development shell and 3D character preview

Status: **implemented, development-only, experimental.** Baseline: `AvatarCreatorV2_AV2-D8_*`, `AvatarCreatorV2_Human_Character_Integration_Plan.md`, `AvatarCreatorV2_Design_AV2-D1_to_D7.md` (all unchanged). Stages I3–I8 are **not** started. The V1 creator, onboarding V1/V2, narrative, Passport, checkpoints, the default map/game mode and packaging config are unchanged.

## 1. How to run it (explicit development entry point only)

```
/Users/Shared/EpicGames/UE_5.8/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor \
  /ABS/PATH/MoonRacer.uproject /Game/MoonRacer/Maps/L_MR_AvatarCreatorV2Dev \
  -game -windowed -ResX=1280 -ResY=720 -MRAvatarV2Dev
```
Optional: `-MRAvatarSlot=<name>` (must not be `MRAvatar_Local`); default slot is `MRAvatarV2_Dev`. In the editor, start the editor itself with `-MRAvatarV2Dev`, open the map and press Play.

Refusals (creator does not start, nothing is written; reason logged as `MRAV2|REFUSED|…` and shown on screen): no `-MRAvatarV2Dev` flag · Shipping build (compile-time `UE_BUILD_SHIPPING`) · protected default slot. V1 (`L_MR_AvatarCreator`) is still the default creator; `GameDefaultMap`/`GlobalDefaultGameMode` are untouched.

Mouse: **left-drag in the 3D area = orbit**, **wheel = zoom**, bottom bar = view presets (Full body, Face, Upper body, Front, Side, Rear), Reset camera, Zoom ±, six-stage track, Back/Next. Orbit/zoom act only on the camera.

## 2. Files

New (all under `MoonRacerUE/`):
* `Source/MoonRacer/AvatarV2/MRAvatarV2Gate.{h,cpp}` – flag / Shipping / protected-slot gate.
* `…/MRAvatarV2Camera.{h,cpp}` – pure orbit-camera model: 6 views, limits, smoothing, reset, FOV conversion.
* `…/MRAvatarV2Chamber.{h,cpp}` – primitives-only cryosleep-chamber graybox (built at runtime), lights, mist, animation, placeholder labels.
* `…/MRAvatarV2Session.{h,cpp}` – stage/category structure, capability matrix, functional edits via the existing customization component, dev-slot save/load, placeholder House Crest.
* `…/MRUi.{h,cpp}` – shared UI tokens + reusable button/text/panel factory.
* `…/MRAvatarV2Widget.{h,cpp}` – the interface shell.
* `…/MRAvatarV2Controller.{h,cpp}` – game mode + controller (camera, input, session, widget).
* `Source/MoonRacer/Dev/MRAvatarV2TestDriver.{h,cpp}` – world test driver (`-MRAv2Test=customize|restore|interrupt|refuse`).
* `Source/MoonRacer/Tests/MRAvatarV2Tests.cpp` – 8 automation tests (`MoonRacer.AvatarV2.*`).
* `Scripts/Editor/mr_create_avatar_v2_dev_map.py` – creates the map and three dev materials (never overwrites).
* `Content/MoonRacer/Maps/L_MR_AvatarCreatorV2Dev.umap` (game mode override = `AMRAvatarV2GameMode`; contains only a PlayerStart and the chamber actor).
* `Content/MoonRacer/AvatarV2Dev/M_MR_AV2Dev_{Lit,Emissive,Translucent}.uasset` – development materials (NONCANON).

Modified: none of the existing source files and no existing asset. (`Docs/Phase3B_P5B3A_Shipping_Exclusion_Followup.md` gained an AV2 addendum; document only.)

## 3. Design decisions

* **Chamber.** ~150 engine-primitive meshes, 8 lights (1 shadow caster), animated emissive pulses, rotating hologram rings, drifting vapor discs, ring-lit platform, glass cylinder (fades as the camera approaches), pillars/braces/ring beam, room with back-wall window and planet sphere, gantry, consoles, racks. Gold appears only as a selective accent. A fixed-exposure post-process volume keeps glow subordinate. **Signage** reads "AVATAR CREATOR V2 – DEV GRAYBOX / STATION FACILITY [NAME PENDING CANON] / NONCANON PLACEHOLDER GEOMETRY"; no mention of The Core, no location id.
* **Character.** The existing `BP_MR_AvatarPlayerCharacter` (Manny/Quinn on the shared skeleton) stands at the platform centre facing the front camera; movement is disabled and the controller re-pins it each tick if anything moves it.
* **Camera.** View presets from AV2-D8 §4 (vertical FOV, converted to the engine's horizontal FOV for the window aspect). Per-view yaw/pitch/zoom limits; exponential smoothing without overshoot; reduce-motion snaps; "never inside the character".
* **UI.** Left rail shows the 14 numbered categories (LIVE / PART / N/A tags generated from the capability matrix); the right panel shows only the selected category; the bottom bar has the six-stage track. Token values are **proposed**, not measured from references (as the specification says).
* **Honesty rule.** A control is shown only if the session can make the real asset respond. Everything else is explained in text ("NOT AVAILABLE (and why)"), never drawn as a disabled-looking fake slider.

## 4. What is functional vs unavailable

| Category | State | Backing |
|---|---|---|
| 01 Species & Base | LIVE | six canonical species **ids** recorded and saved; every species shares the same development body (stated in the UI) |
| 02 Body | PART | Manny/Quinn development bodies swap the real skeletal mesh; no proportion sliders |
| 11 Attire & Armor | PART | rigid dev prop accessories on Moon Racer attachment points (real components); outfits are Pending → unavailable |
| 12 Colors & Materials | PART | `dev_default`/`dev_alt` material variant swaps the real material slot; accents/colour pickers unavailable |
| 13 House Crest | PART | NONCANON placeholder crests, session memory only |
| 03–10, 14 | N/A | no morph targets, hair/eye/skin/marking/augmentation assets, or identity record exist; each lists the reason |

## 5. House Crest placeholder behaviour
Three crests named `TEST_FIXTURE_NONCANON_CREST_A/B/C`. Choosing one sets **Original = Active** (provisional). Saving the avatar locks the Original for the session ("set at creation, immutable"). Locked → `SelectCrest` refuses with the checkpoint message. **No post-creation change path exists** (`AreCrestChangesAvailable()` is `false`; no checkpoints are approved). Not persisted: no crest file is written (checked), no faction/reputation/gameplay link, no House names or ids invented.

## 6. Save isolation
V2 writes only through the existing `UMRAvatarSaveSubsystem` to a dedicated dev slot (`MRAvatarV2_Dev` or the explicit `-MRAvatarSlot`); the game mode sets the slot override and `EndPlay` clears it so PIE does not leak it. The session refuses `MRAvatar_Local` on initialize and on save. All existing integrity behaviour (MRAV envelope, temp + atomic replace, legacy backup, newer-version guard) is reused unchanged. No new on-disk format was introduced.

## 7. Known limitations (honest)
* Dev bodies only (Manny/Quinn); no human male/female model, no morphs, hair, skin, eyes, clothing, markings, augmentations, name/callsign, origin, voice, presets, randomize, preview captures, finalize or onboarding hand-off (I3+).
* Keyboard/gamepad navigation is not implemented (mouse only), as in V1.
* UI token colours/fonts are proposed development values, not extracted from reference art.
* Glass fade, vapor and glow are tuned for a 1280×720 development window; no performance measurement was done (runs used a fixed 60 FPS time step, which does not measure cost).
* The chamber is built at runtime (the map is nearly empty in the editor viewport).
* `-MRAV2EV=` and `-MRAV2LightScale=` are dev-only tuning arguments.
