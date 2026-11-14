-- ============================================================
-- SIGNAL PORTAL — K1.6E fix: the original cron job definition
-- referenced the project's real SUPABASE_SERVICE_ROLE_KEY as the
-- Authorization credential for the quarantine-cleanup scheduler's
-- call into its own Edge Function. Discovered during this stage's own
-- end-to-end verification (not a failing test) that this project
-- actually exposes TWO materially different "service role" credential
-- formats -- the legacy long-form JWT this codebase's own
-- createAdminClient() calls and local tooling use, and a different,
-- shorter value that a deployed Edge Function's own
-- Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') resolves to at runtime.
-- Reusing that ambiguous, platform-managed value as an authorization
-- secret was fragile and under-specified from the start.
--
-- Fix: re-point the same named job at a small, dedicated,
-- purpose-built secret (SIGNAL_PORTAL_CRON_SECRET) instead, scoped to
-- exactly one job -- let the quarantine-cleanup scheduler call its
-- own Edge Function, nothing else. A leak of this secret only ever
-- grants "can trigger quarantine cleanup," never full database
-- access, a materially smaller blast radius than the original design.
-- cron.schedule() on an EXISTING job name updates that job in place,
-- so this does not create a second, duplicate job.
-- ============================================================

select cron.schedule(
  'signal-portal-dev-cleanup-quarantine',
  '0 3 * * *',
  $$
  select net.http_post(
    url := 'https://gcbonlvbgyhsgfayvlvz.supabase.co/functions/v1/portal-admin-cleanup-quarantine',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'signal_portal_cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
