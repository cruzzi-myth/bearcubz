# Phase 3B — P0–P4 implementation notes (canon-independent onboarding foundation)

Companion to `Phase3B_Onboarding_Architecture.md`. Everything here is local, offline-first, and uses only **TEST FIXTURE — NONCANON** content.

## Scope verification (authorization vs. architecture document)

| Authorization | Built | Not built (outside the authorized list) |
|---|---|---|
| P0 foundation + dev test environment | `Source/MoonRacer/Onboarding/`, dev map `L_MR_OnboardingDev`, `DA_MR_OnboardingFlow`, dev world driver | A separate engine module (kept inside the existing `MoonRacer` module to avoid build-config changes) |
| P1 state machine (11 states) | `UMROnboardingSubsystem`, transition rules, resume router, safe recovery function | HUD, objective tracker, subtitles, pause-menu "return to safe spawn" UI, on-screen debug overlay (a debug *string* is exposed) |
| P2 checkpoint persistence | `UMRProgressSaveGame`, A/B slots, generations, checksums, migration, integrity envelope | — |
| P3 interfaces | 8 interfaces + fixture implementations | Any live Passport / Supabase / website connection |
| P4 recovery & testing | 20 automation tests + 4 world processes | — |

Deliberately **not** implemented (pending decisions): D-4 (avatar editing after onboarding), D-5 (arrival replay option), D-7 (mid-dialogue resume), D-8 (`PASSPORT_HANDOFF`), online enforcement of D-2, any local→server sync (D-3).
A failed cinematic is recorded with `bArrivalSkippedUnavailable` so resume validation stays consistent; nothing replays it.

## Design deviations from the architecture document

1. **Flow data asset** carries content IDs only. The spine/transition structure is code-defined and test-validated (not table-driven).
2. **Integrity envelope.** Progress files are `MRPG | format | length | CRC32 | payload` written via temp-file + rename. Reason: Unreal's `UGameplayStatics::LoadGameFromSlot` hard-asserts (engine crash) on a garbage `.sav`. The envelope is verified before any engine deserialisation.
3. **Resume always re-runs ACCESS_CHECK and PASSPORT_CHECK** (identity is re-resolved each launch); anything past CORE_SPAWN re-runs CORE_SPAWN first at the recorded safe spawn.
4. **Avatar revisit.** If the avatar is missing/replaced, later progress is kept; AVATAR_CHECK is passed through again and the stored reference is refreshed.
5. Additive hook: `UMRAvatarSaveSubsystem::OnAvatarSaved` (fired after a validated, written save).

## Known issue found — RESOLVED by Phase 3A maintenance (avatar save integrity)

`UMRAvatarSaveSubsystem` used `UGameplayStatics::LoadGameFromSlot`, which hard-asserts on corrupted data. It now reads through `MRSaveIntegrity` (`Avatar/MRSaveIntegrity.*`): new saves are `MRAV | format | length | CRC32 | payload`, written temp-file + atomic replace; legacy raw saves are loaded only after full structural validation; anything unverifiable is rejected, preserved untouched, and a default avatar is used. Tests: `MoonRacer.AvatarSave.*`.

## Dev-test safety

Drivers (`-MRAvatarTest`, `-MROnbTest`) **refuse to run** against the default slots (`MRAvatar_Local`, `MRProgress_Local_*`) and require `-MRAvatarSlot=` / `-MRProgressSlot=`. (An earlier set of my test launches wrote fixture data to the default slots because the slot arguments were not applied; those three files were moved to the session scratchpad quarantine, and this guard was added.)

## Commands

```
# automation (logic, persistence, resume, fixtures)
UnrealEditor-Cmd MoonRacer.uproject -ExecCmds="Automation RunTests MoonRacer; Quit" -unattended -nullrhi -nosplash -nosound
# world processes (use literal arguments; dedicated slots are mandatory)
UnrealEditor.app/Contents/MacOS/UnrealEditor MoonRacer.uproject /Game/MoonRacer/Maps/L_MR_OnboardingDev -game -windowed \
  -MRProgressSlot=MRProgress_DevAcceptance -MRAvatarSlot=MRAvatar_OnbDev [-MRProgressFresh -MRAvatarFresh] -MROnbTest=partial|resume|returning|corrupt
```
