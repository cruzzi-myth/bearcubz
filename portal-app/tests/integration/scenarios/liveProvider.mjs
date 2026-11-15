// LIVE-PROVIDER verification — runs ONLY when SIGNAL_PORTAL_LIVE_PROVIDER=1 and
// the dev scanner is in live mode (PORTAL_SCANNER_TEST_MODE unset). Performs a
// very small number of genuine Cloudmersive scans (1 basic) to
// prove real authentication and authentic clean verdicts. Never part of the
// ordinary credit-free test run.
import { check } from '../_harness.mjs';
import { callEdgeFunction, bearerFor } from '../_functions.mjs';
import { syntheticPngBytes } from '../fixtures.mjs';

export async function run(ctx) {
  if (process.env.SIGNAL_PORTAL_LIVE_PROVIDER !== '1') {
    console.log('SKIP live-provider verification (set SIGNAL_PORTAL_LIVE_PROVIDER=1 with the dev scanner in live mode)');
    return;
  }
  const { clients, fixtures, supabaseUrl, anonKey } = ctx;
  const auth = bearerFor(fixtures.adminIdentity);

  await check('[live] the dev scanner is in LIVE mode (no mock, real provider)', async () => {
    const r = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-scanner-status', { authHeader: auth, body: {} });
    return r.body.scannerEndpointMode === 'live' && r.body.cloudmersiveConfigured === true;
  });

  async function scanAsset(assetType, mimeType, bytes, label) {
    const req = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-request-upload-url', {
      authHeader: auth,
      body: { collaborationId: fixtures.collab1Id, assetType, mimeType, fileSizeBytes: bytes.length, displayLabel: label },
    });
    await fetch(req.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: bytes });
    await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-confirm-upload', { authHeader: auth, body: { assetId: req.body.assetId } });
    const { data } = await clients.admin.from('collaboration_assets').select('security_status, scan_evidence').eq('id', req.body.assetId).single();
    return data;
  }

  await check('[live] a harmless image receives an authentic CLEAN verdict from Cloudmersive (real authentication)', async () => {
    const row = await scanAsset('track_cover', 'image/png', syntheticPngBytes(), 'live provider check');
    return row.security_status === 'clean' && row.scan_evidence?.provider === 'cloudmersive' && row.scan_evidence?.complete === true && row.scan_evidence?.verdict === 'clean';
  });
}
