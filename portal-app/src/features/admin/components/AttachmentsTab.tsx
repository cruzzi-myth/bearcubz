import { useMemo, useState } from 'react';
import { useAdminAttachments } from '../hooks/useAdminAttachments';
import { reviewAttachment, retryAttachmentScan } from '../services/adminApi';
import { useAttachmentSignedUrl } from '../../../hooks/useAttachmentSignedUrl';
import { PdfCanvasViewer } from '../../../components/PdfCanvasViewer';
import { supabase } from '../../../services/supabaseClient';
import type { AdminAttachment, AttachmentStatus } from '../types/adminTypes';

const AUDIO_MIME = new Set(['audio/x-wav', 'audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a']);
const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

type StatusFilter = 'all' | 'pending' | 'available' | 'rejected' | 'failed';

// Stage K1.6D section 3's exact four review-queue status buckets. Any
// in-flight pre-scan state (pending_upload/uploaded/awaiting_scan/
// promoting/clean) groups under "Pending review" -- the artist and
// the admin both only care "is this still being worked on," not the
// exact internal step.
function bucketFor(status: AttachmentStatus): Exclude<StatusFilter, 'all'> {
  if (status === 'available') return 'available';
  if (status === 'rejected') return 'rejected';
  if (status === 'failed') return 'failed';
  return 'pending';
}

// Reuses the existing sp-admin__pill convention (see admin.css) rather
// than inventing a parallel badge style.
const PILL_VARIANT: Record<Exclude<StatusFilter, 'all'>, string> = {
  available: '',
  pending: 'sp-admin__pill--warn',
  rejected: 'sp-admin__pill--bad',
  failed: 'sp-admin__pill--bad',
};

// Stage K1.6E — security_status's own pill variant, deliberately
// separate from the physical-location `status` pill above: this is
// the malware-clearance verdict specifically, never conflated with
// where the administrator's review stands.
const SECURITY_PILL_VARIANT: Record<AdminAttachment['securityStatus'], string> = {
  pending: 'sp-admin__pill--warn',
  scanning: 'sp-admin__pill--warn',
  clean: '',
  infected: 'sp-admin__pill--bad',
  error: 'sp-admin__pill--bad',
};

// Stage K1.6G section 8 — a read-only display mirror of
// scanRetryPolicy.ts's categorizeScanError (supabase/functions/_shared,
// a Deno module outside this Vite project's build, same reason
// AttachmentList.tsx mirrors MAX_AUTOMATIC_SCAN_ATTEMPTS rather than
// importing it). Never used for any access-control decision here —
// purely a human-readable label over the raw detail string the admin
// can already see in full in the Security column.
function categorizeScanErrorForDisplay(detail: string | null): string {
  if (!detail) return 'none';
  if (detail.startsWith('EXCEEDS_SCANNER_SIZE_LIMIT')) return 'file too large for scanner';
  if (detail === 'SCANNER_NOT_CONFIGURED') return 'scanner not configured';
  if (detail.startsWith('HTTP_429_RATE_LIMITED')) return 'vendor rate limited';
  if (detail.startsWith('INVALID_RESPONSE')) return 'invalid vendor response';
  if (detail.startsWith('HTTP_')) return 'vendor error';
  if (detail === 'SCAN_TIMEOUT') return 'vendor timeout';
  if (detail === 'SCAN_NETWORK_ERROR') return 'network failure';
  if (detail === 'LEASE_EXPIRED') return 'scan interrupted';
  return 'unknown';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}

/** Safe preview — ONLY ever rendered for status === 'available'
 * (checked by the caller below, not re-checked here) — this is the
 * one path that ever requests a signed URL, and
 * portal-attachment-signed-url itself refuses anything but
 * 'available' regardless, so a quarantined/rejected file can never
 * reach this component even if that check were skipped. */
function SafePreview({ attachment }: { attachment: AdminAttachment }) {
  const signed = useAttachmentSignedUrl(attachment.id);
  const [open, setOpen] = useState(false);

  if (signed.status === 'loading') return <span className="sp-admin__empty">Loading preview…</span>;
  if (signed.status !== 'ready') return <span className="sp-admin__empty">Preview unavailable</span>;

  if (AUDIO_MIME.has(attachment.mimeType)) return <audio controls src={signed.url} style={{ width: '100%', maxWidth: 320 }} />;
  if (IMAGE_MIME.has(attachment.mimeType)) return <img src={signed.url} alt={attachment.originalFilename} style={{ maxWidth: 160, borderRadius: 6 }} />;
  if (attachment.mimeType === 'application/pdf') {
    return open ? (
      <div style={{ maxWidth: 420 }}>
        <PdfCanvasViewer url={signed.url} label={attachment.originalFilename} />
        <button type="button" className="sp-admin__btn" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
    ) : (
      <button type="button" className="sp-admin__btn" onClick={() => setOpen(true)}>
        View
      </button>
    );
  }
  return (
    <a className="sp-admin__btn" href={signed.url} target="_blank" rel="noopener noreferrer">
      Download
    </a>
  );
}

