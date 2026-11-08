/**
 * Stage K1.4 → K1.5B — project classification (TRACK / MUSIC VIDEO /
 * ARTWORK / UNCLASSIFIED).
 *
 * Stage K1.5B applied the authoritative `collaborations.classification`
 * column (dev only — see supabase/migrations/20261108080000_...). This
 * resolver now treats that column as the single source of truth: an
 * explicit value always wins, and an explicit NULL means UNCLASSIFIED
 * — never re-derived from bpm/musical_key once the column is actually
 * present in the query result.
 *
 * The bpm/musical_key heuristic (Stage K1.4's original mechanism) is
 * kept ONLY as a transition fallback for a caller that hasn't been
 * migrated to select the new column yet (`classification` key absent
 * from the input entirely, as opposed to present-and-null) — every
 * consumer has now been updated (Stage K1.5B), so this branch is dead
 * in practice today and exists purely so a not-yet-updated caller
 * elsewhere in the codebase degrades to the old behavior instead of
 * crashing. Retire it entirely in a separately reviewed cleanup once
 * every production caller is confirmed migrated (see the K1.5A
 * architecture report's "safe transition plan").
 *
 * MUSIC VIDEO is now a selectable, storable classification (the
 * column and its CHECK constraint already allow it) even though no
 * video asset type or storage bucket exists yet — classification and
 * asset-type support are independent, by design (K1.5A §F).
 */
export type Classification = 'track' | 'music_video' | 'artwork' | 'unclassified';

/** The exact set of values the database CHECK constraint allows,
 * excluding null/unclassified — used to validate a value before ever
 * sending it to the admin API, so a typo fails fast in the browser
 * instead of round-tripping to the Edge Function only to be rejected
 * there too. */
export const STORABLE_CLASSIFICATIONS = ['track', 'music_video', 'artwork'] as const;
export type StorableClassification = (typeof STORABLE_CLASSIFICATIONS)[number];

export function isStorableClassification(value: unknown): value is StorableClassification {
  return typeof value === 'string' && (STORABLE_CLASSIFICATIONS as readonly string[]).includes(value);
}

export type ClassificationMeta = {
  label: string;
  glyph: string;
  accentVar: string;
};

export const CLASSIFICATION_META: Record<Classification, ClassificationMeta> = {
  track: { label: 'Track', glyph: '♫', accentVar: '--cyan' },
  music_video: { label: 'Music Video', glyph: '▶', accentVar: '--pink' },
  artwork: { label: 'Artwork', glyph: '◆', accentVar: '--purple' },
  // Stage K1.4: deliberately the fully-opaque --sp-ink token, not the
  // faint/muted one -- axe caught a real 3.16:1 color-contrast failure
  // when this used --sp-ink-faint (its usual ~55% opacity is fine for
  // de-emphasized body text, but not for a badge's own foreground).
  unclassified: { label: 'Unclassified', glyph: '—', accentVar: '--sp-ink' },
};

type ClassifyInput = {
  // Optional and distinct from `null`: omitted entirely means "this
  // caller hasn't been migrated to select the column yet" (heuristic
  // fallback applies); present as `null` means "the database says
  // unclassified" (authoritative, heuristic never runs).
  classification?: StorableClassification | null;
  bpm: number | null;
  musicalKey: string | null;
};

export function classifyCollaboration(input: ClassifyInput): Classification {
  if (isStorableClassification(input.classification)) return input.classification;
  if (input.classification === null) return 'unclassified';
  // input.classification is `undefined` here -- not-yet-migrated caller.
  if (input.bpm !== null || (input.musicalKey !== null && input.musicalKey.trim() !== '')) return 'track';
  return 'unclassified';
}
