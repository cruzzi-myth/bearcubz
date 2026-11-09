import { useParams } from 'react-router-dom';
import { useState, type FormEvent } from 'react';
import { PortalChamberLayout } from '../layouts/PortalChamberLayout';
import { PortalEmptyState } from '../components/PortalEmptyState';
import { ChamberNoProjectState } from '../components/ChamberNoProjectState';
import { useAuthorizedCollaboration } from '../hooks/useAuthorizedCollaboration';
import { useFeedbackThread } from '../hooks/useFeedbackThread';
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || !id) return;

    setSubmitting(true);
    setSubmitError(null);
    // author identity is never sent from here — portal-submit-feedback
    // derives it exclusively from the caller's verified session.
    const { error } = await supabase.functions.invoke('portal-submit-feedback', {
      body: { collaborationId: id, kind: 'general', body: text },
    });
    setSubmitting(false);

    if (error) {
      setSubmitError("Couldn't send that right now. Please try again.");
      return;
    }
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
