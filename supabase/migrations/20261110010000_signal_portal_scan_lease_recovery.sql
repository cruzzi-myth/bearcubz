-- ============================================================
-- SIGNAL PORTAL — K1.6G section 2/4: recoverable (lease-based) malware
-- scanning, plus first-class oversized-file retention tracking.
--
-- K1.6F found two real, verified gaps:
--   1. A row claimed for scanning (security_status='scanning') but
--      never resolved (the Edge Function crashed/was killed mid-scan)
--      had NO recovery path anywhere in the codebase.
--   2. An oversized file genuinely awaiting future scanner capacity
--      was indistinguishable, to the cleanup job, from a genuinely
--      abandoned upload -- both were deleted by the same 7-day rule.
--
-- Of the fields this stage's brief lists, `scan_provider` and
-- `scanned_at` already exist (added in K1.6E) and are reused
-- unchanged -- only genuinely missing fields are added below ("add
-- only what is missing").
-- ============================================================

alter table public.collaboration_feedback_attachments
  -- Lease/attempt bookkeeping. scan_request_id is the "unique scan
  -- attempt identifier" the brief asks for -- the write-back step
  -- that records a verdict only succeeds if scan_request_id still
  -- matches what was claimed, which is what makes a late/stale
  -- response from an already-reclaimed attempt harmless (see
  -- scanOrchestrator.ts).
  add column scan_attempt_count integer not null default 0,
  add column scan_started_at timestamptz null,
  add column scan_lease_expires_at timestamptz null,
  add column scan_last_error text null,
  add column scan_next_retry_at timestamptz null,
  add column scan_completed_at timestamptz null,
  add column scan_request_id uuid null,
  -- Oversized-file retention tracking (section 4). Deliberately NOT a
  -- new security_status enum value -- security_status stays 'error'
  -- for an oversized file, exactly as K1.6E.1 designed it (never
  -- 'infected' merely for being too large). This is a separate,
  -- purely informational discriminator so the cleanup job, the retry
  -- scheduler, and the admin UI can each treat "genuinely abandoned"
  -- and "deliberately held pending scanner capacity" differently,
  -- without touching the existing status/security_status/review_status
  -- state machine at all.
  add column awaiting_scanner_capacity boolean not null default false,
  add column scan_waiting_since timestamptz null,
  add column scan_retention_expires_at timestamptz null;

comment on column public.collaboration_feedback_attachments.scan_request_id is
  'Set fresh on every scan claim (fresh attempt or admin retry). A scan-result write-back only applies if this still matches the id it was given at claim time -- the real defense against a late response from an already-reclaimed/superseded attempt overwriting a newer result.';
comment on column public.collaboration_feedback_attachments.awaiting_scanner_capacity is
  'True only for a row whose scan failed closed specifically because the file exceeds the configured scanner size limit (EXCEEDS_SCANNER_SIZE_LIMIT). Never auto-retried by the scheduler; only an administrator-initiated manual rescan can clear it. Used by the cleanup job to apply the 30-day retention policy (section 4) instead of the 7-day abandoned-upload rule.';

-- Indexes for the three real query patterns the scheduler and cleanup
-- job need to run efficiently and without a full table scan as the
-- table grows: finding expired leases, finding eligible retries, and
-- finding expired oversized-waiting rows.
create index collaboration_feedback_attachments_stale_lease_idx
  on public.collaboration_feedback_attachments (scan_lease_expires_at)
  where security_status = 'scanning';

create index collaboration_feedback_attachments_retry_eligible_idx
  on public.collaboration_feedback_attachments (scan_next_retry_at)
  where security_status = 'error' and awaiting_scanner_capacity = false;

create index collaboration_feedback_attachments_retention_expiry_idx
  on public.collaboration_feedback_attachments (scan_retention_expires_at)
  where awaiting_scanner_capacity = true and is_active = true;
