-- ============================================================
-- SIGNAL PORTAL — real upload lifecycle + atomic primary-cover switch.
--
-- NOT YET APPLIED. Fixes two defects identified in the Stage H
-- verification pass:
--
-- 1. portal-admin-request-upload-url inserted a collaboration_assets
--    row the moment a signed upload URL was minted — before the
--    browser had actually uploaded anything. A failed/abandoned
--    upload left a row that read as a real asset. This migration
--    adds an explicit upload_status so "recorded" and "confirmed to
--    exist in Storage" are no longer the same moment.
--
-- 2. Both portal-admin-request-upload-url and
--    portal-admin-manage-collaboration's update_asset op cleared the
--    OLD primary cover's flag before the NEW asset was verified —
--    if the insert/verification step then failed, the collaboration
--    was left with zero primary covers. promote_primary_cover()
--    below does the clear-and-set as one atomic function call, and
--    refuses to run at all unless the target asset is already
--    upload_status = 'ready'.
-- ============================================================

alter table public.collaboration_assets
  add column upload_status text not null default 'pending'
    check (upload_status in ('pending', 'uploading', 'verifying', 'ready', 'failed')),
  add column verified_at timestamptz null;

-- Defensive backfill for any pre-existing row from before this
-- column existed — none exist in any environment this has been
-- applied to (nothing has ever been applied anywhere), but a
-- migration that adds a non-nullable lifecycle column should still
-- state explicitly what happens to rows that predate it: they are
-- treated as already-confirmed under the old implicit-always-ready
-- model, not silently left pending forever.
update public.collaboration_assets set upload_status = 'ready', verified_at = uploaded_at
where upload_status = 'pending';

-- RLS defense in depth: even if an application query ever forgets to
-- filter upload_status, a non-ready asset is now unreachable to an
-- artist at the database layer itself, not just by convention in the
-- query that happens to be used today.
drop policy "member select active assets" on public.collaboration_assets;
create policy "member select active assets" on public.collaboration_assets
  for select using (
    is_active and upload_status = 'ready' and exists (
      select 1 from public.collaboration_members cm
      where cm.collaboration_id = collaboration_assets.collaboration_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );

-- Admins still see everything regardless of upload_status (they're
-- the ones who need to see pending/failed rows to manage them) — the
-- existing "admin select all assets" policy already has no status
-- filter, so it needs no change.

create function public.promote_primary_cover(target_asset_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_collaboration_id uuid;
  v_status text;
begin
  select collaboration_id, upload_status into v_collaboration_id, v_status
    from public.collaboration_assets
    where id = target_asset_id
    for update;

  if v_collaboration_id is null then
    raise exception 'ASSET_NOT_FOUND';
  end if;

  -- Refusing to promote anything not yet verified is the core fix —
  -- this is the one condition that makes "clear old, set new" safe
  -- to do unconditionally in the statements below: by the time they
  -- run, the replacement is already known-good.
  if v_status <> 'ready' then
    raise exception 'ASSET_NOT_READY';
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

revoke all on function public.promote_primary_cover(uuid) from public;
-- Service-role only (called from Edge Functions, never the browser
-- directly) — this performs a write with no RLS check of its own
-- inside the function body, so it must never be reachable by a
-- caller whose admin status hasn't already been verified.
