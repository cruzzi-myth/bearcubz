-- ============================================================
-- SIGNAL PORTAL — Stage I1 security hardening.
--
-- NOT YET APPLIED. Additive only — no historical migration is
-- rewritten. Two real defects found during the Stage I1 audit,
-- documented in full in supabase/SIGNAL_PORTAL_SECURITY_AUDIT.md:
--
-- 1. promote_primary_cover() had no authorization check of its own —
--    its only protection was "nothing except service_role can call
--    it," which is true today but is a calling-convention, not a
--    database-enforced guarantee. It also never checked that the
--    target was actually a cover-eligible visual asset type, or that
--    it wasn't a rejected asset — meaning it would have silently
--    "promoted" an audio file or a proposal PDF to primary cover if
--    ever called on one by mistake.
--
-- 2. collaboration_feedback has no way to address an admin reply to
--    a SPECIFIC member of a collaboration — today every active
--    member of a collaboration sees every admin reply on it. This is
--    safe under the only pattern actually built so far (one artist
--    per collaboration), but is a real privacy gap the moment a
--    collaboration ever has more than one active member. Adding
--    recipient scoping now, defaulting to "visible to the whole
--    collaboration" (NULL) so today's single-member behavior is
--    unchanged, rather than waiting until a second member exists to
--    discover the gap.
-- ============================================================

-- ---------- promote_primary_cover() — rebuilt with real checks ----------

drop function if exists public.promote_primary_cover(uuid);

create function public.promote_primary_cover(target_asset_id uuid, acting_admin_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_collaboration_id uuid;
  v_status text;
  v_asset_type text;
  v_approval_status text;
  v_is_active boolean;
begin
  -- Do not assume this function is safe merely because only an
  -- already-admin-checked Edge Function calls it today (the Stage
  -- I1 brief's own instruction). acting_admin_id is supplied by the
  -- caller, not derived from auth.uid() — a service-role connection
  -- has no end-user session for auth.uid() to resolve, so this is
  -- the only way this function can independently verify a real
  -- admin identity rather than trusting that its caller already did.
  if acting_admin_id is null or not public.is_portal_admin(acting_admin_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  -- Lock every asset row in the target's collaboration up front, not
  -- just the target row — this is what actually prevents two
  -- concurrent promotions in the SAME collaboration from racing each
  -- other between the "clear old" and "set new" statements below.
  -- (The partial unique index added in the artwork migration would
  -- still catch a successful race as a last resort, but a caller
  -- should see a clean ASSET_NOT_READY/NOT_ELIGIBLE rejection, not an
  -- unexplained constraint-violation error from a lost race.)
  perform 1
    from public.collaboration_assets
    where collaboration_id = (select collaboration_id from public.collaboration_assets where id = target_asset_id)
    for update;

  select collaboration_id, upload_status, asset_type, approval_status, is_active
    into v_collaboration_id, v_status, v_asset_type, v_approval_status, v_is_active
    from public.collaboration_assets
    where id = target_asset_id;

  if v_collaboration_id is null then
    raise exception 'ASSET_NOT_FOUND';
  end if;

  if v_asset_type not in ('track_cover', 'alternate_cover', 'visual_image', 'visual_concept') then
    raise exception 'NOT_A_COVER_ELIGIBLE_TYPE';
  end if;

  if not v_is_active then
    raise exception 'ASSET_INACTIVE';
  end if;

  -- Refusing to promote anything not yet verified is the core
  -- Stage H fix — this is the one condition that makes "clear old,
  -- set new" safe to do unconditionally below: by the time they run,
  -- the replacement is already known-good.
  if v_status <> 'ready' then
    raise exception 'ASSET_NOT_READY';
  end if;

  -- A rejected asset is explicitly disqualified — this is the
  -- documented policy the Stage I1 brief asked for: pending or
  -- approved artwork may be promoted (a working cover can predate
  -- final sign-off), but anything an administrator has rejected
  -- cannot become the public-facing primary cover regardless of its
  -- upload status.
  if v_approval_status = 'rejected' then
    raise exception 'ASSET_REJECTED';
  end if;

  update public.collaboration_assets
    set is_primary_cover = false
    where collaboration_id = v_collaboration_id
      and is_primary_cover = true
      and id <> target_asset_id;

  update public.collaboration_assets
    set is_primary_cover = true
    where id = target_asset_id;
end;
$$;

revoke all on function public.promote_primary_cover(uuid, uuid) from public;
-- No grant to authenticated or anon, matching the original —
-- service_role's implicit platform-level schema access is what lets
-- the Edge Functions call this, the same convention the existing
-- moon_racer_vote_results() function already relies on without an
-- explicit service_role grant line. The real, new protection is the
-- is_portal_admin(acting_admin_id) check inside the function body
-- itself, not the grant list.

-- ---------- collaboration_feedback — recipient-specific replies ----------

alter table public.collaboration_feedback
  add column recipient_user_id uuid null references auth.users(id);

drop policy "member select own thread" on public.collaboration_feedback;
create policy "member select own thread" on public.collaboration_feedback
  for select using (
    exists (
      select 1 from public.collaboration_members cm
      where cm.collaboration_id = collaboration_feedback.collaboration_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
    and (
      author_id = auth.uid()
      or (is_admin_reply and (recipient_user_id is null or recipient_user_id = auth.uid()))
    )
  );

-- NULL recipient_user_id means "visible to the whole collaboration" —
-- exactly today's existing behavior, unchanged for every row that
-- predates this column and for every single-member collaboration
-- (the only kind that has ever actually existed). A reply that DOES
-- set a recipient is now scoped to that one member even if the
-- collaboration later gains others.
