-- ============================================================
-- SIGNAL PORTAL — K1.6D fix: the "uploader select own attachment
-- regardless of status" policy (20261109063400) was missing an
-- active-membership check, unlike every other access policy on this
-- table. That is a real gap, found while writing this stage's own
-- revoked-membership regression test (k16d.mjs): a revoked artist
-- could still SELECT their own attachment row forever (any status,
-- including 'available'), and because
-- portal-attachment-signed-url only re-checks status = 'available'
-- (not membership) in its own function body, a revoked artist could
-- still mint fresh signed URLs for their own previously-available
-- attachments indefinitely after being removed from the
-- collaboration.
--
-- Fix: replace the policy so it additionally requires the uploader's
-- own membership on the attachment's collaboration to still be
-- 'active' -- the same condition every other read boundary on this
-- table already uses. Once revoked, the artist can no longer see
-- their own row's status at all (no worse than any other revoked
-- member's experience elsewhere in the app), and the function-body
-- status check becomes unreachable for them regardless.
-- ============================================================

drop policy "uploader select own attachment regardless of status" on public.collaboration_feedback_attachments;

create policy "uploader select own attachment regardless of status" on public.collaboration_feedback_attachments
  for select using (
    uploaded_by = auth.uid()
    and exists (
      select 1
      from public.collaboration_members cm
      where cm.collaboration_id = collaboration_feedback_attachments.collaboration_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );
