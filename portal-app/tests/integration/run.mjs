// Entry point for the Signal Portal integration suite. Running this
// with NO environment configured (the actual state of this repo as of
// Stage I2A — no isolated Supabase project exists yet) is expected to
// print a refusal from assertSafeToRunIntegrationTests and exit 1,
// BEFORE anything below it executes. That refusal is itself the
// Phase 8 safeguard demonstrating it works, not a failure of this
// script.
import { assertSafeToRunIntegrationTests } from './_guard.mjs';
import { buildClients } from './_client.mjs';
import { createFixtureSet, teardownFixtureSet } from './fixtures.mjs';
import { summary } from './_harness.mjs';

const SCENARIOS = ['auth', 'invitations', 'invitationSend', 'rls', 'storage', 'artwork', 'feedback', 'access', 'classification', 'k16b', 'k16c', 'k16d', 'k16e', 'k16e1', 'k16g', 'k16k', 'k16l', 'k16n', 'k16o', 'scannerMock', 'liveProvider'];

async function main() {
  let safe;
  try {
    safe = assertSafeToRunIntegrationTests(process.env);
  } catch (err) {
    console.error('[integration guard] REFUSED:', err.message);
    console.error(`[integration guard] discovered ${SCENARIOS.length} scenario modules, 0 executed: ${SCENARIOS.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const clients = buildClients({
    supabaseUrl: safe.supabaseUrl,
    anonKey: process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  console.log(`[integration] target project ref: ${safe.projectRef ?? '(local stack)'}`);
  console.log('[integration] creating synthetic fixture set...');
  const fixtures = await createFixtureSet(clients);

  const ctx = {
    clients,
    fixtures,
    supabaseUrl: safe.supabaseUrl,
    anonKey: process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY,
  };

  // Scanner-mode preflight: ordinary runs must NOT spend real provider credits.
  // They require the dev scanner to be in MOCK mode; live-provider runs require LIVE.
  {
    const { callEdgeFunction: call, bearerFor: bearer } = await import('./_functions.mjs');
    const status = await call(ctx.supabaseUrl, ctx.anonKey, 'portal-admin-scanner-status', { authHeader: bearer(fixtures.adminIdentity), body: {} });
    const mode = status.body?.scannerEndpointMode ?? 'unknown';
    const wantLive = process.env.SIGNAL_PORTAL_LIVE_PROVIDER === '1';
    console.log(`[integration] scanner mode: ${mode} (${wantLive ? 'live-provider verification' : 'standard / credit-free'})`);
    if (wantLive ? mode !== 'live' : mode !== 'mock') {
      await teardownFixtureSet(clients, fixtures);
      throw new Error(`Scanner mode is "${mode}" but this run needs "${wantLive ? 'live' : 'mock'}". Run supabase/scripts/set-dev-scanner-mode.sh ${wantLive ? 'live' : 'mock'} first.`);
    }
  }

  try {
    // Optional focused rerun (comma-separated scenario names), e.g. when an
    // external dependency (the malware scanner) is unavailable.
    const only = process.env.SIGNAL_PORTAL_INTEGRATION_ONLY?.split(',').map((n) => n.trim()).filter(Boolean);
    for (const name of SCENARIOS) {
      if (only && !only.includes(name)) continue;
      console.log(`\n--- ${name} ---`);
      const mod = await import(`./scenarios/${name}.mjs`);
      await mod.run(ctx);
    }
  } finally {
    console.log('\n[integration] tearing down fixture set...');
    await teardownFixtureSet(clients, fixtures);
  }

  summary('Signal Portal integration suite');
}

main().catch((err) => {
  console.error('[integration] unexpected failure:', err);
  process.exitCode = 1;
});
