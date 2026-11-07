-- ============================================================
-- PHASE 2: persistent player identity layer.
--
-- Nothing here touches public.passport_members' existing columns,
-- claim_passport(), link_my_passport(), or the RLS policy Phase 1/2a
-- already established on passport_members. This migration only adds
-- new, independent objects.
-- ============================================================

-- ---------- XP / LEVEL / RANK: pure math, single source of truth ----------
-- PROVISIONAL curve: cumulative XP to reach level n = 100 * n^2
-- (level 1 = 100xp, level 5 = 2,500xp, level 15 = 22,500xp, level 30 =
-- 90,000xp). Progressive by construction (each level costs more than
-- the last). Rebalance later by editing these two functions only —
-- nothing else in the schema or app hard-codes XP thresholds.
create or replace function public.xp_for_level(p_level integer)
returns integer
language sql
immutable
as $$
  select (least(greatest(p_level, 0), 30) ^ 2) * 100;
$$;

-- Excess XP past level 30 is retained in the xp column but has no
-- further effect (level clamps at 30) until a prestige/rebirth system
-- exists — none is planned for Phase 2 or 3.
create or replace function public.level_for_xp(p_xp integer)
returns integer
language sql
immutable
as $$
  select least(30, floor(sqrt(greatest(p_xp, 0)::numeric / 100))::integer);
$$;

create or replace function public.rank_for_level(p_level integer)
returns text
language sql
immutable
as $$
  select case
    when p_level <= 0 then 'Visitor / Initiate'
    when p_level between 1 and 5 then 'Recruit'
    when p_level between 6 and 10 then 'Racer'
    when p_level between 11 and 15 then 'Navigator'
    when p_level between 16 and 20 then 'Commander'
    when p_level between 21 and 25 then 'Moon Racer Elite'
    else 'Legendary Racer' -- 26-30
  end;
$$;

-- ---------- avatar_presets: public reference data (the 6 base types) ----------
create table if not exists public.avatar_presets (
  id             text primary key,           -- 'human' | 'mythraxian' | 'ai' | 'alien' | 'glitch' | 'hybrid'
  display_name   text not null,
  description    text not null default '',
  preview_image_url text,                    -- nullable until real art is uploaded
  base_model     text not null,
  sort_order     integer not null default 0
);

alter table public.avatar_presets enable row level security;
create policy "avatar presets are public" on public.avatar_presets
  for select to anon, authenticated using (true);
revoke all on public.avatar_presets from anon, authenticated;
grant select on public.avatar_presets to anon, authenticated;

insert into public.avatar_presets (id, display_name, description, base_model, sort_order) values
  ('human',      'Human',      'Baseline human racer.',                              'human',      1),
  ('mythraxian', 'Mythraxian', 'Native to the Mythrax systems.',                     'mythraxian', 2),
  ('ai',         'AI',         'A synthetic intelligence given physical form.',      'ai',         3),
  ('alien',      'Alien',      'Origin unknown, signal undeniable.',                 'alien',      4),
  ('glitch',     'Glitch',     'A racer whose signal was corrupted -- and kept.',    'glitch',     5),
  ('hybrid',     'Hybrid',     'Two lineages, one racer.',                           'hybrid',     6)
on conflict (id) do nothing;

-- ---------- player_profiles: mutable identity (username/display name) ----------
create table if not exists public.player_profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  username     text not null,
  display_name text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists player_profiles_username_lower_key
  on public.player_profiles (lower(username));

alter table public.player_profiles enable row level security;
create policy "owner can read own profile" on public.player_profiles
  for select to authenticated using (user_id = auth.uid());
revoke all on public.player_profiles from anon, authenticated;
grant select on public.player_profiles to authenticated;
-- display_name only -- username changes are deferred to a later phase
-- (need re-validation/uniqueness UX); this keeps that surface closed
-- for now rather than half-building it.
grant update (display_name) on public.player_profiles to authenticated;

-- ---------- player_progress: PROTECTED. No client write path at all. ----------
create table if not exists public.player_progress (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  xp          integer not null default 0 check (xp >= 0),
  level       integer generated always as (public.level_for_xp(xp)) stored,
  rank        text generated always as (public.rank_for_level(public.level_for_xp(xp))) stored,
  zip_balance integer not null default 0 check (zip_balance >= 0),
  updated_at  timestamptz not null default now()
);

alter table public.player_progress enable row level security;
create policy "owner can read own progress" on public.player_progress
  for select to authenticated using (user_id = auth.uid());
revoke all on public.player_progress from anon, authenticated;
grant select on public.player_progress to authenticated;
-- Deliberately no insert/update/delete grant to anon or authenticated.
-- xp / level / rank / zip_balance are only ever written by
-- initialize_player_profile() (SECURITY DEFINER, sets xp=0/zip=0 once)
-- until a real XP/ZIP-award engine ships in a later phase.

-- ---------- player_abilities: PROTECTED, same pattern as progress ----------
create table if not exists public.player_abilities (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  signal     integer not null default 0 check (signal >= 0),
  speed      integer not null default 0 check (speed >= 0),
  vision     integer not null default 0 check (vision >= 0),
  energy     integer not null default 0 check (energy >= 0),
  memory     integer not null default 0 check (memory >= 0),
  style      integer not null default 0 check (style >= 0),
  updated_at timestamptz not null default now()
);

alter table public.player_abilities enable row level security;
create policy "owner can read own abilities" on public.player_abilities
  for select to authenticated using (user_id = auth.uid());
revoke all on public.player_abilities from anon, authenticated;
grant select on public.player_abilities to authenticated;
-- No write grant -- same reasoning as player_progress. No upper cap
-- imposed yet (no balancing values exist to enforce); only >= 0.

