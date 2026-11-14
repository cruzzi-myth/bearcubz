import { useState } from 'react';
import type { MessageAttachment } from '../hooks/useMessageAttachments';
import { useAttachmentSignedUrl } from '../hooks/useAttachmentSignedUrl';
import { PdfCanvasViewer } from './PdfCanvasViewer';
import { formatFileSize } from '../lib/attachmentRules';
import './attachment-list.css';

const AUDIO_MIME = new Set(['audio/x-wav', 'audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a']);
const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

// Stage K1.6G section 6 — the brief's required exact "available" copy.
// Never rendered until status === 'available' (the caller below only
// mounts these three components in that case), so this can never be
// shown before both malware clearance and administrator approval are
// genuinely true. Kept as a small caption rather than a banner, per
// "Preserve the existing cinematic design."
function AvailableCaption() {
  return <span className="sp-attach-display__available-caption">Your file is approved and available to authorized collaborators.</span>;
}

function AudioAttachment({ attachment }: { attachment: MessageAttachment }) {
  const signed = useAttachmentSignedUrl(attachment.id);
  return (
    <div className="sp-attach-display__audio">
      <span className="sp-attach-display__name">{attachment.originalFilename}</span>
      <AvailableCaption />
      {signed.status === 'ready' && <audio controls src={signed.url} style={{ width: '100%' }} />}
      {signed.status === 'loading' && <span className="sp-attach-display__loading">Loading…</span>}
      {signed.status === 'unavailable' && <span className="sp-attach-display__loading">Unavailable</span>}
    </div>
  );
}

function ImageAttachment({ attachment }: { attachment: MessageAttachment }) {
  const signed = useAttachmentSignedUrl(attachment.id);
  const [enlarged, setEnlarged] = useState(false);
  return (
    <div className="sp-attach-display__image">
      {signed.status === 'ready' && (
        <>
          <button type="button" className="sp-attach-display__thumb-btn" onClick={() => setEnlarged(true)} aria-label={`Enlarge ${attachment.originalFilename}`}>
            <img src={signed.url} alt={attachment.originalFilename} className="sp-attach-display__thumb" />
          </button>
          {enlarged && (
            <div className="sp-gallery__lightbox" role="dialog" aria-label={attachment.originalFilename} onClick={() => setEnlarged(false)}>
              <button type="button" className="sp-gallery__lightbox-close" onClick={() => setEnlarged(false)} aria-label="Close">
                ×
              </button>
              <img src={signed.url} alt={attachment.originalFilename} onClick={(e) => e.stopPropagation()} />
            </div>
          )}
        </>
      )}
      {signed.status === 'loading' && <span className="sp-attach-display__loading">Loading…</span>}
      <AvailableCaption />
    </div>
  );
}

