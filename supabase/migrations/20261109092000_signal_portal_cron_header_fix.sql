-- ============================================================
-- SIGNAL PORTAL — K1.6E fix #2: discovered during this stage's own
-- end-to-end verification that every Edge Function in this project
-- relies on the platform's default gateway-level JWT check (no
-- verify_jwt override exists anywhere in config.toml) -- an
-- Authorization header that isn't a well-formed Supabase-recognized
-- JWT (anon key, a user's session JWT, or the service-role key) is
-- rejected by the gateway itself (401 UNAUTHORIZED_INVALID_JWT_FORMAT)
-- before the function's own code ever runs. The dedicated
-- SIGNAL_PORTAL_CRON_SECRET from the previous fix migration is a
-- random hex string, not a JWT, so sending it as the Authorization
-- bearer never reached portal-admin-cleanup-quarantine's own
-- authorization check at all.
--
-- Fix: send the project's real (public, safe to embed -- see
-- requireAdminOrSystem.ts's own comment) anon key as Authorization,
-- satisfying the gateway, and move the actual "is this the scheduler"
-- secret to a separate custom header
-- (X-Signal-Portal-Cron-Secret), which the function itself checks.
-- ============================================================

select cron.schedule(
  'signal-portal-dev-cleanup-quarantine',
  '0 3 * * *',
  $$
  select net.http_post(
    url := 'https://gcbonlvbgyhsgfayvlvz.supabase.co/functions/v1/portal-admin-cleanup-quarantine',
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