function ReviewRow({ attachment, expanded, onToggle, onChanged }: { attachment: AdminAttachment; expanded: boolean; onToggle: () => void; onChanged: () => void }) {
  const [reasonInput, setReasonInput] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bucket = bucketFor(attachment.status);

  async function handleApprove() {
    setBusy(true);
    setError(null);
    const result = await reviewAttachment(attachment.id, 'clean');
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChanged();
  }

  async function handleReject() {
    const reason = reasonInput.trim();
    if (!reason) {
      setError('A rejection reason is required so the artist understands the decision.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await reviewAttachment(attachment.id, 'rejected', reason);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setShowRejectForm(false);
    setReasonInput('');
    onChanged();
  }

  async function handleRetryScan() {
    setBusy(true);
    setError(null);
    const result = await retryAttachmentScan(attachment.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChanged();
  }

  return (
    <tr>
      <td>{attachment.collaborationTitle}</td>
      <td>{attachment.authorIsAdminReply ? 'THE COLLECTIVE' : attachment.authorId.slice(0, 8)}</td>
      <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachment.originalFilename}</td>
      <td>{attachment.mimeType}</td>
      <td>{formatFileSize(attachment.byteSize)}</td>
      <td>{formatAt(attachment.uploadedAt)}</td>
      <td>
        <span className={`sp-admin__pill ${PILL_VARIANT[bucket]}`}>{attachment.status}</span>
        {attachment.status === 'rejected' && attachment.rejectionReason && (
          <p style={{ fontSize: 11, color: 'var(--sp-ink-faint)', margin: '4px 0 0' }}>{attachment.rejectionReason}</p>
        )}
        {attachment.status === 'promoting' && attachment.promotionError && (
          <p style={{ fontSize: 11, color: 'var(--pink)', margin: '4px 0 0' }}>{attachment.promotionError}</p>
        )}
      </td>
      <td>
        <span className={`sp-admin__pill ${SECURITY_PILL_VARIANT[attachment.securityStatus]}`}>{attachment.securityStatus}</span>
        {attachment.scanProvider && attachment.scanProvider !== 'none' && (
          <p style={{ fontSize: 11, color: 'var(--sp-ink-faint)', margin: '4px 0 0' }}>via {attachment.scanProvider}</p>
        )}
        {attachment.securityScanDetail && (
          <p style={{ fontSize: 11, color: attachment.securityStatus === 'infected' ? 'var(--pink)' : 'var(--sp-ink-faint)', margin: '2px 0 0' }}>
            {attachment.securityScanDetail}
          </p>
        )}
        {attachment.securityStatus === 'error' && (
          <button type="button" className="sp-admin__btn" disabled={busy || !attachment.isActive} onClick={handleRetryScan} style={{ marginTop: 4 }}>
            Retry Scan
          </button>
        )}
      </td>
      <td style={{ fontSize: 11, color: 'var(--sp-ink-faint)' }}>
        <p style={{ margin: 0 }}>
          Attempts: {attachment.scanAttemptCount} / 3 automatic{attachment.scanAttemptCount >= 3 ? ' (exhausted)' : ''}
        </p>
        {attachment.securityStatus === 'error' && (
          <p style={{ margin: '2px 0 0' }}>Last error: {categorizeScanErrorForDisplay(attachment.scanLastError)}</p>
        )}
        {attachment.scanNextRetryAt && (
          <p style={{ margin: '2px 0 0' }}>Next automatic retry: {formatAt(attachment.scanNextRetryAt)}</p>
        )}
        {attachment.awaitingScannerCapacity && (
          <p style={{ margin: '2px 0 0', color: 'var(--pink)' }}>
            Awaiting scanner capacity since {attachment.scanWaitingSince ? formatAt(attachment.scanWaitingSince) : 'unknown'} — retained until{' '}
            {attachment.scanRetentionExpiresAt ? formatAt(attachment.scanRetentionExpiresAt) : 'unknown'}. Use Retry Scan above to request a rescan.
          </p>
        )}
        {!attachment.isActive && <p style={{ margin: '2px 0 0' }}>Cleaned up — no longer actionable.</p>}
      </td>
      <td>
        {bucket === 'available' && (
          <button type="button" className="sp-admin__btn" onClick={onToggle}>
            {expanded ? 'Hide' : 'Preview'}
          </button>
        )}
        {/* Stage K1.6E: review actions only ever appear once malware
            clearance has independently landed on 'clean' (status
            'clean' is only reachable that way — see
            scanOrchestrator.ts) — never while still scanning,
            errored, or infected. This is a UI convenience only; the
            real enforcement is server-side in
            portal-admin-review-attachment, which this button can
            never bypass. */}
        {attachment.status === 'clean' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="sp-admin__btn" disabled={busy} onClick={handleApprove}>
                Approve
              </button>
              <button type="button" className="sp-admin__btn" disabled={busy} onClick={() => setShowRejectForm((v) => !v)}>
                Reject
              </button>
            </div>
            {showRejectForm && (
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  placeholder="Rejection reason (required)"
                  aria-label="Rejection reason"
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  style={{ fontSize: 11, padding: '4px 6px', minWidth: 160 }}
                />
                <button type="button" className="sp-admin__btn" disabled={busy} onClick={handleReject}>
                  Confirm Reject
                </button>
              </div>
            )}
          </div>
        )}
        {bucket === 'pending' && attachment.status !== 'clean' && <span className="sp-admin__empty">Awaiting malware scan…</span>}
        {error && <p className="sp-admin__status-msg sp-admin__status-msg--error">{error}</p>}
      </td>
    </tr>
  );
}

export function AttachmentsTab() {
  const { state, reload } = useAdminAttachments();
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [reconciling, setReconciling] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (state.kind !== 'ready') return [];
    return state.attachments.filter((a) => {
      if (projectFilter !== 'all' && a.collaborationId !== projectFilter) return false;
      if (statusFilter !== 'all' && bucketFor(a.status) !== statusFilter) return false;
      return true;
    });
  }, [state, projectFilter, statusFilter]);

  async function handleReconcile() {
    setReconciling(true);
    await supabase.functions.invoke('portal-admin-reconcile-attachment-promotion', { body: {} });
    setReconciling(false);
    reload();
  }

  if (state.kind === 'loading') return <p className="sp-admin__empty">Loading attachments…</p>;
  if (state.kind === 'backend-unavailable') return <p className="sp-admin__status-msg sp-admin__status-msg--error">Backend not configured in this environment yet.</p>;
  if (state.kind === 'error') return <p className="sp-admin__status-msg sp-admin__status-msg--error">{state.message}</p>;

  const hasStuckPromotions = state.attachments.some((a) => a.status === 'promoting');

  return (
    <>
      <h2>Attachment Review</h2>
      <p className="sp-admin__empty" style={{ marginBottom: 12 }}>
        Administrator approval records an independent decision — it is never malware clearance. The two are shown as
        separate columns below. The real scanner integration (Cloudmersive) activates once CLOUDMERSIVE_API_KEY is
        configured; until then every non-EICAR upload reports a genuine scanner error (see the K1.6E report) and sits in
        "Security: error" — retryable, but never approvable. The EICAR industry test fixture is always detected locally
        and reported as "Security: infected."
      </p>

      <div className="sp-admin__filters" style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <label>
          <span className="sp-sr-only">Filter by project</span>
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} aria-label="Filter by project">
            <option value="all">All Projects</option>
            {state.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sp-sr-only">Filter by status</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} aria-label="Filter by status">
            <option value="all">All Statuses</option>
            <option value="pending">Pending Review</option>
            <option value="available">Available</option>
            <option value="rejected">Rejected</option>
            <option value="failed">Failed</option>
          </select>
        </label>
        {hasStuckPromotions && (
          <button type="button" className="sp-admin__btn" disabled={reconciling} onClick={handleReconcile}>
            {reconciling ? 'Reconciling…' : 'Reconcile Stuck Promotions'}
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="sp-admin__empty">No attachments match this filter.</p>
      ) : (
        <div className="sp-admin__table-wrap">
          <table className="sp-admin__table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Author</th>
                <th>Filename</th>
                <th>Type</th>
                <th>Size</th>
                <th>Uploaded</th>
                <th>Status</th>
                <th>Security</th>
                <th>Recovery</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const expanded = expandedId === a.id;
                return (
                  <ReviewRowGroup
                    key={a.id}
                    attachment={a}
                    expanded={expanded}
                    onToggle={() => setExpandedId(expanded ? null : a.id)}
                    onChanged={reload}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ReviewRowGroup({ attachment, expanded, onToggle, onChanged }: { attachment: AdminAttachment; expanded: boolean; onToggle: () => void; onChanged: () => void }) {
  return (
    <>
      <ReviewRow attachment={attachment} expanded={expanded} onToggle={onToggle} onChanged={onChanged} />
      {expanded && attachment.status === 'available' && (
        <tr>
          <td colSpan={10}>
            <SafePreview attachment={attachment} />
          </td>
        </tr>
      )}
    </>
  );
}
