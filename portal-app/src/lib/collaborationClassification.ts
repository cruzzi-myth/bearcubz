/**
 * Stage K1.4 — project classification (TRACK / MUSIC VIDEO / ARTWORK).
 *
 * There is no `classification` column on `collaborations` today — this
 * was verified against the real schema (supabase/migrations/*), not
 * assumed. Per the K1.4 brief's own instruction for a missing field
 * ("determine whether existing metadata can safely supply it... do not
 * invent classifications based solely on file extensions"), this
 * resolves classification from `bpm`/`musical_key` — collaboration-level
 * fields an admin deliberately records when setting up a MUSIC
 * collaboration, not a file's MIME type or storage format, so using them
 * doesn't cross the brief's "do not conflate classification with file
 * type" line. A collaboration with neither set has no authoritative
 * signal at all and is UNCLASSIFIED, exactly as the brief specifies.
 *
 * MUSIC VIDEO has no authoritative signal of any kind today — there is
 * no video asset type in the schema (collaboration_assets' asset_type
 * check constraint has no video variant). The classification UI below
 * fully supports it so nothing else needs to change once a real
 * schema field (and a video asset type) exists; until then no
 * collaboration can ever resolve to it from real data.
 *
 * REQUIRED FUTURE SCHEMA CHANGE (documented, not applied this stage):
 *   alter table public.collaborations
 *     add column classification text null
 *     check (classification in ('track', 'music_video', 'artwork'));
 * Once that lands, replace this heuristic with a direct read of that
 * column (falling back to 'unclassified' when null) — every caller
 * already goes through `classifyCollaboration`, so that's a one-place
 * change.
 */
export type Classification = 'track' | 'music_video' | 'artwork' | 'unclassified';

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

export function classifyCollaboration(input: { bpm: number | null; musicalKey: string | null }): Classification {
  if (input.bpm !== null || (input.musicalKey !== null && input.musicalKey.trim() !== '')) return 'track';
  return 'unclassified';
}
