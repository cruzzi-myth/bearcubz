import { corsHeaders, json } from '../_shared/cors.ts';
import { requiredEnv, createAdminClient } from '../_shared/clients.ts';
import { requireAdminOrSystem } from '../_shared/requireAdminOrSystem.ts';

const QUARANTINE_BUCKET = 'collaboration-attachments-quarantine';
const ABANDONED_RETENTION_DAYS = 7;
const REJECTED_RETENTION_DAYS = 30;
// Active-promotion grace window (K1.6G section 4): a genuine
// promotion resolves synchronously, in seconds, inside
// portal-admin-review-attachment's own request — this only exists to
// protect a promotion that started moments ago from a concurrently-
// running cleanup pass; a 'promoting' row older than this is a
// genuinely stuck one, which the existing abandoned-cleanup rule is
// correct to sweep (portal-admin-reconcile-attachment-promotion is
// the real recovery path for those, unaffected by this window).
const PROMOTION_GRACE_MINUTES = 10;

/**
 * Stage K1.6C section 1's approved retention policy: abandoned
 * (never-reached-a-terminal-state) quarantine uploads after 7 days,
 * rejected quarantine files after 30 days. Deletes the Storage object
 * only; the row is kept (is_active set false, never deleted) so audit
 * metadata survives the object itself — "retain appropriate audit
 * metadata after object deletion," per the brief.
 *
 * Admin-callable (a human administrator's manual button). Stage
 * K1.6E also schedules this function in DEVELOPMENT via pg_cron +
 * pg_net (see that migration) — the scheduled call authenticates with
 * the project's own service-role key as its Authorization bearer,
 * which requireAdminOrSystem() recognizes as the trusted "system"
 * caller (see that helper's own comment for why requireAdmin() alone
 * can't authorize a service-role-keyed call). NOT enabled for
 * production by this stage — see the K1.6E report.
 */
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const env = requiredEnv();
  if (!env) return json({ error: 'SERVER_CONFIG' }, 500);

  const caller = await requireAdminOrSystem(env.supabaseUrl, request.headers.get('Authorization'), request.headers.get('X-Signal-Portal-Cron-Secret'));
  if (!caller) return json({ error: 'NOT_AUTHORIZED' }, 403);

  const adminClient = createAdminClient(env.supabaseUrl, env.serviceKey);

  const abandonedCutoff = new Date(Date.now() - ABANDONED_RETENTION_DAYS * 86400_000).toISOString();
  const rejectedCutoff = new Date(Date.now() - REJECTED_RETENTION_DAYS * 86400_000).toISOString();
  const promotionGraceCutoff = new Date(Date.now() - PROMOTION_GRACE_MINUTES * 60_000).toISOString();
  const nowIso = new Date().toISOString();

  const abandoned = await adminClient
    .from('collaboration_feedback_attachments')
    .select('id, storage_bucket, storage_path, status')
    .eq('is_active', true)
    // Stage K1.6E: 'clean' is now a real, reachable state (scan
    // passed, awaiting administrator review) — a file an admin never
    // got around to reviewing is just as abandoned as one stuck
    // earlier in the pipeline, so it belongs in this list too, or it
    // would never be cleaned up at all.
    .in('status', ['pending_upload', 'uploaded', 'awaiting_scan', 'clean', 'failed', 'promoting'])
    .lt('uploaded_at', abandonedCutoff)
    // Stage K1.6G section 4: an oversized file genuinely awaiting
    // future scanner capacity gets its OWN 30-day retention sweep
    // below — it must never be caught by the 7-day abandoned rule
    // just because it's also still at status='awaiting_scan'.
    .eq('awaiting_scanner_capacity', false)
    // Stage K1.6G section 2/4: never delete a row currently under an
    // active scan lease (a retry could legitimately be in flight for
    // an old upload) or a promotion that started within the grace
    // window (still genuinely in progress, not stuck).
    .or(`security_status.neq.scanning,scan_lease_expires_at.lt.${nowIso}`)
    .or(`status.neq.promoting,promotion_attempted_at.lt.${promotionGraceCutoff}`);

  const rejected = await adminClient
    .from('collaboration_feedback_attachments')
    .select('id, storage_bucket, storage_path, status')
    .eq('is_active', true)
    .eq('status', 'rejected')
    .not('scanned_at', 'is', null)
    .lt('scanned_at', rejectedCutoff);

  // Stage K1.6G section 4 — the new, distinct 30-day retention policy
  // for files genuinely awaiting future scanner capacity. Same
  // quarantine-only deletion, row kept with is_active=false for audit
  // purposes, but gated on scan_retention_expires_at rather than the
  // 7-day abandoned cutoff.
  const retentionExpired = await adminClient
    .from('collaboration_feedback_attachments')
    .select('id, storage_bucket, storage_path, status')
    .eq('is_active', true)
    .eq('awaiting_scanner_capacity', true)
    .not('scan_retention_expires_at', 'is', null)
    .lt('scan_retention_expires_at', nowIso);

  const toClean = [...(abandoned.data ?? []), ...(rejected.data ?? []), ...(retentionExpired.data ?? [])];
  let cleaned = 0;
  for (const row of toClean) {
    // Only ever deletes from quarantine — a 'promoting' row stuck
    // past 7 days is cleaned up as abandoned too, but an 'available'
    // row (storage_bucket already the FINAL bucket) can never match
    // the status filter above, so this is structurally incapable of
    // deleting a live, delivered attachment.
    if (row.storage_bucket === QUARANTINE_BUCKET) {
      await adminClient.storage.from(QUARANTINE_BUCKET).remove([row.storage_path]);
    }
    await adminClient.from('collaboration_feedback_attachments').update({ is_active: false }).eq('id', row.id);
    cleaned += 1;
  }

  // portal_admin_audit_log.admin_id is NOT NULL with a real FK to
  // auth.users — a scheduler run has no human admin to attribute it
  // to, so it's attributed honestly to a dedicated, non-admin "system"
  // identity (SIGNAL_PORTAL_SYSTEM_UID, a real auth.users row that is
  // never added to portal_admins, created once for exactly this
  // purpose) rather than borrowing a real administrator's uid, which
  // would misrepresent who actually triggered the action.
  const systemUid = Deno.env.get('SIGNAL_PORTAL_SYSTEM_UID');
  const attributedTo = caller.kind === 'admin' ? caller.uid : systemUid;
  if (attributedTo) {
    await adminClient.from('portal_admin_audit_log').insert({
      admin_id: attributedTo,
      action: 'cleanup_quarantine',
      target_table: 'collaboration_feedback_attachments',
      target_id: null,
      details: { cleaned, abandoned: abandoned.data?.length ?? 0, rejected: rejected.data?.length ?? 0, triggeredBy: caller.kind },
    });
  }

  return json({ ok: true, cleaned });
});