function DocumentAttachment({ attachment }: { attachment: MessageAttachment }) {
  const [open, setOpen] = useState(false);
  const signed = useAttachmentSignedUrl(open ? attachment.id : null);
  const isPdf = attachment.mimeType === 'application/pdf';

  if (isPdf && open) {
    return (
      <div className="sp-attach-display__doc-open">
        <PdfCanvasViewer url={signed.status === 'ready' ? signed.url : null} label={attachment.originalFilename} />
        <button type="button" className="sp-proposal__view-btn" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="sp-attach-display__doc">
      <span className="sp-attach-display__name">{attachment.originalFilename}</span>
      <span className="sp-attach-display__size">{formatFileSize(attachment.byteSize)}</span>
      <AvailableCaption />
      {!open && (
        <button type="button" className="sp-attach-display__open-btn" onClick={() => setOpen(true)}>
          {isPdf ? 'View' : 'Open'}
        </button>
      )}
      {open && !isPdf && signed.status === 'ready' && (
        // DOCX/TXT: never rendered inline as HTML — an authorized
        // signed-URL download/open is the safe path for formats this
        // app has no trusted in-page renderer for.
        <a className="sp-attach-display__open-btn" href={signed.url} target="_blank" rel="noopener noreferrer">
          Download
        </a>
      )}
      {open && signed.status === 'loading' && <span className="sp-attach-display__loading">Preparing…</span>}
    </div>
  );
}

// Stage K1.6G section 2 — mirrors scanRetryPolicy.ts's
// MAX_AUTOMATIC_SCAN_ATTEMPTS (3). Not fetched from the backend at
// runtime (no endpoint exposes it) — a hardcoded mirror, same
// established pattern as attachmentRules.ts's own upload-limit mirror.
const MAX_AUTOMATIC_SCAN_ATTEMPTS = 3;

/**
 * Stage K1.6G section 6 — the exact required artist-facing copy for
 * every real upload/scan state, kept honest and specific rather than
 * the single generic "Pending review" label this used before. Never
 * says "Approved"/"available" until BOTH malware clearance (security
 * status) and administrator approval (review status, implied by
 * status='available' — the DB's own attachment_available_requires_clearance
 * constraint guarantees this) are genuinely true.
 */
function describeAttachmentStatus(attachment: MessageAttachment): { label: string; emphasis?: 'warn' | 'bad' } {
  if (attachment.status === 'rejected') {
    return { label: 'This file was not approved for sharing.', emphasis: 'bad' };
  }
  if (!attachment.isActive) {
    return { label: 'This upload expired before security verification could be completed.', emphasis: 'bad' };
  }
  if (attachment.awaitingScannerCapacity) {
    return { label: 'Your file is stored privately but cannot be delivered until security scanning is available.', emphasis: 'warn' };
  }
  if (attachment.status === 'pending_upload' || attachment.status === 'uploaded') {
    return { label: 'Uploading your file securely…' };
  }
  if (attachment.status === 'awaiting_scan') {
    if (attachment.securityStatus === 'scanning') return { label: 'Your file is being checked for security.' };
    if (attachment.securityStatus === 'error') {
      return attachment.scanAttemptCount >= MAX_AUTOMATIC_SCAN_ATTEMPTS
        ? { label: 'The security check could not be completed. The file remains private and unavailable.', emphasis: 'bad' }
        : { label: 'The security check was interrupted. We’ll retry automatically when possible.', emphasis: 'warn' };
    }
    return { label: 'Upload complete. Your file is awaiting a security check.' };
  }
  if (attachment.status === 'clean' || attachment.status === 'promoting') {
    return { label: 'Security check passed. Your file is awaiting review.' };
  }
  if (attachment.status === 'failed') {
    return { label: 'The security check could not be completed. The file remains private and unavailable.', emphasis: 'bad' };
  }
  return { label: 'Your file is being checked for security.' };
}

/** Stage K1.6D — a row can now arrive here in ANY status, not only
 * 'available': the member policy still only ever returns someone
 * ELSE's attachment once it's available, but the uploader's OWN row
 * is now visible to them at every status (see the K1.6D migration),
 * specifically so their own "pending review"/"rejected"/"failed"
 * state survives a page refresh. Only 'available' ever renders real
 * content — every other status renders a plain, honest status badge,
 * never a preview, never a signed-URL request (portal-attachment-
 * signed-url refuses anything but 'available' anyway, so this isn't
 * just a UI nicety). */
function StatusOnlyAttachment({ attachment }: { attachment: MessageAttachment }) {
  const { label, emphasis } = describeAttachmentStatus(attachment);
  const rejected = attachment.status === 'rejected';
  return (
    <div className={`sp-attach-display__status${rejected ? ' sp-attach-display__status--rejected' : ''}${emphasis ? ` sp-attach-display__status--${emphasis}` : ''}`}>
      <span className="sp-attach-display__name">{attachment.originalFilename}</span>
      <span className="sp-attach-display__status-label">{label}</span>
      {rejected && attachment.rejectionReason && <p className="sp-attach-display__reason">{attachment.rejectionReason}</p>}
    </div>
  );
}

/** One attachment, shown for whichever type/status it actually is. */
export function AttachmentList({ attachments }: { attachments: MessageAttachment[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="sp-attach-display__list">
      {attachments.map((a) => {
        if (a.status !== 'available') return <StatusOnlyAttachment key={a.id} attachment={a} />;
        if (AUDIO_MIME.has(a.mimeType)) return <AudioAttachment key={a.id} attachment={a} />;
        if (IMAGE_MIME.has(a.mimeType)) return <ImageAttachment key={a.id} attachment={a} />;
        return <DocumentAttachment key={a.id} attachment={a} />;
      })}
    </div>
  );
}
