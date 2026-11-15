// Stage K1.6O — portal-admin-delete-asset: a genuine, permanent
// delete (distinct from mark_asset_inactive, which only ever flips
// is_active and keeps both the row and the Storage object). Verifies
// against the real dev project: successful deletion, permission
// denial, real Storage cleanup (not just the row), and that every
// prior audit-log entry for the asset survives the row's deletion.
import { check } from '../_harness.mjs';
import { callEdgeFunction, bearerFor } from '../_functions.mjs';
import { syntheticPdfBytes, syntheticPngBytes } from '../fixtures.mjs';

export async function run(ctx) {
  const { clients, fixtures, supabaseUrl, anonKey } = ctx;

  // --- successful deletion + real Storage cleanup ---
  const requested = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-request-upload-url', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { collaborationId: fixtures.collab1Id, assetType: 'proposal_pdf', mimeType: 'application/pdf', fileSizeBytes: syntheticPdfBytes().length, displayLabel: 'K1.6O deletable proposal' },
  });
  const assetId = requested.body.assetId;
  await fetch(requested.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: syntheticPdfBytes() });
  await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-confirm-upload', { authHeader: bearerFor(fixtures.adminIdentity), body: { assetId } });

  const { data: beforeRow } = await clients.admin.from('collaboration_assets').select('storage_bucket, storage_path').eq('id', assetId).single();
  await check('the real Storage object genuinely exists before deletion', async () => {
    const slash = beforeRow.storage_path.lastIndexOf('/');
    const listing = await clients.admin.storage.from(beforeRow.storage_bucket).list(beforeRow.storage_path.slice(0, slash), { search: beforeRow.storage_path.slice(slash + 1) });
    return listing.data?.some((f) => beforeRow.storage_path.endsWith(f.name));
  });

  const nonAdminDelete = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-delete-asset', {
    authHeader: bearerFor(fixtures.artistA),
    body: { assetId },
  });
  await check('permission denial: a non-admin cannot delete an asset, and it still exists afterward', async () => {
    if (nonAdminDelete.status !== 403) return false;
    const { data } = await clients.admin.from('collaboration_assets').select('id').eq('id', assetId).maybeSingle();
    return data?.id === assetId;
  });

  const anonDelete = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-delete-asset', { body: { assetId } });
  await check('an anonymous (anon-key-only) caller cannot delete an asset either', () => anonDelete.status === 403);

  const deleted = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-delete-asset', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { assetId },
  });
  await check('an admin can genuinely delete the asset', () => deleted.status === 200 && deleted.body.ok === true);

  await check('the collaboration_assets row is genuinely gone, not just marked inactive', async () => {
    const { data } = await clients.admin.from('collaboration_assets').select('id').eq('id', assetId).maybeSingle();
    return data === null;
  });

  await check('the real Storage object is genuinely gone too, not just the row', async () => {
    const slash = beforeRow.storage_path.lastIndexOf('/');
    const listing = await clients.admin.storage.from(beforeRow.storage_bucket).list(beforeRow.storage_path.slice(0, slash), { search: beforeRow.storage_path.slice(slash + 1) });
    return !listing.data?.some((f) => beforeRow.storage_path.endsWith(f.name));
  });

  await check('every prior audit-log entry for this asset (upload, scan) survives the row being deleted', async () => {
    const { data } = await clients.admin.from('portal_admin_audit_log').select('action').eq('target_id', assetId);
    const actions = (data ?? []).map((r) => r.action);
    return actions.includes('request_upload_url') && actions.includes('asset_scan_result');
  });

  await check('a new delete_asset audit entry was written, preserving the asset details for the record', async () => {
    const { data } = await clients.admin.from('portal_admin_audit_log').select('details').eq('target_id', assetId).eq('action', 'delete_asset').maybeSingle();
    return data?.details?.asset_type === 'proposal_pdf' && data?.details?.collaboration_id === fixtures.collab1Id;
  });

  await check('deleting an already-deleted (nonexistent) asset returns ASSET_NOT_FOUND, not a crash', async () => {
    const again = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-delete-asset', { authHeader: bearerFor(fixtures.adminIdentity), body: { assetId } });
    return again.status === 404 && again.body.error === 'ASSET_NOT_FOUND';
  });

  // --- a visual asset with a thumbnail: both objects must be removed ---
  const visualReq = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-request-upload-url', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { collaborationId: fixtures.collab1Id, assetType: 'visual_image', mimeType: 'image/png', fileSizeBytes: syntheticPngBytes().length, displayLabel: 'K1.6O deletable visual with thumbnail', includeThumbnail: true },
  });
  await fetch(visualReq.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: syntheticPngBytes() });
  await fetch(visualReq.body.thumbnailUploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: syntheticPngBytes() });
  await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-confirm-upload', { authHeader: bearerFor(fixtures.adminIdentity), body: { assetId: visualReq.body.assetId } });

  const { data: visualRow } = await clients.admin.from('collaboration_assets').select('storage_bucket, storage_path, thumbnail_storage_path').eq('id', visualReq.body.assetId).single();
  const visualDeleted = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-delete-asset', { authHeader: bearerFor(fixtures.adminIdentity), body: { assetId: visualReq.body.assetId } });
  await check('deleting a visual asset with a thumbnail succeeds', () => visualDeleted.status === 200 && visualDeleted.body.ok === true);

  await check('both the primary image and its thumbnail are genuinely removed from Storage', async () => {
    const slash1 = visualRow.storage_path.lastIndexOf('/');
    const primaryListing = await clients.admin.storage.from(visualRow.storage_bucket).list(visualRow.storage_path.slice(0, slash1), { search: visualRow.storage_path.slice(slash1 + 1) });
    const slash2 = visualRow.thumbnail_storage_path.lastIndexOf('/');
    const thumbListing = await clients.admin.storage.from(visualRow.storage_bucket).list(visualRow.thumbnail_storage_path.slice(0, slash2), { search: visualRow.thumbnail_storage_path.slice(slash2 + 1) });
    return !primaryListing.data?.some((f) => visualRow.storage_path.endsWith(f.name)) && !thumbListing.data?.some((f) => visualRow.thumbnail_storage_path.endsWith(f.name));
  });
}
