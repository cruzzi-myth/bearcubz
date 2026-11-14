import { corsHeaders, json } from '../_shared/cors.ts';
import { requiredEnv, createAdminClient } from '../_shared/clients.ts';
import { requireAdmin } from '../_shared/requireAdmin.ts';
import { claimAndRunScan } from '../_shared/scanOrchestrator.ts';

const QUARANTINE_BUCKET = 'collaboration-attachments-quarantine';

/**
 * Stage K1.6E section 6 — "Retry an eligible failed scan through an
 * authorized workflow." Admin-only. "Eligible" means
 * security_status = 'error' specifically — a transient scanner
 * failure (outage, timeout, misconfiguration), not an actual verdict.
 * An 'infected' result is final and NOT retryable here (retrying a
 * real positive would be exactly the "override an infected file"
 * path section 6 forbids); a 'clean'/'scanning'/'pending' row has
 * nothing to retry. claimAndRunScan's own atomic claim (WHERE
 * security_status IN ('pending','error')) is the real enforcement —
 * this function's own status check below is a second, explicit layer
 * matching this codebase's established "don't rely on one layer
 * alone" convention.
 */
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const env = requiredEnv();
  if (!env) return json({ error: 'SERVER_CONFIG' }, 500);

  const admin = await requireAdmin(env.supabaseUrl, request.headers.get('Authorization'));
  if (!admin) return json({ error: 'NOT_AUTHORIZED' }, 403);

  let body: { attachmentId?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }
  if (!body.attachmentId) return json({ error: 'INVALID_INPUT' }, 400);

  const adminClient = createAdminClient(env.supabaseUrl, env.serviceKey);

  const attachment = await adminClient
    .from('collaboration_feedback_attachments')
    .select('id, storage_bucket, storage_path, security_status, mime_type')
    .eq('id', body.attachmentId)
    .maybeSingle();
  if (!attachment.data) return json({ error: 'ATTACHMENT_NOT_FOUND' }, 404);

  if (attachment.data.security_status !== 'error') {
    return json({ error: 'NOT_RETRYABLE', securityStatus: attachment.data.security_status }, 409);
  }
  if (attachment.data.storage_bucket !== QUARANTINE_BUCKET) {
    // Should be structurally impossible (an 'error' row never got
    // promoted), but checked explicitly rather than assumed.
    return json({ error: 'NOT_RETRYABLE', reason: 'NOT_IN_QUARANTINE' }, 409);
  }

  const bytes = null; // Stream and pin bytes after the atomic lease claim.
  const filename = attachment.data.storage_path.split('/').pop() ?? 'upload';

  const scan = await claimAndRunScan(adminClient, body.attachmentId, bytes, filename, attachment.data.mime_type, 'manual_admin_retry');
  if (!scan) {
    // Lost the claim race (e.g. a concurrent retry click, or the row
    // moved out of 'error' between the check above and the claim) —
    // report the real current state, not a fabricated success.
    const current = await adminClient.from('collaboration_feedback_attachments').select('security_status, status').eq('id', body.attachmentId).single();
    return json({ ok: true, retried: false, securityStatus: current.data?.security_status, status: current.data?.status });
  }

  await adminClient.from('portal_admin_audit_log').insert({
    admin_id: admin.uid,
    action: 'retry_attachment_scan',
    target_table: 'collaboration_feedback_attachments',
    target_id: body.attachmentId,
    details: { verdict: scan.verdict, provider: scan.provider },
  });

  const final = await adminClient.from('collaboration_feedback_attachments').select('security_status, status').eq('id', body.attachmentId).single();
  return json({ ok: true, retried: true, securityStatus: final.data?.security_status, status: final.data?.status });
});
