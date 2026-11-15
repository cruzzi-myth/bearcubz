// Standard (credit-free) scanner assertions through the mock provider. These
// preserve the malware-rejection security guarantees without real credits:
// an infected verdict is recorded and can never be security-released.
import { check } from '../_harness.mjs';
import { callEdgeFunction, bearerFor } from '../_functions.mjs';
import { syntheticPngBytes } from '../fixtures.mjs';

export async function run(ctx) {
  if (process.env.SIGNAL_PORTAL_LIVE_PROVIDER === '1') {
    console.log('SKIP mock-provider checks (live-provider run)');
    return;
  }
  const { clients, fixtures, supabaseUrl, anonKey } = ctx;
  const auth = bearerFor(fixtures.adminIdentity);
  const created = [];

  async function upload(bytes) {
    const req = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-request-upload-url', {
      authHeader: auth,
      body: { collaborationId: fixtures.collab1Id, assetType: 'track_cover', mimeType: 'image/png', fileSizeBytes: bytes.length, displayLabel: 'mock scan probe' },
    });
    created.push(req.body.assetId);
    await fetch(req.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: bytes });
    await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-confirm-upload', { authHeader: auth, body: { assetId: req.body.assetId } });
    const { data } = await clients.admin.from('collaboration_assets').select('security_status, scan_evidence').eq('id', req.body.assetId).single();
    return { assetId: req.body.assetId, row: data };
  }

  try {
    await check('[mock] scanner is in MOCK mode for standard runs', async () => {
      const r = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-scanner-status', { authHeader: auth, body: {} });
      return r.body.scannerEndpointMode === 'mock';
    });
    await check('[mock] a harmless file is scanned clean through the provider path', async () => {
      const { row } = await upload(syntheticPngBytes());
      return row.security_status === 'clean' && row.scan_evidence?.complete === true;
    });
    const infected = await upload(new Uint8Array([...syntheticPngBytes(), ...new TextEncoder().encode(' MOCK-INFECTED-FIXTURE')]));
    await check('[mock] a file the provider reports infected is recorded as infected', async () => infected.row.security_status === 'infected');
    await check('[mock] an infected file can NEVER be security-released by an administrator', async () => {
      const r = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-review-asset', { authHeader: auth, body: { assetId: infected.assetId, decision: 'approve' } });
      const { data } = await clients.admin.from('collaboration_assets').select('security_review_status, upload_status').eq('id', infected.assetId).single();
      return r.status === 409 && data.security_review_status !== 'approved' && data.upload_status !== 'ready';
    });
  } finally {
    if (created.length) await clients.admin.from('collaboration_assets').delete().in('id', created);
  }
}
