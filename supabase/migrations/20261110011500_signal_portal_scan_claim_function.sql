-- ============================================================
-- SIGNAL PORTAL — K1.6G: atomic "claim for a fresh scan attempt" step.
--
-- supabase-js's .update({...}) only accepts literal values, not SQL
-- expressions — there is no client-side way to express
-- "scan_attempt_count = scan_attempt_count + 1" as part of the same
-- atomic UPDATE...WHERE...RETURNING that also enforces the claimable-
-- state guard (security_status IN ('pending','error')). Doing the
-- increment as a separate read-then-write from application code would
-- reopen exactly the TOCTOU race the atomic claim exists to prevent.
-- A single SQL statement, wrapped in this function, is both atomic
-- and still expressible as one supabase-js .rpc() call.
--
-- service_role only — callable exclusively from the admin-client
-- Edge Function code path (scanOrchestrator.ts), same trust boundary
-- as every other write to this table.
-- ============================================================

create or replace function public.claim_attachment_for_scan(
  p_attachment_id uuid,
  p_request_id uuid,
  p_lease_seconds integer
)
returns table (
  id uuid,
  attempt_count integer,
  mime_type text,
  storage_bucket text,
  storage_path text
)
language sql
security definer
set search_path = public
as $$
  update public.collaboration_feedback_attachments
  set security_status = 'scanning',
      scan_request_id = p_request_id,
      scan_started_at = now(),
      scan_lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      scan_attempt_count = scan_attempt_count + 1,
      scan_last_error = null
  where collaboration_feedback_attachments.id = p_attachment_id
    and security_status in ('pending', 'error')
  returning
    collaboration_feedback_attachments.id,
    collaboration_feedback_attachments.scan_attempt_count as attempt_count,
    collaboration_feedback_attachments.mime_type,
    collaboration_feedback_attachments.storage_bucket,
    collaboration_feedback_attachments.storage_path;
$$;

revoke all on function public.claim_attachment_for_scan(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_attachment_for_scan(uuid, uuid, integer) to service_role;
