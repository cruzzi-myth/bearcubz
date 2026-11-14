-- ============================================================
-- SIGNAL PORTAL — K1.6E: automated malware scanning & quarantine
-- operations.
--
-- Section 1's core instruction: upload validation, malware clearance,
-- and administrator approval are three SEPARATE conditions. K1.6C/D
-- already separated "upload validation" (signature + EICAR check,
-- gating 'uploaded' -> 'awaiting_scan' vs 'failed') from the rest, but
-- conflated "malware clearance" and "administrator approval" into one
-- field: `status` moved straight from 'awaiting_scan' to an admin
-- decision, with no real scan verdict recorded anywhere, and the
-- existing 'clean' status value was defined in the original check
-- constraint but never actually reachable by any code path.
--
-- This migration does NOT introduce a new status enum. It makes the
-- already-declared-but-dead 'clean' value real: 'awaiting_scan' now
-- means exactly what it says (awaiting the scan, nothing else can act
-- on it), and 'clean' means "malware scan passed, awaiting
-- administrator review" -- the one and only status an administrator's
-- review action may now act on. 'rejected' is reachable from BOTH an
-- infected scan verdict and an administrator's artistic rejection;
-- the two are distinguished by which of security_status/review_status
-- is set, never ambiguous on a given row (an infected file never
-- reaches review_status at all; an admin can only reject a row whose
-- security_status is already 'clean').
--
-- Two new, orthogonal, server-only-writable fields record WHO decided
-- WHAT, independent of the physical-location state machine above:
--   security_status: pending -> scanning -> (clean | infected | error)
--   review_status:   pending -> (approved | rejected)
-- Neither can be written by any client role -- this table has never
-- granted UPDATE to anon/authenticated (see the K1.6C migration), and
-- that remains true here; every write to these two fields happens
-- exclusively inside a service-role Edge Function that has already
-- independently verified its own authorization to make that specific
-- write.
-- ============================================================

alter table public.collaboration_feedback_attachments
  add column security_status text not null default 'pending'
    check (security_status in ('pending', 'scanning', 'clean', 'infected', 'error')),
  add column security_scan_detail text null,
  add column review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected'));

-- Defense in depth, independent of any Edge Function's own logic:
-- Postgres itself refuses a row that claims 'available' without both
-- a clean scan AND an approved review already recorded on that exact
-- row. A future bug in application code cannot promote around this --
-- the write itself is rejected at the database level.
alter table public.collaboration_feedback_attachments
  add constraint attachment_available_requires_clearance
  check (status != 'available' or (security_status = 'clean' and review_status = 'approved'));

comment on column public.collaboration_feedback_attachments.security_status is
  'Malware-scan verdict only. Never set by a client role. pending/scanning are transient; clean/infected/error are terminal for THIS scan attempt (error is retryable via portal-admin-retry-attachment-scan).';
comment on column public.collaboration_feedback_attachments.review_status is
  'Administrator artistic-approval decision only, independent of security_status. Can only ever move to approved/rejected from a row whose security_status is already clean (enforced in portal-admin-review-attachment, not just here).';

-- ============================================================
-- Development-only scheduler for the existing quarantine-cleanup
-- workflow (K1.6C section 7 / K1.6E section 7). Uses the Supabase-
-- documented pg_cron + pg_net pattern: pg_cron fires on a schedule,
-- pg_net makes the actual HTTP call to the deployed Edge Function,
-- authenticated with the project's own service-role key read out of
-- Vault (never hardcoded into the job definition or this file).
--
-- NOT PRODUCTION: this job is created only because this migration is
-- applied to the isolated dev project (gcbonlvbgyhsgfayvlvz) per this
-- stage's explicit authorization. Applying this same migration to
-- production would also enable a production scheduler, which Stage
-- K1.6E explicitly does NOT authorize -- before any production
-- rollout, this cron.schedule block must be reviewed and deliberately
-- re-approved for production use, not promoted automatically.
-- ============================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

grant usage on schema cron to postgres;

-- NOTE: this job's Authorization secret name was corrected in
-- 20261109091500_signal_portal_cron_secret_fix.sql, which re-points
-- this same named job (cron.schedule on an existing job name updates
-- it in place) at a small, dedicated, purpose-built secret instead of
-- the project's real service-role key -- see that migration's own
-- comment for why. The secret value itself is still never written
-- into any migration file; it is set as an Edge Function secret via
-- `supabase secrets set` and inserted into Vault as a separate,
-- out-of-band, non-committed step.
select cron.schedule(
  'signal-portal-dev-cleanup-quarantine',
  '0 3 * * *', -- once daily, 03:00 UTC -- matches the real intended production cadence, not an artificially fast test interval
  $$
  select net.http_post(
    url := 'https://gcbonlvbgyhsgfayvlvz.supabase.co/functions/v1/portal-admin-cleanup-quarantine',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'signal_portal_service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
