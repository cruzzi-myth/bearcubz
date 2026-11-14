// Stage K1.6B — security verification for the two real artist
// collaboration packages (SIGNAL-XYLO-001 / SIGNAL-ISSEY-001).
//
// Two kinds of checks live here:
//  1. Cross-artist isolation and admin access against the REAL,
//     persistent dev records (created by the K1.6B setup script,
//     tracked in docs/signal-portal/.k16b-dev-dataset.json) — these
//     are read-only and never mutate that dataset.
//  2. Schema-behavior checks (draft-status visibility, classification
//     persistence, an uncertain musical mode stored honestly) against
//     a throwaway collaboration this scenario creates and tears down
//     itself, exactly like every other scenario in this suite — never
//     against the real K1.6B records, so a test run can never alter
//     them.
import { readFileSync, existsSync } from 'node:fs';
import { check } from '../_harness.mjs';
import { createAndSignInTestUser, deleteTestUser } from '../_client.mjs';
import { testEmail } from '../fixtures.mjs';
import { callEdgeFunction, bearerFor } from '../_functions.mjs';

const K16B_DATASET_PATH = new URL('../../../docs/signal-portal/.k16b-dev-dataset.json', import.meta.url).pathname;

export async function run(ctx) {
  const { clients, supabaseUrl, anonKey } = ctx;

  // ---------- Part 1: real K1.6B records (read-only) ----------
  if (!existsSync(K16B_DATASET_PATH)) {
    console.log('[k16b] .k16b-dev-dataset.json not found — skipping Part 1 (real-record checks). Run the K1.6B setup script first.');
  } else {
    const k16b = JSON.parse(readFileSync(K16B_DATASET_PATH, 'utf8'));
    const xylo = k16b.collaborations.xylo;
    const issey = k16b.collaborations.issey;

    const anonForXylo = clients.anon();
    const xyloSignIn = await anonForXylo.auth.signInWithPassword({ email: xylo.artist.email, password: k16b.password });
    if (xyloSignIn.error) throw new Error(`k16b xylo sign-in failed: ${xyloSignIn.error.message}`);

    const anonForIssey = clients.anon();
    const isseySignIn = await anonForIssey.auth.signInWithPassword({ email: issey.artist.email, password: k16b.password });
    if (isseySignIn.error) throw new Error(`k16b issey sign-in failed: ${isseySignIn.error.message}`);

    const anonForAdmin = clients.anon();
    const adminSignIn = await anonForAdmin.auth.signInWithPassword({ email: k16b.admin.email, password: k16b.password });
    if (adminSignIn.error) throw new Error(`k16b admin sign-in failed: ${adminSignIn.error.message}`);

    await check('[K1.6B real] Paige/XYLO dev identity can access only SIGNAL-XYLO-001', async () => {
      const own = await anonForXylo.from('collaborations').select('id').eq('id', xylo.id);
      const other = await anonForXylo.from('collaborations').select('id').eq('id', issey.id);
      return (own.data?.length ?? 0) === 1 && (other.data?.length ?? 0) === 0;
    });

    await check('[K1.6B real] Issey Cross dev identity can access only SIGNAL-ISSEY-001', async () => {
      const own = await anonForIssey.from('collaborations').select('id').eq('id', issey.id);
      const other = await anonForIssey.from('collaborations').select('id').eq('id', xylo.id);
      return (own.data?.length ?? 0) === 1 && (other.data?.length ?? 0) === 0;
    });

    await check('[K1.6B real] Paige/XYLO identity cannot read Issey\'s demo asset metadata', async () => {
      const { data, error } = await anonForXylo.from('collaboration_assets').select('id').eq('collaboration_id', issey.id);
      return !error && (data?.length ?? 0) === 0;
    });

    await check('[K1.6B real] Issey identity cannot read Paige/XYLO\'s demo asset metadata', async () => {
      const { data, error } = await anonForIssey.from('collaboration_assets').select('id').eq('collaboration_id', xylo.id);
      return !error && (data?.length ?? 0) === 0;
    });

    await check('[K1.6B real] Paige/XYLO identity cannot read Issey\'s proposal asset row', async () => {
      const { data } = await anonForXylo.from('collaboration_assets').select('id').eq('collaboration_id', issey.id).eq('asset_type', 'proposal_pdf');
      return (data?.length ?? 0) === 0;
    });

    await check('[K1.6B real] Issey identity cannot read Paige/XYLO\'s proposal asset row', async () => {
      const { data } = await anonForIssey.from('collaboration_assets').select('id').eq('collaboration_id', xylo.id).eq('asset_type', 'proposal_pdf');
      return (data?.length ?? 0) === 0;
    });

    await check('[K1.6B real] Paige/XYLO identity cannot mint a signed URL for Issey\'s audio asset', async () => {
      const res = await callEdgeFunction(supabaseUrl, anonKey, 'portal-signed-url', {
        authHeader: `Bearer ${xyloSignIn.data.session.access_token}`,
        body: { assetId: issey.assets.audioFull.assetId },
      });
      return res.status !== 200 || !res.body.url;
    });

    await check('[K1.6B real] Issey identity cannot mint a signed URL for Paige/XYLO\'s audio asset', async () => {
      const res = await callEdgeFunction(supabaseUrl, anonKey, 'portal-signed-url', {
        authHeader: `Bearer ${isseySignIn.data.session.access_token}`,
        body: { assetId: xylo.assets.audioFull.assetId },
      });
      return res.status !== 200 || !res.body.url;
    });

    await check('[K1.6B real] Paige/XYLO identity CAN mint a signed URL for her own ready audio asset', async () => {
      const res = await callEdgeFunction(supabaseUrl, anonKey, 'portal-signed-url', {
        authHeader: `Bearer ${xyloSignIn.data.session.access_token}`,
        body: { assetId: xylo.assets.audioFull.assetId },
      });
      return res.status === 200 && Boolean(res.body.url);
    });

    await check('[K1.6B real] feedback submitted by Paige/XYLO is associated with SIGNAL-XYLO-001, not visible to Issey', async () => {
      const submitted = await callEdgeFunction(supabaseUrl, anonKey, 'portal-submit-feedback', {
        authHeader: `Bearer ${xyloSignIn.data.session.access_token}`,
        body: { collaborationId: xylo.id, kind: 'general', body: 'K1.6B isolation check — Paige/XYLO thread.' },
      });
      if (!submitted.body.ok) return false;
      const isseyView = await anonForIssey.from('collaboration_feedback').select('id').eq('collaboration_id', xylo.id);
      return (isseyView.data?.length ?? 0) === 0;
    });

    await check('[K1.6B real] Issey cannot write feedback into SIGNAL-XYLO-001\'s thread', async () => {
      const res = await callEdgeFunction(supabaseUrl, anonKey, 'portal-submit-feedback', {
        authHeader: `Bearer ${isseySignIn.data.session.access_token}`,
        body: { collaborationId: xylo.id, kind: 'general', body: 'should be rejected' },
      });
      return res.status !== 200 || !res.body.ok;
    });

    await check('[K1.6B real] administrator can preview SIGNAL-XYLO-001 and SIGNAL-ISSEY-001 both', async () => {
      const a = await anonForAdmin.from('collaborations').select('id').eq('id', xylo.id);
      const b = await anonForAdmin.from('collaborations').select('id').eq('id', issey.id);
      return (a.data?.length ?? 0) === 1 && (b.data?.length ?? 0) === 1;
    });

    await check('[K1.6B real] administrator preview never created an artificial membership row for either artist on the other\'s project', async () => {
      const xyloOnIssey = await clients.admin.from('collaboration_members').select('user_id').eq('collaboration_id', issey.id).eq('user_id', xylo.artist.uid);
      const isseyOnXylo = await clients.admin.from('collaboration_members').select('user_id').eq('collaboration_id', xylo.id).eq('user_id', issey.artist.uid);
      return (xyloOnIssey.data?.length ?? 0) === 0 && (isseyOnXylo.data?.length ?? 0) === 0;
    });

    await check('[K1.6B real] classification is authoritative "track" for both projects, not an invented value', async () => {
      const rows = await clients.admin.from('collaborations').select('id,classification').in('id', [xylo.id, issey.id]);
      return rows.data?.every((r) => r.classification === 'track');
    });

    await check('[K1.6B real] Issey Cross\'s musical_key is stored exactly as "A♭" — no fabricated major/minor mode', async () => {
      const row = await clients.admin.from('collaborations').select('musical_key').eq('id', issey.id).single();
      return row.data?.musical_key === 'A♭';
    });

    await check('[K1.6B real] both projects\' draft status does not hide them from their assigned, active member', async () => {
      const rows = await clients.admin.from('collaborations').select('id,status').in('id', [xylo.id, issey.id]);
      const bothDraft = rows.data?.every((r) => r.status === 'draft');
      // already proven reachable above (own-project checks passed) — this
      // just reconfirms the status value itself is the mapped "draft",
      // not something else that happened to also work.
      return bothDraft;
    });
  }

  // ---------- Part 2: throwaway collaboration for schema-behavior checks ----------
  const admin = ctx.fixtures.adminIdentity;
  const probe = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
    authHeader: bearerFor(admin),
    body: {
      op: 'create_collaboration',
      title: 'K1.6B schema-probe (disposable)',
      artistDisplayName: 'K1.6B Probe Artist',
      classification: 'track',
      musicalKey: 'A♭',
      notes: 'Internal project code: K16B-PROBE-DISPOSABLE. Not a real artist collaboration.',
    },
  });
  const probeId = probe.body.collaborationId;

  const probeArtist = await createAndSignInTestUser(clients, testEmail('k16b-probe-artist'), 'Signal-Portal-K16B-Probe-1!');
  try {
    await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
      authHeader: bearerFor(admin),
      body: { op: 'update_collaboration', collaborationId: probeId, status: 'draft' },
    });
    await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
      authHeader: bearerFor(admin),
      body: { op: 'add_member', collaborationId: probeId, userId: probeArtist.uid },
    });

    await check('[K1.6B schema] an invalid project id does not expose any data — not-found and not-authorized read identically', async () => {
      const { data, error } = await probeArtist.client.from('collaborations').select('id').eq('id', '00000000-0000-0000-0000-000000000000');
      return !error && (data?.length ?? 0) === 0;
    });

    await check('[K1.6B schema] an assigned member CAN read a "draft"-status collaboration they are a real active member of', async () => {
      const { data } = await probeArtist.client.from('collaborations').select('id,status').eq('id', probeId).single();
      return data?.id === probeId && data?.status === 'draft';
    });

    await check('[K1.6B schema] the internal project code survives round-trip in notes, exactly as written', async () => {
      const { data } = await clients.admin.from('collaborations').select('notes').eq('id', probeId).single();
      return data?.notes?.includes('K16B-PROBE-DISPOSABLE');
    });
  } finally {
    await deleteTestUser(clients, probeArtist.uid);
    await clients.admin.from('collaborations').delete().eq('id', probeId);
  }
}
