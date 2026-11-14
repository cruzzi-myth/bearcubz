-- ============================================================
-- SIGNAL PORTAL — K1.6D: administrator attachment review.
--
-- Purely additive to the K1.6C attachments table. Two real
-- requirements this stage introduced that the K1.6C schema didn't
-- yet support:
--
-- 1. "Verify that an artist can see the status of their own
--    submission after a page refresh" (Uploading / Pending review /
--    Available / Rejected / Failed) — K1.6C's own SELECT policy only
--    ever let a member see a row once status = 'available', by
--    design, because upload-in-progress status was meant to be
--    relayed live from the Edge Function responses, never re-queried.
--    This stage explicitly asks for it to survive a refresh, which
--    requires a real, separate read path: the UPLOADER may see their
--    OWN row regardless of status; everyone else still only ever
--    sees 'available' rows, unchanged from K1.6C.
--
--    This is deliberately NOT enough to let a pending/rejected file
--    be downloaded — portal-attachment-signed-url now checks
--    status = 'available' explicitly in the function body (see that
--    function's own updated comment) rather than relying on RLS
--    alone, because RLS alone no longer implies it once the uploader
--    can read their own non-available row's metadata.
--
-- 2. "Provide a rejection reason" — a real column, not reused from
--    an unrelated existing one.
-- ============================================================

alter table public.collaboration_feedback_attachments
  add column rejection_reason text null;

create policy "uploader select own attachment regardless of status" on public.collaboration_feedback_attachments
  for select using (uploaded_by = auth.uid());
