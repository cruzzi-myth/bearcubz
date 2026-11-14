// Read-only development asset evidence. Never prints credentials or signed URLs.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { assertSafeToRunIntegrationTests } from './_guard.mjs';

const safe = assertSafeToRunIntegrationTests();
if (safe.projectRef !== 'gcbonlvbgyhsgfayvlvz') throw new Error('Expected the approved development project');
const dataset = JSON.parse(readFileSync(new URL('../../docs/signal-portal/.k16b-dev-dataset.json', import.meta.url)));
const client = createClient(safe.supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const evidence = [];
for (const [artist, item] of Object.entries(dataset.collaborations)) {
  const collaboration = await client.from('collaborations').select('id,title,bpm,musical_key,classification').eq('id', item.id).single();
  if (collaboration.error) throw collaboration.error;
  const assets = await client.from('collaboration_assets').select('*').eq('collaboration_id', item.id).order('uploaded_at');
  if (assets.error) throw assets.error;
  const records = [];
  for (const asset of assets.data) {
    const download = await client.storage.from(asset.storage_bucket).download(asset.storage_path);
    if (download.error) throw download.error;
    const bytes = Buffer.from(await download.data.arrayBuffer());
    records.push({ id: asset.id, type: asset.asset_type, label: asset.display_label, bucket: asset.storage_bucket, path: asset.storage_path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), active: asset.is_active, approval: asset.approval_status, upload: asset.upload_status, primaryCover: asset.is_primary_cover });
  }
  // Scan evidence may live in the attachment audit workflow, separate from assets.
  const scans = await client.from('collaboration_feedback_attachments').select('id,original_filename,byte_size,security_status,security_scan_detail,scan_provider,scanned_at,review_status,status').eq('collaboration_id', item.id);
  if (scans.error) throw scans.error;
  evidence.push({ artist, collaboration: collaboration.data, assets: records, scans: scans.data });
}
const outputName = process.env.SIGNAL_PORTAL_ASSET_EVIDENCE_STAGE === 'k16h2' ? 'k16h2-source-assets.json' : 'k16h1-source-assets.json';
const output = new URL('../../docs/signal-portal/' + outputName, import.meta.url);
writeFileSync(output, JSON.stringify({ verifiedAt: new Date().toISOString(), project: safe.projectRef, evidence }, null, 2) + '\n');
console.log('Verified source bytes for', evidence.reduce((n, e) => n + e.assets.length, 0), 'private assets; evidence saved without credentials.');
