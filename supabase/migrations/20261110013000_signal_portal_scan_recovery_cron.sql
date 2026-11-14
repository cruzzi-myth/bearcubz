-- ============================================================
-- SIGNAL PORTAL — K1.6G section 3: scheduled recovery for stale scan
-- leases and bounded automatic retries. Reuses the exact pg_cron +
-- pg_net pattern and the same dedicated, low-privilege
-- SIGNAL_PORTAL_CRON_SECRET already set up for the quarantine-cleanup
-- job in K1.6E/K1.6E.1 — "use the existing dedicated system
-- authorization model," not a second one. The anon key is sent as
-- Authorization only to satisfy the Edge Runtime's own gateway-level
-- JWT check (see requireAdminOrSystem.ts's own comment); real
-- authorization is the X-Signal-Portal-Cron-Secret header.
--
-- Every two minutes — comfortably inside the 180-second scan lease
-- duration (so a stuck row is reclaimed within one or two ticks, not
-- left stuck for a long window), while still far short of "an
-- uncontrolled polling loop": each run's own query is cheap (indexed,
-- bounded by MAX_RETRIES_PER_RUN=5), and Cloudmersive calls only ever
-- happen for rows that are genuinely due a retry, never unconditionally.
--
-- NOT enabled for production by this stage — same boundary as every
-- other dev-only scheduler in this project.
-- ============================================================

select cron.schedule(
  'signal-portal-dev-scan-recovery',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://gcbonlvbgyhsgfayvlvz.supabase.co/functions/v1/portal-scan-recovery',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjYm9ubHZiZ3loc2dmYXl2bHZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQwMTQ3MTMsImV4cCI6MjEwOTU5MDcxM30.u4nNXYpdXtosbrBydsy4PKDSrtjlYqG6tGMp5Waq91c',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjYm9ubHZiZ3loc2dmYXl2bHZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQwMTQ3MTMsImV4cCI6MjEwOTU5MDcxM30.u4nNXYpdXtosbrBydsy4PKDSrtjlYqG6tGMp5Waq91c',
      'X-Signal-Portal-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'signal_portal_cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
