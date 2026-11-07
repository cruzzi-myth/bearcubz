-- Avatar Phase 1 — data/security foundation for the six-species Moon
-- Racer avatar creator. Purely additive: extends the existing
-- player_avatar row (the one avatar identity per player) and adds a
-- new avatar_generations history table + private Storage bucket.
-- No existing column is renamed/removed/retyped. No image generation,
-- no Edge Function, no prompt logic — schema/RLS/storage only.
--
-- Root identity fields (species, hybrid/glitch composition, signal,
-- origin/faction, approved-generation reference) are dedicated
-- columns. Rapidly-growing per-species cosmetic choices (hair style,
-- chassis material, dermal pattern, etc.) live in the new
-- `configuration` jsonb column instead of one column per trait, so
-- adding the 30th hairstyle later is a data change, not a migration.

-- ---------------------------------------------------------------
-- 1. Extend player_avatar with new, nullable/default-safe columns.
--    Every existing row (currently 0, but this must hold for real
--    Founder data too) stays valid with no backfill required.
-- ---------------------------------------------------------------
alter table public.player_avatar
  add column species text,
  add column archetype text,
  add column primary_species text,
  add column secondary_species text,
  add column hybrid_ratio smallint,
  add column glitch_human_ratio smallint,
  add column glitch_alien_ratio smallint,
  add column glitch_ai_ratio smallint,
  add column signal_affinity text,
  add column signal_color text,
  add column origin text,
  add column faction text,
  add column configuration jsonb not null default '{}'::jsonb,
  add column generation_status text not null default 'none',
  add column generation_version integer not null default 1,
  add column approved_image_path text;

comment on column public.player_avatar.species is 'Root species identity. One of the six permanent Moon Racer species, or null until chosen.';
comment on column public.player_avatar.archetype is 'Species-specific starter visual foundation (e.g. Racer, Android, Oracle). Visual only — not an RPG occupation.';
comment on column public.player_avatar.configuration is 'Species-specific cosmetic selections that do not warrant a dedicated column (hair, chassis material, dermal pattern, etc). Root identity fields stay first-class columns; this is not a dumping ground for those.';
comment on column public.player_avatar.generation_status is 'Lifecycle of this player''s avatar imagery: none/draft/generating/candidate/approved/failed. No state-transition logic enforced yet — Phase 1 is schema only.';

-- Species must be one of the six permanent roots, or null (draft /
-- not yet chosen). Same constraint shape as the existing
-- player_avatar.model_format check, for consistency.
alter table public.player_avatar
  add constraint player_avatar_species_check
    check (species is null or species = any (array['human','alien','hybrid','ai','mythraxian','glitch']));
alter table public.player_avatar
  add constraint player_avatar_primary_species_check
    check (primary_species is null or primary_species = any (array['human','alien','hybrid','ai','mythraxian','glitch']));
alter table public.player_avatar
  add constraint player_avatar_secondary_species_check
    check (secondary_species is null or secondary_species = any (array['human','alien','hybrid','ai','mythraxian','glitch']));

-- A Hybrid's two parent foundations can't be the same species. Only
-- enforced once both are actually set, so a partially-configured
-- draft (one chosen, one not yet) stays valid.
alter table public.player_avatar
  add constraint player_avatar_hybrid_parents_distinct_check
    check (primary_species is null or secondary_species is null or primary_species <> secondary_species);

alter table public.player_avatar
  add constraint player_avatar_hybrid_ratio_range_check
    check (hybrid_ratio is null or (hybrid_ratio between 0 and 100));

alter table public.player_avatar
  add constraint player_avatar_glitch_ratio_range_check
    check (
      (glitch_human_ratio is null or glitch_human_ratio between 0 and 100)
      and (glitch_alien_ratio is null or glitch_alien_ratio between 0 and 100)
      and (glitch_ai_ratio is null or glitch_ai_ratio between 0 and 100)
    );

-- Glitch composition must sum to exactly 100% — but only once all
-- three values are present, so a draft missing one value is still
-- a valid (incomplete) row.
alter table public.player_avatar
  add constraint player_avatar_glitch_ratio_sum_check
    check (
      glitch_human_ratio is null or glitch_alien_ratio is null or glitch_ai_ratio is null
      or (glitch_human_ratio + glitch_alien_ratio + glitch_ai_ratio = 100)
    );

alter table public.player_avatar
  add constraint player_avatar_generation_status_check
    check (generation_status = any (array['none','draft','generating','candidate','approved','failed']));

-- ---------------------------------------------------------------
-- 2. avatar_generations — visual candidate history for the ONE
--    existing avatar identity. Not a second avatar table: it FKs to
--    player_avatar(user_id), so a generation can only exist for a
--    player who already has an avatar row (i.e. has completed
--    onboarding).
-- ---------------------------------------------------------------
create table public.avatar_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.player_avatar(user_id) on delete cascade,
  species text not null check (species = any (array['human','alien','hybrid','ai','mythraxian','glitch'])),
  configuration jsonb not null default '{}'::jsonb,
  prompt_version integer not null default 1,
  model_version text,
  image_path text,
  thumbnail_path text,
  status text not null default 'draft' check (status = any (array['draft','generating','candidate','approved','failed'])),
  error_code text,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

comment on table public.avatar_generations is 'Generated-image candidate history for a player''s one avatar identity (player_avatar). Never a second current-avatar table. Rows are created by the trusted server path (Edge Function, once it exists) — no client INSERT/UPDATE policy in Phase 1.';

create index avatar_generations_user_id_idx on public.avatar_generations (user_id);

alter table public.avatar_generations enable row level security;

-- Owner-only read. Deliberately NO insert/update/delete policy for
-- anon/authenticated — matches this project's existing philosophy
-- (protected progression is server-controlled only) and the explicit
-- instruction that generation rows are created by a trusted server
-- path, not the browser. service_role bypasses RLS entirely, which is
-- how the future Edge Function will write here.
create policy "owner can read own avatar generations" on public.avatar_generations
  for select to authenticated
  using (user_id = (select auth.uid()));

grant select on public.avatar_generations to authenticated;

-- Now that avatar_generations exists, link player_avatar's approved
-- image back to a specific generation record.
alter table public.player_avatar
  add column approved_generation_id uuid references public.avatar_generations(id) on delete set null;

comment on column public.player_avatar.approved_generation_id is 'The avatar_generations row currently approved as this player''s canonical portrait, if any.';
comment on column public.player_avatar.approved_image_path is 'Denormalized copy of the approved generation''s image_path, for cheap reads without a join. Source of truth is still the saved configuration + avatar_generations row it references.';

create index player_avatar_approved_generation_id_idx on public.player_avatar (approved_generation_id);

-- ---------------------------------------------------------------
-- 3. Private Storage bucket for future avatar portraits. No files
--    exist yet (no generation in Phase 1) — this just establishes
--    the locked-down bucket + path-ownership policy ahead of time.
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatar-images', 'avatar-images', false)
on conflict (id) do nothing;

-- Path convention: {user_id}/{generation_id}/portrait.png (or
-- thumbnail.webp) — ownership is the first path segment matching the
-- caller's own auth.uid(). Read-only for now: nothing produces files
-- to upload yet, and once the Edge Function exists it will write via
-- the service role, which bypasses Storage RLS the same way.
create policy "avatar images: owner can read own files" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatar-images' and (select auth.uid())::text = (storage.foldername(name))[1]);
