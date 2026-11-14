import { createHash, timingSafeEqual } from 'node:crypto';
import { requiredEnv, createAdminClient } from '../_shared/clients.ts';
import { json } from '../_shared/cors.ts';
Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' },405);
  const token = Deno.env.get('PORTAL_SCANNER_WORKER_TOKEN');
  const supplied = request.headers.get('Authorization') ?? '';
  if (!token || token.length<32 || !timingSafeEqual(createHash('sha256').update(supplied).digest(),createHash('sha256').update(`Bearer ${token}`).digest())) return json({ error: 'NOT_AUTHORIZED' },403);
  const env=requiredEnv(); if(!env) return json({error:'SERVER_CONFIG'},500);
  let body;
  try { body=await request.json(); } catch { return json({error:'INVALID_INPUT'},400); }
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(!['asset','attachment'].includes(body.objectKind)||!uuid.test(body.objectId)||!uuid.test(body.attemptId)) return json({error:'INVALID_INPUT'},400);
  const client=createAdminClient(env.supabaseUrl,env.serviceKey);
  const table=body.objectKind==='asset'?'collaboration_assets':'collaboration_feedback_attachments';
  const {data:row}=await client.from(table).select('*').eq('id',body.objectId).eq('scan_request_id',body.attemptId).eq('security_status','scanning').gt('scan_lease_expires_at',new Date(Date.now()+90_000).toISOString()).maybeSingle();
  if(!row || !row.file_sha256 || !row.is_active || (body.objectKind==='attachment'&&row.storage_bucket!=='collaboration-attachments-quarantine')) return json({error:'JOB_NOT_ELIGIBLE'},409);
  const signed=await client.storage.from(row.storage_bucket).createSignedUrl(row.storage_path,90);
  if(signed.error||!signed.data) return json({error:'CAPABILITY_FAILED'},500);
  return json({url:signed.data.signedUrl,attemptId:row.scan_request_id,fileSha256:row.file_sha256,fileSize:row.byte_size,mimeType:row.mime_type,leaseExpiresAt:row.scan_lease_expires_at});
});