-- ---------- player_avatar: not sensitive, owner can read/update directly ----------
create table if not exists public.player_avatar (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  avatar_provider text not null default 'moon_racer_preset',
  avatar_external_id text,
  base_model  text not null references public.avatar_presets(id),
  model_url   text,
  model_format text check (model_format is null or model_format in ('glb', 'gltf', 'vrm')),
  preview_image_url text,
  face text, body_type text, skin text, hair text, hair_color text,
  eyes text, eye_style text, outfit text, mask text, eyewear text,
  accessory text, accent text, crest text, cybernetics text, background text,
  customization_version integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.player_avatar enable row level security;
create policy "owner can read own avatar" on public.player_avatar
  for select to authenticated using (user_id = auth.uid());
create policy "owner can update own avatar" on public.player_avatar
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.player_avatar from anon, authenticated;
grant select, update on public.player_avatar to authenticated;
-- No insert grant: the row is always created once, atomically, by
-- initialize_player_profile(). Later customization is UPDATE only.

-- ---------- player_settings: not sensitive, owner can read/update directly ----------
create table if not exists public.player_settings (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  preferred_mode     text not null default 'classic' check (preferred_mode in ('classic', 'network')),
  cinematic_travel   boolean not null default true,
  reduced_motion     boolean not null default false,
  audio_enabled      boolean not null default true,
  music_volume       numeric(3,2) not null default 0.50 check (music_volume between 0 and 1),
  effects_volume     numeric(3,2) not null default 0.50 check (effects_volume between 0 and 1),
  subtitles_enabled  boolean not null default false,
  voice_enabled      boolean not null default false,
  vr_enabled         boolean not null default false,
  vr_locomotion      text not null default 'teleport',
  avatar_quality     text not null default 'standard',
  render_quality_3d  text not null default 'standard',
  updated_at         timestamptz not null default now()
);

alter table public.player_settings enable row level security;
create policy "owner can read own settings" on public.player_settings
  for select to authenticated using (user_id = auth.uid());
create policy "owner can update own settings" on public.player_settings
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.player_settings from anon, authenticated;
grant select, update on public.player_settings to authenticated;

-- ============================================================
-- initialize_player_profile(): the ONLY place player_profiles,
-- player_progress, player_abilities, player_settings, and
-- player_avatar rows are ever created. Atomic, idempotent (safe to
-- call again on refresh/retry -- returns the existing state instead
-- of erroring or duplicating), authenticated-only.
-- ============================================================
create or replace function public.initialize_player_profile(
  p_username text,
  p_display_name text,
  p_avatar_base_model text default 'human'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_username text := trim(p_username);
  v_display text := trim(p_display_name);
  v_avatar_model text := coalesce(p_avatar_base_model, 'human');
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Idempotent: already initialized -> just return current state.
  if exists (select 1 from public.player_profiles where user_id = v_uid) then
    return public.get_my_player_state();
  end if;

  if v_username is null or char_length(v_username) < 2 or char_length(v_username) > 24
     or v_username !~ '^[[:alnum:] ._''\-]+$' then
    raise exception 'INVALID_USERNAME';
  end if;

  if v_display is null or char_length(v_display) < 2 or char_length(v_display) > 32 then
    raise exception 'INVALID_DISPLAY_NAME';
  end if;

  if not exists (select 1 from public.avatar_presets where id = v_avatar_model) then
    v_avatar_model := 'human';
  end if;

  begin
    insert into public.player_profiles (user_id, username, display_name)
    values (v_uid, v_username, v_display);
  exception
    when unique_violation then
      raise exception 'USERNAME_TAKEN';
  end;

  insert into public.player_progress (user_id) values (v_uid)
    on conflict (user_id) do nothing;
  insert into public.player_abilities (user_id) values (v_uid)
    on conflict (user_id) do nothing;
  insert into public.player_settings (user_id) values (v_uid)
    on conflict (user_id) do nothing;
  insert into public.player_avatar (user_id, base_model) values (v_uid, v_avatar_model)
    on conflict (user_id) do nothing;

  return public.get_my_player_state();
end;
$$;

revoke all on function public.initialize_player_profile(text, text, text) from public, anon;
grant execute on function public.initialize_player_profile(text, text, text) to authenticated;

-- ============================================================
-- get_my_player_state(): one read-optimized call for the dashboard
-- and HUD. SECURITY INVOKER on purpose -- it does not need to bypass
-- RLS, since every sub-select is already scoped to auth.uid() and
-- each underlying table's own SELECT policy still applies. Never
-- returns raw ids/emails as "identity" -- passport_id is the public
-- identity, not the row's uuid.
-- ============================================================
create or replace function public.get_my_player_state()
returns jsonb
language sql
security invoker
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'passport', (
      select to_jsonb(pm) - 'id' - 'user_id' - 'email'
      from public.passport_members pm where pm.user_id = auth.uid()
    ),
    'profile', (select to_jsonb(pp) from public.player_profiles pp where pp.user_id = auth.uid()),
    'progress', (select to_jsonb(pr) from public.player_progress pr where pr.user_id = auth.uid()),
    'abilities', (select to_jsonb(pa) from public.player_abilities pa where pa.user_id = auth.uid()),
    'avatar', (select to_jsonb(av) - 'user_id' from public.player_avatar av where av.user_id = auth.uid()),
    'settings', (select to_jsonb(ps) from public.player_settings ps where ps.user_id = auth.uid())
  );
$$;

revoke all on function public.get_my_player_state() from public, anon;
grant execute on function public.get_my_player_state() to authenticated;
