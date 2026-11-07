import { useState } from 'react';
import { useAdminFeedback } from '../hooks/useAdminFeedback';
import { replyToFeedback } from '../services/adminApi';

function formatAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function ReplyForm({ collaborationId, onSent }: { collaborationId: string; onSent: () => void }) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    setError(null);
    // author identity is never sent from here — same as the
    // artist-facing form, portal-admin-reply-feedback derives it
    // from the caller's own verified session.
    const result = await replyToFeedback(collaborationId, text);
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBody('');
    onSent();
  }

  return (
    <div className="sp-admin__form" style={{ marginTop: 10 }}>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Reply as THE COLLECTIVE…" disabled={sending} />
      {error && <p className="sp-admin__status-msg sp-admin__status-msg--error">{error}</p>}
      <button type="button" className="sp-admin__btn" disabled={sending || !body.trim()} onClick={handleSubmit}>
        {sending ? 'Sending…' : 'Send Reply'}
      </button>
    </div>
  );
}

export function FeedbackTab() {
  const { state, reload } = useAdminFeedback();

  if (state.kind === 'loading') return <p className="sp-admin__empty">Loading transmissions…</p>;
  if (state.kind === 'backend-unavailable') return <p className="sp-admin__status-msg sp-admin__status-msg--error">Backend not configured in this environment yet.</p>;
  if (state.kind === 'error') return <p className="sp-admin__status-msg sp-admin__status-msg--error">{state.message}</p>;

  return (
    <>
      <h2>Transmissions</h2>
      {state.threads.length === 0 ? (
        <p className="sp-admin__empty">No feedback has been submitted yet.</p>
      ) : (
        state.threads.map((thread) => (
          <div key={thread.collaborationId} className="sp-admin__section">
            <h2 style={{ fontSize: 14 }}>{thread.collaborationTitle}</h2>
            <div className="sp-admin__table-wrap">
              <table className="sp-admin__table">
                <thead>
                  <tr>
                    <th>From</th>
                    <th>Message</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {thread.messages.map((m) => (
                    <tr key={m.id}>
                      <td>{m.isAdminReply ? 'THE COLLECTIVE' : 'Artist'}</td>
                      <td style={{ whiteSpace: 'normal', maxWidth: 420 }}>{m.body}</td>
                      <td>{formatAt(m.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ReplyForm collaborationId={thread.collaborationId} onSent={reload} />
          </div>
        ))
      )}
    </>
  );
}
