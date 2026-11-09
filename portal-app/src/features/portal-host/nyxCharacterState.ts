/**
 * Stage K1.6A.2 — the character-reaction vocabulary, kept as plain
 * data/pure logic (no React, no timers) so it can be unit-tested
 * directly. useNyxCharacterState.ts is the only thing that actually
 * schedules these sequences.
 */
export type NyxCharacterState = 'idle' | 'greeting' | 'listening' | 'thinking' | 'speaking' | 'presenting' | 'error';

export type NyxSequenceStep = { state: NyxCharacterState; afterMs: number };

const IDLE_RETURN_DELAY_MS = 2600;
// Stage K1.6A.2: matchFaq() resolves synchronously -- there is no real
// network round-trip here. This is a short, fixed UI-pacing delay so
// "thinking" is visible for a beat before "speaking", not a simulated
// backend call. It is never lengthened to *look* like real processing.
const THINKING_PACING_MS = 320;
const SPEAKING_HOLD_MS = 420;

/** Every named interaction this app actually has, each as a short,
 * honest sequence of real UI states. Nothing here is triggered except
 * from a real corresponding event in PortalHost.tsx. */
export const NYX_SEQUENCES: Record<'greet' | 'listenThenSpeak' | 'present' | 'fail', NyxSequenceStep[]> = {
  greet: [
    { state: 'greeting', afterMs: 0 },
    { state: 'idle', afterMs: IDLE_RETURN_DELAY_MS },
  ],
  listenThenSpeak: [
    { state: 'listening', afterMs: 0 },
    { state: 'thinking', afterMs: THINKING_PACING_MS },
    { state: 'speaking', afterMs: THINKING_PACING_MS + 220 },
    { state: 'idle', afterMs: THINKING_PACING_MS + 220 + SPEAKING_HOLD_MS + IDLE_RETURN_DELAY_MS },
  ],
  present: [
    { state: 'presenting', afterMs: 0 },
    { state: 'idle', afterMs: IDLE_RETURN_DELAY_MS },
  ],
  fail: [
    { state: 'error', afterMs: 0 },
    { state: 'idle', afterMs: IDLE_RETURN_DELAY_MS },
  ],
};

/** Shown under her name whenever non-null; idle (null) falls back to
 * displaying her static role line instead, so the header never shows
 * two contradictory things at once. */
export const NYX_STATUS_LABELS: Record<NyxCharacterState, string | null> = {
  idle: null,
  greeting: 'Signal established…',
  listening: 'Listening…',
  thinking: 'Processing…',
  speaking: 'Responding…',
  presenting: 'Opening destination…',
  error: 'Connection issue — retrying shortly…',
};

/**
 * Stage K1.6A.2, section 4 — the naming convention for distinct future
 * poses, per the brief. Documentation only: nothing in this file or in
 * PortalHost.tsx loads an image from these paths. Confirmed by direct
 * filesystem search that NONE of these files exist anywhere in this
 * repository today (only nyx-ardent-standalone.webp does) — do not
 * add an entry here without first confirming the real file exists at
 * that exact path in public/assets/signal-portal/characters/.
 */
export const NYX_POSE_MANIFEST: Record<NyxCharacterState, string> = {
  idle: 'assets/signal-portal/characters/nyx-idle.webp',
  greeting: 'assets/signal-portal/characters/nyx-greeting.webp',
  listening: 'assets/signal-portal/characters/nyx-listening.webp',
  thinking: 'assets/signal-portal/characters/nyx-thinking.webp',
  speaking: 'assets/signal-portal/characters/nyx-speaking.webp',
  presenting: 'assets/signal-portal/characters/nyx-presenting.webp',
  error: 'assets/signal-portal/characters/nyx-error.webp',
};

/**
 * The only thing actually wired into rendering (see PortalHost.tsx).
 * Empty today, on purpose — every state currently falls back to
 * PORTAL_HOST_CONFIG.standaloneArtworkSrc, the single real pose that
 * exists. To give a state a genuine distinct pose later: drop the real
 * file in public/assets/signal-portal/characters/ at the path named
 * in NYX_POSE_MANIFEST for that state, then add exactly that one
 * entry here (e.g. `thinking: NYX_POSE_MANIFEST.thinking`). No other
 * code change is required.
 */
export const AVAILABLE_NYX_POSES: Partial<Record<NyxCharacterState, string>> = {};
