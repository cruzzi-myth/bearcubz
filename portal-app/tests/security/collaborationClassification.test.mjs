import { assert, importCompiled, report } from './runner.mjs';

const mod = await importCompiled(new URL('../../src/lib/collaborationClassification.ts', import.meta.url).pathname);
const { classifyCollaboration, CLASSIFICATION_META, isStorableClassification, STORABLE_CLASSIFICATIONS } = mod;

// --- Stage K1.5B: the authoritative column exists now. An explicit
// value always wins, and always matches what was actually stored —
// never re-derived from bpm/key once `classification` is present in
// the input at all (even as null). ---
assert('explicit track wins even with no bpm/key', classifyCollaboration({ classification: 'track', bpm: null, musicalKey: null }) === 'track');
assert('explicit music_video wins even with bpm/key set (classification never re-derived from metadata)', classifyCollaboration({ classification: 'music_video', bpm: 128, musicalKey: 'C' }) === 'music_video');
assert('explicit artwork wins', classifyCollaboration({ classification: 'artwork', bpm: null, musicalKey: null }) === 'artwork');
assert(
  'explicit null -> unclassified, even when bpm/key ARE set (authoritative NULL never falls back to the heuristic)',
  classifyCollaboration({ classification: null, bpm: 96, musicalKey: 'A minor' }) === 'unclassified',
);

// --- transition fallback: `classification` key omitted entirely (not
// yet migrated caller) still gets the old Stage K1.4 heuristic, never
// a crash. This is the ONLY path the heuristic can still reach. ---
assert('classification omitted, bpm set -> heuristic fallback: track', classifyCollaboration({ bpm: 96, musicalKey: null }) === 'track');
assert('classification omitted, key set -> heuristic fallback: track', classifyCollaboration({ bpm: null, musicalKey: 'A♭ minor' }) === 'track');
assert('classification omitted, neither set -> heuristic fallback: unclassified', classifyCollaboration({ bpm: null, musicalKey: null }) === 'unclassified');
assert('classification omitted, musicalKey whitespace-only -> treated as absent', classifyCollaboration({ bpm: null, musicalKey: '   ' }) === 'unclassified');
assert('classification omitted, bpm of 0 still counts as "set" -> track', classifyCollaboration({ bpm: 0, musicalKey: null }) === 'track');

// --- never trust an invalid/garbage classification value — it must
// behave as "omitted" (heuristic), not be passed through verbatim. ---
assert(
  'invalid classification string is never returned as-is (falls through to heuristic)',
  classifyCollaboration({ classification: 'bogus', bpm: 96, musicalKey: null }) === 'track',
);

// --- validator used before ever sending a value to the admin API ---
assert('isStorableClassification accepts the three real values', ['track', 'music_video', 'artwork'].every((v) => isStorableClassification(v) === true));
assert('isStorableClassification rejects null/undefined/garbage/empty string', [null, undefined, 'bogus', '', 'TRACK', 0].every((v) => isStorableClassification(v) === false));
assert('STORABLE_CLASSIFICATIONS has exactly the three approved values, no more', STORABLE_CLASSIFICATIONS.length === 3);

// --- every classification the brief names has a real, distinct UI meaning ---
assert('track/music_video/artwork/unclassified all have a label', ['track', 'music_video', 'artwork', 'unclassified'].every((k) => typeof CLASSIFICATION_META[k].label === 'string'));
assert('each classification has a distinct accent token', new Set(Object.values(CLASSIFICATION_META).map((m) => m.accentVar)).size === 4);

report('collaborationClassification (Stage K1.5B authoritative classification + transition heuristic)');
