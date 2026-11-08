import { assert, importCompiled, report } from './runner.mjs';

const mod = await importCompiled(new URL('../../src/lib/collaborationClassification.ts', import.meta.url).pathname);
const { classifyCollaboration, CLASSIFICATION_META } = mod;

// --- the actual schema gap: no `classification` column exists today,
// so this is a documented frontend heuristic over bpm/musical_key,
// never a file-type/MIME inference. ---
assert('bpm set, no key -> track', classifyCollaboration({ bpm: 96, musicalKey: null }) === 'track');
assert('key set, no bpm -> track', classifyCollaboration({ bpm: null, musicalKey: 'A♭ minor' }) === 'track');
assert('both bpm and key set -> track', classifyCollaboration({ bpm: 145, musicalKey: 'A♭' }) === 'track');
assert('neither bpm nor key set -> unclassified (never invented)', classifyCollaboration({ bpm: null, musicalKey: null }) === 'unclassified');
assert('musicalKey is whitespace-only -> treated as absent, unclassified', classifyCollaboration({ bpm: null, musicalKey: '   ' }) === 'unclassified');
assert('bpm of 0 still counts as "set" (not null) -> track', classifyCollaboration({ bpm: 0, musicalKey: null }) === 'track');

// --- every classification the brief names has a real, distinct UI meaning ---
assert('track/music_video/artwork/unclassified all have a label', ['track', 'music_video', 'artwork', 'unclassified'].every((k) => typeof CLASSIFICATION_META[k].label === 'string'));
assert('each classification has a distinct accent token', new Set(Object.values(CLASSIFICATION_META).map((m) => m.accentVar)).size === 4);

report('collaborationClassification (Stage K1.4 missing-classification heuristic)');
