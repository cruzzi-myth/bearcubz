import { corsHeaders, json } from '../_shared/cors.ts';
import { requiredEnv, createAdminClient } from '../_shared/clients.ts';
import { requireAdmin } from '../_shared/requireAdmin.ts';

const FINAL_BUCKET = 'collaboration-attachments';

/**
 * Stage K1.6C section 6 — the recovery path for any attachment left
 * stuck in 'promoting' by an interrupted portal-admin-review-attachment
 * call (process killed mid-promotion, network failure between steps,
 * etc.). Re-derives the real answer by checking Storage directly
 * rather than guessing from the row's own possibly-stale state:
 *   - object genuinely present in the FINAL bucket, right size -> the
 *     move actually completed; the earlier failure was only in
 *     updating the row. Mark 'available' now.
 *   - not present -> the move never completed. Reset to 'clean' (Stage
 *     K1.6E: the one status an administrator's review action can act
 *     on) so an admin can safely retry the approval from a clean
 *     state, rather than leaving it stuck forever. security_status
 *     and review_status are NEVER reset here -- the scan already
 *     passed and the administrator's approval already happened; only
 *     the physical promotion needs retrying.
 * Admin-only. Safe to run repeatedly (idempotent) and against rows
 * that are NOT stuck (no-ops on anything not in 'promoting').
 */
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const env = requiredEnv();
  if (!env) return json({ error: 'SERVER_CONFIG' }, 500);

  const admin = await requireAdmin(env.supabaseUrl, request.headers.get('Authorization'));
  if (!admin) return json({ error: 'NOT_AUTHORIZED' }, 403);

  const adminClient = createAdminClient(env.supabaseUrl, env.serviceKey);

  const stuck = await adminClient
    .from('collaboration_feedback_attachments')
    .select('id, storage_path, byte_size')
    .eq('status', 'promoting');

  const results: Record<string, string> = {};
  for (const row of stuck.data ?? []) {
    const slash = row.storage_path.lastIndexOf('/');
    const listing = await adminClient.storage
      .from(FINAL_BUCKET)
      .list(row.storage_path.slice(0, slash), { search: row.storage_path.slice(slash + 1), limit: 1 });
    const landed = listing.data?.find((e) => e.name === row.storage_path.slice(slash + 1));
    const sizeMatches = landed?.metadata?.size == null || landed.metadata.size === row.byte_size;

    if (landed && sizeMatches) {
      await adminClient
        .from('collaboration_feedback_attachments')
        .update({ status: 'available', storage_bucket: FINAL_BUCKET, verified_at: new Date().toISOString(), promotion_error: null })
        .eq('id', row.id);
      results[row.id] = 'reconciled_available';
    } else {
      await adminClient
        .from('collaboration_feedback_attachments')
        .update({ status: 'clean', promotion_error: 'RECONCILED_NOT_PROMOTED_RETRY_AVAILABLE' })
        .eq('id', row.id);
      results[row.id] = 'reconciled_retry';
    }
  }

  await adminClient.from('portal_admin_audit_log').insert({
    admin_id: admin.uid,
    action: 'reconcile_attachment_promotions',
    target_table: 'collaboration_feedback_attachments',
    target_id: null,
    details: { results },
  });

  return json({ ok: true, reconciled: Object.keys(results).length, results });
});
