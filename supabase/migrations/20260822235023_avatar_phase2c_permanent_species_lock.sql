-- Avatar Phase 2C — permanent species identity lock + server-backed
-- onboarding stage. Purely additive: two new nullable/default-safe
-- columns, two new trusted RPCs, one hardening trigger, and an
-- in-place edit of initialize_player_profile() to stamp the new
-- onboarding_stage column (its existing behavior — profile/progress/
-- abilities/settings/avatar creation, idempotency, username/display
-- validation — is otherwise unchanged). No destructive SQL, no table
-- drops, no data resets. 0 real rows exist in player_avatar/
-- player_progress today, but the migration is written to be safe for
-- however many existed.

-- ---------------------------------------------------------------
-- 1. New columns
-- ---------------------------------------------------------------
alter table public.player_avatar
  add column species_confirmed_at timestamptz;

comment on column public.player_avatar.species_confirmed_at is
  'NULL = species not yet permanently confirmed (Phase 2B draft browsing is still safe). Once set, species/primary_species/secondary_species/hybrid_ratio/glitch_*_ratio become immutable for normal authenticated clients — enforced by the player_avatar_identity_lock trigger, not just this column existing.';

alter table public.player_progress
  add column onboarding_stage text not null default 'passport_created',
  add column onboarding_completed_at timestamptz;

alter table public.player_progress
  add constraint player_progress_onboarding_stage_check
    check (onboarding_stage = any (array[
      'passport_created', 'species_selection', 'avatar_customization',
      'avatar_complete', 'core_arrival', 'active_player'
    ]));

comment on column public.player_progress.onboarding_stage is
  'Server-authoritative first-time-player progression. Only advanced by trusted RPCs (initialize_player_profile, confirm_avatar_species, complete_initial_avatar) — there is deliberately no client UPDATE grant on player_progress at all, so this column has no direct-mutation path to protect against.';

