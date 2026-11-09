import { assert, importCompiled, report } from './runner.mjs';

const mod = await importCompiled(new URL('../../src/features/portal-host/nyxCharacterState.ts', import.meta.url).pathname);
const { NYX_SEQUENCES, NYX_STATUS_LABELS, NYX_POSE_MANIFEST, AVAILABLE_NYX_POSES } = mod;

const VALID_STATES = ['idle', 'greeting', 'listening', 'thinking', 'speaking', 'presenting', 'error'];

assert(
  'every named sequence only ever uses a valid character state',
  Object.values(NYX_SEQUENCES).every((steps) => steps.every((s) => VALID_STATES.includes(s.state))),
);

assert(
  'every sequence eventually settles back to idle — nothing leaves Nyx permanently stuck',
  Object.values(NYX_SEQUENCES).every((steps) => steps[steps.length - 1].state === 'idle'),
);

assert(
  'every sequence\'s delays are strictly non-decreasing (no step scheduled before the one before it)',
  Object.values(NYX_SEQUENCES).every((steps) => steps.every((s, i) => i === 0 || s.afterMs >= steps[i - 1].afterMs)),
);

assert('the four real, event-driven sequences all exist', ['greet', 'listenThenSpeak', 'present', 'fail'].every((k) => Array.isArray(NYX_SEQUENCES[k])));

assert(
  'fail() leads with the error state, never buries it mid-sequence',
  NYX_SEQUENCES.fail[0].state === 'error',
);

assert(
  'every valid state has a status label entry (idle is explicitly null, not missing)',
  VALID_STATES.every((s) => Object.prototype.hasOwnProperty.call(NYX_STATUS_LABELS, s)),
);
assert('idle has no status override — the header falls back to her static role line', NYX_STATUS_LABELS.idle === null);
assert(
  'every non-idle status label is a real, non-empty string',
  VALID_STATES.filter((s) => s !== 'idle').every((s) => typeof NYX_STATUS_LABELS[s] === 'string' && NYX_STATUS_LABELS[s].length > 0),
);

assert(
  'the pose manifest documents exactly one distinctly-named future file per state',
  VALID_STATES.every((s) => typeof NYX_POSE_MANIFEST[s] === 'string') &&
    new Set(VALID_STATES.map((s) => NYX_POSE_MANIFEST[s])).size === VALID_STATES.length,
);
assert(
  'every manifest path follows the documented nyx-<state> naming convention',
  VALID_STATES.every((s) => NYX_POSE_MANIFEST[s] === `assets/signal-portal/characters/nyx-${s}.webp`),
);

assert(
  'AVAILABLE_NYX_POSES is empty today — confirmed no distinct pose files exist yet, so every state must fall back to the single standalone artwork',
  Object.keys(AVAILABLE_NYX_POSES).length === 0,
);

report('nyxCharacterState (Stage K1.6A.2 reaction-state vocabulary)');
