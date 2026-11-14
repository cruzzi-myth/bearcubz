-- PREPARATION ONLY. Never run during K1.6H.1.
-- A separately authorized operator must set the session approval setting
-- on a dedicated production connection, provision production Vault entries,
-- and review both cadences. Close that connection after the operation.
begin;
do $$
begin
  if current_setting('signal_portal.production_schedulers_approved', true) is distinct from 'yes' then
    raise exception 'Explicit production scheduler authorization required';
  end if;
  if (select count(*) from vault.decrypted_secrets where name in ('signal_portal_cron_secret', 'signal_portal_gateway_anon_key')) <> 2 then
    raise exception 'Exactly one of each production Vault credential is required';
  end if;
end $$;

select cron.schedule('signal-portal-prod-cleanup-quarantine', '0 3 * * *', $job$
  select net.http_post(
    url := 'https://drsidtagxezznqviupsr.supabase.co/functions/v1/portal-admin-cleanup-quarantine',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'signal_portal_gateway_anon_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'signal_portal_gateway_anon_key'),
      'X-Signal-Portal-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'signal_portal_cron_secret')
    ), body := '{}'::jsonb);
$job$);

-- Proposed ten-minute cadence; bounded retries remain enforced by the function.
select cron.schedule('signal-portal-prod-scan-recovery', '*/10 * * * *', $job$
  select net.http_post(
    url := 'https://drsidtagxezznqviupsr.supabase.co/functions/v1/portal-scan-recovery',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'signal_portal_gateway_anon_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'signal_portal_gateway_anon_key'),
      'X-Signal-Portal-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'signal_portal_cron_secret')
    ), body := '{}'::jsonb);
$job$);
commit;
