-- Zero-behavior-change hardening flagged by the Supabase advisor after
-- the phase2_player_identity_layer migration:
--   1. RLS policies re-evaluating auth.uid() per row -> wrap as
--      (select auth.uid()) so Postgres evaluates it once per query.
--   2. Pure helper functions (level_for_xp/xp_for_level/rank_for_level)
--      had a mutable search_path -> pin it explicitly. They don't
--      reference any table, so this changes nothing about their output.
-- claim_passport's anon-executable warning is NOT touched here — that
-- is required for the public /passport/ registration flow.

alter function public.level_for_xp(integer) set search_path = '';
alter function public.xp_for_level(integer) set search_path = '';
alter function public.rank_for_level(integer) set search_path = '';

drop policy "members can read their own passport" on public.passport_members;
create policy "members can read their own passport" on public.passport_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (user_id is null and lower(coalesce((select auth.jwt() ->> 'email'), '')) = lower(email))
  );

drop policy "owner can read own profile" on public.player_profiles;
create policy "owner can read own profile" on public.player_profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy "owner can read own progress" on public.player_progress;
create policy "owner can read own progress" on public.player_progress
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy "owner can read own abilities" on public.player_abilities;
create policy "owner can read own abilities" on public.player_abilities
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy "owner can read own avatar" on public.player_avatar;
create policy "owner can read own avatar" on public.player_avatar
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy "owner can update own avatar" on public.player_avatar;
create policy "owner can update own avatar" on public.player_avatar
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy "owner can read own settings" on public.player_settings;
create policy "owner can read own settings" on public.player_settings
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy "owner can update own settings" on public.player_settings;
create policy "owner can update own settings" on public.player_settings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