-- ---------------------------------------------------------------
-- 2. Stamp onboarding_stage during the existing profile-init RPC.
--    Everything else about this function is unchanged.
-- ---------------------------------------------------------------
create or replace function public.initialize_player_profile(p_username text, p_display_name text, p_avatar_base_model text default 'human'::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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

  insert into public.player_progress (user_id, onboarding_stage) values (v_uid, 'species_selection')
    on conflict (user_id) do nothing;
  insert into public.player_abilities (user_id) values (v_uid)
    on conflict (user_id) do nothing;
  insert into public.player_settings (user_id) values (v_uid)
    on conflict (user_id) do nothing;
  insert into public.player_avatar (user_id, base_model) values (v_uid, v_avatar_model)
    on conflict (user_id) do nothing;

  return public.get_my_player_state();
end;
$function$;

-- ---------------------------------------------------------------
-- 3. Mirrors avatarSpecies.ts's HYBRID_ALLOWED_PAIRS server-side so
--    the permanent-confirmation RPC enforces the same canonical pairs
--    the creator UI already restricts to.
-- ---------------------------------------------------------------
create or replace function public.is_hybrid_pair_allowed(p_a text, p_b text)
 returns boolean
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
  select p_a is not null and p_b is not null and p_a <> p_b and (
    (p_a = 'human' and p_b = 'alien') or (p_a = 'alien' and p_b = 'human') or
    (p_a = 'human' and p_b = 'ai') or (p_a = 'ai' and p_b = 'human') or
    (p_a = 'human' and p_b = 'mythraxian') or (p_a = 'mythraxian' and p_b = 'human') or
    (p_a = 'alien' and p_b = 'ai') or (p_a = 'ai' and p_b = 'alien') or
    (p_a = 'alien' and p_b = 'mythraxian') or (p_a = 'mythraxian' and p_b = 'alien') or
    (p_a = 'mythraxian' and p_b = 'ai') or (p_a = 'ai' and p_b = 'mythraxian')
  );
$function$;

revoke execute on function public.is_hybrid_pair_allowed(text, text) from public;

-- ---------------------------------------------------------------
-- 4. The ONLY normal player path that permanently commits species
--    identity. Derives the caller from auth.uid() only. Rejects an
--    already-confirmed avatar, an unknown species, and every invalid
--    Hybrid/Glitch identity shape before writing anything.
-- ---------------------------------------------------------------
create or replace function public.confirm_avatar_species(
  p_species text,
  p_primary_species text default null,
  p_secondary_species text default null,
  p_hybrid_ratio smallint default null,
  p_glitch_human_ratio smallint default null,
  p_glitch_alien_ratio smallint default null,
  p_glitch_ai_ratio smallint default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_avatar public.player_avatar;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_avatar from public.player_avatar where user_id = v_uid;
  if not found then
    raise exception 'NO_AVATAR_FOUND';
  end if;

  if v_avatar.species_confirmed_at is not null then
    raise exception 'SPECIES_ALREADY_CONFIRMED';
  end if;

  if p_species is null or p_species not in ('human', 'alien', 'hybrid', 'ai', 'mythraxian', 'glitch') then
    raise exception 'INVALID_SPECIES';
  end if;

  if p_species = 'hybrid' then
    if p_primary_species is null or p_secondary_species is null then
      raise exception 'HYBRID_PARENTS_REQUIRED';
    end if;
    if p_primary_species = p_secondary_species then
      raise exception 'HYBRID_PARENTS_IDENTICAL';
    end if;
    if not public.is_hybrid_pair_allowed(p_primary_species, p_secondary_species) then
      raise exception 'HYBRID_PAIR_NOT_ALLOWED';
    end if;
    if p_hybrid_ratio is null or p_hybrid_ratio < 0 or p_hybrid_ratio > 100 then
      raise exception 'INVALID_HYBRID_RATIO';
    end if;
  elsif p_species = 'glitch' then
    if p_glitch_human_ratio is null or p_glitch_alien_ratio is null or p_glitch_ai_ratio is null then
      raise exception 'GLITCH_COMPOSITION_REQUIRED';
    end if;
    if p_glitch_human_ratio < 0 or p_glitch_human_ratio > 100
       or p_glitch_alien_ratio < 0 or p_glitch_alien_ratio > 100
       or p_glitch_ai_ratio < 0 or p_glitch_ai_ratio > 100 then
      raise exception 'INVALID_GLITCH_PERCENTAGE';
    end if;
    if p_glitch_human_ratio + p_glitch_alien_ratio + p_glitch_ai_ratio <> 100 then
      raise exception 'GLITCH_COMPOSITION_NOT_100';
    end if;
  end if;

  update public.player_avatar
  set species = p_species,
      primary_species = case when p_species = 'hybrid' then p_primary_species else null end,
      secondary_species = case when p_species = 'hybrid' then p_secondary_species else null end,
      hybrid_ratio = case when p_species = 'hybrid' then p_hybrid_ratio else null end,
      glitch_human_ratio = case when p_species = 'glitch' then p_glitch_human_ratio else null end,
      glitch_alien_ratio = case when p_species = 'glitch' then p_glitch_alien_ratio else null end,
      glitch_ai_ratio = case when p_species = 'glitch' then p_glitch_ai_ratio else null end,
      species_confirmed_at = now()
  where user_id = v_uid;

  update public.player_progress
  set onboarding_stage = 'avatar_customization'
  where user_id = v_uid
    and onboarding_stage in ('passport_created', 'species_selection');

  return public.get_my_player_state();
end;
$function$;

revoke execute on function public.confirm_avatar_species(text, text, text, smallint, smallint, smallint, smallint) from public;
grant execute on function public.confirm_avatar_species(text, text, text, smallint, smallint, smallint, smallint) to authenticated;

-- ---------------------------------------------------------------
-- 5. Validates and advances onboarding to avatar_complete. Idempotent
--    (safe to call again if already complete or beyond) rather than
--    erroring on a double-click/retry.
-- ---------------------------------------------------------------
create or replace function public.complete_initial_avatar()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_avatar public.player_avatar;
  v_progress public.player_progress;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_avatar from public.player_avatar where user_id = v_uid;
  if not found then
    raise exception 'NO_AVATAR_FOUND';
  end if;

  select * into v_progress from public.player_progress where user_id = v_uid;
  if not found then
    raise exception 'NO_PROGRESS_FOUND';
  end if;

  if v_progress.onboarding_stage not in ('passport_created', 'species_selection', 'avatar_customization') then
    return public.get_my_player_state();
  end if;

  if v_avatar.species_confirmed_at is null then
    raise exception 'SPECIES_NOT_CONFIRMED';
  end if;

  if v_avatar.archetype is null then
    raise exception 'FOUNDATION_REQUIRED';
  end if;

  update public.player_progress
  set onboarding_stage = 'avatar_complete',
      onboarding_completed_at = coalesce(onboarding_completed_at, now())
  where user_id = v_uid;

  return public.get_my_player_state();
end;
$function$;

revoke execute on function public.complete_initial_avatar() from public;
grant execute on function public.complete_initial_avatar() to authenticated;

-- ---------------------------------------------------------------
-- 6. Database-level immutability. This is what actually stops a
--    malicious authenticated client from running a direct
--    `update player_avatar set species = 'alien' ...` after
--    confirmation — the RLS "owner can update own avatar" policy is
--    deliberately left row-scoped only (per the Phase 2C brief) so
--    ordinary cosmetic UPDATEs keep working; this trigger is the
--    column-level guard. service_role (never exposed to the browser)
--    bypasses it for legitimate future admin repair.
-- ---------------------------------------------------------------
create or replace function public.player_avatar_prevent_identity_mutation()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if old.species_confirmed_at is not null then
    if new.species is distinct from old.species
       or new.primary_species is distinct from old.primary_species
       or new.secondary_species is distinct from old.secondary_species
       or new.hybrid_ratio is distinct from old.hybrid_ratio
       or new.glitch_human_ratio is distinct from old.glitch_human_ratio
       or new.glitch_alien_ratio is distinct from old.glitch_alien_ratio
       or new.glitch_ai_ratio is distinct from old.glitch_ai_ratio
       or new.species_confirmed_at is distinct from old.species_confirmed_at
    then
      raise exception 'PERMANENT_IDENTITY_LOCKED';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists player_avatar_identity_lock on public.player_avatar;
create trigger player_avatar_identity_lock
  before update on public.player_avatar
  for each row
  execute function public.player_avatar_prevent_identity_mutation();
