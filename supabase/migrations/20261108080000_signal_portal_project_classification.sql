-- ============================================================
-- SIGNAL PORTAL — Stage K1.5B: authoritative project classification.
--
-- NOT YET APPLIED to production. Purely additive to the existing
-- collaborations table: one nullable column + a CHECK constraint,
-- following the exact same pattern status itself already uses
-- (text column, inline CHECK, no enum, no lookup table — see Stage
-- K1.5A's audit for why an enum/lookup table was rejected).
--
-- No RLS change: collaborations has no UPDATE/INSERT policy for
-- `authenticated` at all (confirmed in the K1.5A audit) — every
-- admin write already goes through the service-role
-- portal-admin-manage-collaboration Edge Function, which this
-- migration does not touch. Artists already cannot write to this
-- table under any circumstance; they can already read every column
-- on a row they're authorized to see, so no new SELECT grant is
-- needed for them to read this new column either.
--
-- No backfill: existing rows get NULL (= UNCLASSIFIED in the
-- frontend), exactly as instructed. No trigger, no view, no other
-- function in this schema reads or writes collaborations columns
-- (confirmed by inspection), so this cannot break anything else.
-- ============================================================

alter table public.collaborations
  add column classification text null
  check (
    classification in (
      'track',
      'music_video',
      'artwork'
    )
  );

comment on column public.collaborations.classification is
  'Authoritative administrator-assigned project classification. '
  'NULL means unclassified.';
