import { corsHeaders, json } from '../_shared/cors.ts';
import { requiredEnv, createAdminClient } from '../_shared/clients.ts';
import { requireAdmin } from '../_shared/requireAdmin.ts';

// Mirrors the approved limits/formats from the Stage D spec and the
// bucket-level limits set in the storage migration — this is the
// first of two independent enforcement points, not the only one.
const ASSET_RULES: Record<
  string,
  { bucket: string; maxBytes: number; mimeToExt: Record<string, string> }
> = {
  audio_short: {
    bucket: 'collaboration-audio',
    maxBytes: 100 * 1024 * 1024,
    mimeToExt: { 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav' },
  },
  audio_full: {
    bucket: 'collaboration-audio',
    maxBytes: 100 * 1024 * 1024,
    mimeToExt: { 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav' },
  },
  proposal_pdf: {
    bucket: 'collaboration-proposals',
    maxBytes: 25 * 1024 * 1024,
    mimeToExt: { 'application/pdf': 'pdf' },
  },
  visual_image: {
    bucket: 'collaboration-visuals',
    maxBytes: 15 * 1024 * 1024,
    mimeToExt: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' },
  },
  track_cover: {
    bucket: 'collaboration-visuals',
    maxBytes: 15 * 1024 * 1024,
    mimeToExt: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' },
  },
  alternate_cover: {
    bucket: 'collaboration-visuals',
    maxBytes: 15 * 1024 * 1024,
    mimeToExt: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' },
  },
  visual_concept: {
    bucket: 'collaboration-visuals',
    maxBytes: 15 * 1024 * 1024,
    mimeToExt: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' },
  },
};

const VISUAL_ASSET_TYPES = new Set(['visual_image', 'track_cover', 'alternate_cover', 'visual_concept']);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const env = requiredEnv();
  if (!env) return json({ error: 'SERVER_CONFIG' }, 500);

  const admin = await requireAdmin(env.supabaseUrl, request.headers.get('Authorization'));
  if (!admin) return json({ error: 'NOT_AUTHORIZED' }, 403);

  let body: {
    collaborationId?: string;
    assetType?: string;
    mimeType?: string;
    fileSizeBytes?: number;
    displayLabel?: string;
    description?: string;
    includeThumbnail?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }

  const assetType = body.assetType;
  if (!assetType) return json({ error: 'INVALID_ASSET_TYPE' }, 400);
  const rules = ASSET_RULES[assetType];
  if (!rules) return json({ error: 'INVALID_ASSET_TYPE' }, 400);

  const ext = body.mimeType ? rules.mimeToExt[body.mimeType] : undefined;
  if (!ext) return json({ error: 'INVALID_MIME_TYPE' }, 400);

  if (!Number.isFinite(body.fileSizeBytes) || body.fileSizeBytes! <= 0 || body.fileSizeBytes! > rules.maxBytes) {
    return json({ error: 'FILE_TOO_LARGE' }, 400);
  }

  const effectiveMax = Number(Deno.env.get('PORTAL_ADMIN_UPLOAD_MAX_BYTES') ?? 50 * 1024 * 1024);
  if (!Number.isSafeInteger(effectiveMax) || effectiveMax < 1 || effectiveMax > 50 * 1024 * 1024) return json({ error: 'INVALID_ADMIN_UPLOAD_POLICY' }, 500);
  if (body.fileSizeBytes! > effectiveMax) return json({ error: 'EXCEEDS_ADMIN_TRANSFER_LIMIT', maxBytes: effectiveMax }, 400);

  if (!body.collaborationId || !body.displayLabel) return json({ error: 'INVALID_INPUT' }, 400);

  const adminClient = createAdminClient(env.supabaseUrl, env.serviceKey);

  const collab = await adminClient.from('collaborations').select('id').eq('id', body.collaborationId).maybeSingle();
  if (!collab.data) return json({ error: 'INVALID_COLLABORATION' }, 400);

  const isVisual = VISUAL_ASSET_TYPES.has(assetType);

  // Recovery strategy for abandoned attempts (Stage H H10): an
  // incomplete previous attempt at the SAME asset_type for this
  // collaboration is retired (is_active = false) rather than left to
  // accumulate — it's never deleted (so the audit trail and the
  // Storage object, if one exists, both survive for later manual
  // cleanup), just no longer presented as a live attempt. This runs
  // automatically the next time this slot is retried; nothing here
  // deletes a Storage object or a row.
  await adminClient
    .from('collaboration_assets')
    .update({ is_active: false })
    .eq('collaboration_id', body.collaborationId)
    .eq('asset_type', assetType)
    .in('upload_status', ['pending', 'uploading', 'verifying', 'failed']);

  // Both path components are server-generated — the client never
  // supplies a filename, so there's no path-traversal surface here.
  const assetId = crypto.randomUUID();
  const storagePath = `${body.collaborationId}/${assetId}.${ext}`;

  const signed = await adminClient.storage.from(rules.bucket).createSignedUploadUrl(storagePath);
  if (signed.error || !signed.data) return json({ error: 'SIGN_FAILED' }, 500);

  // A thumbnail is a second, server-generated sibling object in the
  // same bucket — never a second collaboration_assets row, so the
  // one-primary-cover-per-collaboration constraint only ever has to
  // reason about a single row per artwork.
  let thumbnailUploadUrl: string | null = null;
  let thumbnailPath: string | null = null;
  if (body.includeThumbnail && isVisual) {
    thumbnailPath = `${body.collaborationId}/${assetId}-thumb.${ext}`;
    const signedThumb = await adminClient.storage.from(rules.bucket).createSignedUploadUrl(thumbnailPath);
    if (signedThumb.error || !signedThumb.data) return json({ error: 'SIGN_FAILED' }, 500);
    thumbnailUploadUrl = signedThumb.data.signedUrl;
  }

  // Recorded as upload_status: 'pending' (the column default) — NOT
  // ready, and is_primary_cover is never set here regardless of what
  // the admin intends, even for a visual asset. Both only ever become
  // true via portal-admin-confirm-upload, after Storage itself has
  // confirmed the object exists — see that function and
  // promote_primary_cover() in the upload-lifecycle migration for why
  // this was moved out of here.
  const inserted = await adminClient
    .from('collaboration_assets')
    .insert({
      id: assetId,
      collaboration_id: body.collaborationId,
      asset_type: assetType,
      storage_bucket: rules.bucket,
      storage_path: storagePath,
      thumbnail_storage_path: thumbnailPath,
      display_label: body.displayLabel,
      description: typeof body.description === 'string' ? body.description : null,
      approval_status: isVisual ? 'pending' : null,
      mime_type: body.mimeType,
      byte_size: body.fileSizeBytes,
      uploaded_by: admin.uid,
    })
    .select('id')
    .single();

  if (inserted.error) return json({ error: 'METADATA_FAILED' }, 500);

  await adminClient.from('portal_admin_audit_log').insert({
    admin_id: admin.uid,
    action: 'request_upload_url',
    target_table: 'collaboration_assets',
    target_id: assetId,
    details: { collaboration_id: body.collaborationId, asset_type: assetType },
  });

  return json({
    ok: true,
    assetId,
    uploadUrl: signed.data.signedUrl,
    path: signed.data.path,
    thumbnailUploadUrl,
  });
});
