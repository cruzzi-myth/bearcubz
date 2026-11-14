import { useParams } from 'react-router-dom';
import { useState, type FormEvent } from 'react';
import { PortalChamberLayout } from '../layouts/PortalChamberLayout';
import { PortalEmptyState } from '../components/PortalEmptyState';
import { ChamberNoProjectState } from '../components/ChamberNoProjectState';
import { AttachmentComposer } from '../components/AttachmentComposer';
import { AttachmentList } from '../components/AttachmentList';
import { useAuthorizedCollaboration } from '../hooks/useAuthorizedCollaboration';
import { useFeedbackThread } from '../hooks/useFeedbackThread';
import { useAttachmentUpload } from '../hooks/useAttachmentUpload';
import { useMessageAttachments } from '../hooks/useMessageAttachments';
import { PortalHost } from '../features/portal-host/PortalHost';
import { supabase } from '../services/supabaseClient';
import './chamber-content.css';

function formatAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export function TransmissionChamberPage() {
  const { id } = useParams();
  const authz = useAuthorizedCollaboration(id);
  const thread = useFeedbackThread(id);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const attachmentUpload = useAttachmentUpload();
  // The real feedbackId this composer's current/most-recent send used
  // — a retry must upload against the SAME message, never a blank or
  // stale id.
  const [activeFeedbackId, setActiveFeedbackId] = useState<string | null>(null);

  const messageIds = thread.status === 'ready' ? thread.messages.map((m) => m.id) : [];
  const attachmentsByMessage = useMessageAttachments(messageIds);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || !id) return;

    setSubmitting(true);
    setSubmitError(null);
    // author identity is never sent from here — portal-submit-feedback
    // derives it exclusively from the caller's verified session.
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; feedbackId?: string }>('portal-submit-feedback', {
      body: { collaborationId: id, kind: 'general', body: text },
    });

    if (error || !data?.ok || !data.feedbackId) {
      setSubmitting(false);
      setSubmitError("Couldn't send that right now. Please try again.");
      return;
    }

    // Stage K1.6C: attachments upload AFTER the message exists — the
    // real feedbackId from the response above is the only identifier
    // the attachment functions ever trust (see their own comments on
    // why collaborationId is never client-supplied). A failed
    // attachment never blocks the others or the message itself, which
    // has already been sent successfully by this point.
    setActiveFeedbackId(data.feedbackId);
    const pending = attachmentUpload.uploads.filter((u) => u.status === 'validating');
    if (pending.length > 0) {
      await attachmentUpload.uploadAll(data.feedbackId, pending);
    }

    setSubmitting(false);
    setBody('');
    if ('reload' in thread) thread.reload();
  }

  return (
    <>
    <PortalChamberLayout
      background="transmission-chamber.webp"
      backgroundAlt="A circular communications console with a holographic transmission globe — the Transmission Chamber environment"
      eyebrow="Respond"
      title="Transmission Chamber"
    >
      {authz.status === 'loading' && <PortalEmptyState message="Checking authorization for this collaboration…" showReturnLink={false} />}
      {authz.status === 'backend-unavailable' && (
        <PortalEmptyState message="The Signal Portal backend isn't configured in this environment yet." showReturnLink={false} />
      )}
      {authz.status === 'error' && <PortalEmptyState message="Couldn't load this collaboration right now. Please try again." />}
      {authz.status === 'not-authorized' && !id && (
        <ChamberNoProjectState message="No transmissions are available yet. Messages and collaboration feedback will appear here when a project is activated." />
      )}
      {authz.status === 'not-authorized' && id && <PortalEmptyState message="This collaboration isn't available to your account." />}

      {authz.status === 'authorized' && (
        <div className="sp-transmission">
          {/* Stage I2H fix: the thread div below scrolls (max-height +
              overflow-y: auto) but had no way for a keyboard user to
              focus it and scroll with arrow keys — tabIndex +
              role/aria-label make it a real, reachable, named region
              rather than a mouse-only scroll area. */}
          {thread.status === 'ready' && thread.messages.length > 0 && (
            <div className="sp-transmission__thread" role="log" aria-label="Feedback messages" tabIndex={0}>
              {thread.messages.map((m) => (
                <div key={m.id} className={`sp-transmission__msg${m.isAdminReply ? ' sp-transmission__msg--admin' : ''}`}>
                  <div className="sp-transmission__msg-meta">
                    <span>{m.isAdminReply ? 'The Collective' : 'You'}</span>
                    <span>{formatAt(m.createdAt)}</span>
                  </div>
                  <p className="sp-transmission__msg-body">{m.body}</p>
                  <AttachmentList attachments={attachmentsByMessage.byMessage[m.id] ?? []} />
                </div>
              ))}
            </div>
          )}
          {thread.status === 'ready' && thread.messages.length === 0 && (
            <p className="sp-proposal__empty">No messages yet for this collaboration.</p>
          )}

          <form className="sp-transmission__form" onSubmit={handleSubmit}>
            <label htmlFor="feedback-body" className="sp-listen__track-kind">
              Send Feedback
            </label>
            <textarea
              id="feedback-body"
              className="sp-transmission__textarea"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Share your thoughts on this collaboration…"
              maxLength={4000}
              disabled={submitting}
            />
            <AttachmentComposer
              uploads={attachmentUpload.uploads}
              onAddFiles={attachmentUpload.addFiles}
              onRemove={attachmentUpload.removeUpload}
              onRetry={(localId) => activeFeedbackId && void attachmentUpload.retryUpload(activeFeedbackId, localId)}
              disabled={submitting}
            />
            {submitError && <p className="sp-transmission__status sp-transmission__status--error">{submitError}</p>}
            <button type="submit" className="sp-transmission__submit" disabled={submitting || !body.trim()}>
              {submitting ? 'Sending…' : 'Send'}
            </button>
          </form>
        </div>
      )}
    </PortalChamberLayout>
    <PortalHost />
    </>
  );
}
