import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePortalAuth } from '../features/auth/PortalAuthContext';
import { useSignalInbox } from '../hooks/useSignalInbox';
import { useSignedAssetUrl } from '../hooks/useSignedAssetUrl';
import './signal-inbox.css';

const AUDIO_TYPES = new Set(['audio_short', 'audio_full']);

function formatAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function InboxAudioPreview({ assetId }: { assetId: string }) {
  const signed = useSignedAssetUrl(assetId, 'full');
  if (signed.status !== 'ready') return null;
  // eslint-disable-next-line jsx-a11y/media-has-caption -- a private voice/audio
  // attachment has no caption track to offer; controls alone satisfy access here.
  return <audio className="sp-inbox__audio" controls preload="none" src={signed.url} />;
}

/**
 * Mounted once, globally (see App.tsx) -- renders nothing at all for
 * a signed-out visitor or while authorization is still resolving,
 * since isAdmin/authStatus only ever reflect a completed,
 * server-verified check (see PortalAuthContext). Reuses
 * collaboration_feedback / portal-submit-feedback /
 * portal-admin-reply-feedback exactly as the full Feedback and
 * Transmissions interfaces already do -- this is a quick-access view
 * onto the same data and the same write paths, never a second
 * messaging system.
 */
export function SignalInbox() {
  const { status: authStatus } = usePortalAuth();
  const [open, setOpen] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const inbox = useSignalInbox();

  if (authStatus !== 'signed-in') return null;

  const unreadCount = inbox.status === 'ready' ? inbox.unreadCount : 0;
  const isEntranceRoute = location.pathname === '/' || location.pathname === '';

  async function handleQuickReply(e: FormEvent, collaborationId: string) {
    e.preventDefault();
    const text = (replyDrafts[collaborationId] ?? '').trim();
    if (!text) return;
    setSendingId(collaborationId);
    const ok = await inbox.sendReply(collaborationId, text);
    setSendingId(null);
    if (ok) setReplyDrafts((d) => ({ ...d, [collaborationId]: '' }));
  }

  function openTransmissions(collaborationId: string) {
    setOpen(false);
    navigate(`/collaboration/${collaborationId}/respond`);
  }

  return (
    <>
      <button
        type="button"
        className={`sp-inbox__trigger${isEntranceRoute ? ' sp-inbox__trigger--entrance' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {/* Stage I2H's established fix for this exact axe rule
            (label-content-name-mismatch), reused here rather than an
            aria-label override: the accessible name is computed
            naturally from real, visually-hidden text instead of
            fighting with the decorative glyph/badge beside it. */}
        <span className="sp-sr-only">Signal Inbox{unreadCount > 0 ? `, ${unreadCount} unread` : ''}</span>
        <span aria-hidden="true">◈</span>
        {unreadCount > 0 && (
          <span className="sp-inbox__badge" aria-hidden="true">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="sp-inbox__panel" role="dialog" aria-label="Signal Inbox">
          <div className="sp-inbox__panel-head">
            <p className="sp-inbox__panel-title">Signal Inbox</p>
            <button type="button" className="sp-inbox__close" onClick={() => setOpen(false)} aria-label="Close">
              ×
            </button>
          </div>

          {inbox.status === 'loading' && <p className="sp-inbox__status">Loading recent transmissions…</p>}
          {inbox.status === 'backend-unavailable' && <p className="sp-inbox__status">Signal Inbox isn't configured in this environment yet.</p>}
          {inbox.status === 'error' && <p className="sp-inbox__status">Couldn't load your transmissions right now.</p>}
          {inbox.status === 'ready' && inbox.messages.length === 0 && <p className="sp-inbox__status">No transmissions yet.</p>}

          {inbox.status === 'ready' && inbox.messages.length > 0 && (
            <ul className="sp-inbox__list">
              {inbox.messages.map((m) => (
                <li key={m.id} className={`sp-inbox__item${m.isUnread ? ' sp-inbox__item--unread' : ''}`}>
                  <button
                    type="button"
                    className="sp-inbox__item-main"
                    onClick={() => (m.isUnread ? inbox.markRead(m.id) : undefined)}
                  >
                    {m.isUnread && (
                      <span className="sp-inbox__unread-dot" aria-label="Unread">
                        ●
                      </span>
                    )}
                    <span className="sp-inbox__item-meta">
                      <span className="sp-inbox__item-sender">{m.senderLabel}</span>
                      <span className="sp-inbox__item-collab">{m.collaborationTitle}</span>
                      <span className="sp-inbox__item-at">{formatAt(m.createdAt)}</span>
                    </span>
                    <span className="sp-inbox__item-preview">{m.body}</span>
                  </button>

                  {m.assetId && m.assetType && AUDIO_TYPES.has(m.assetType) && <InboxAudioPreview assetId={m.assetId} />}

                  <form className="sp-inbox__quick-reply" onSubmit={(e) => handleQuickReply(e, m.collaborationId)}>
                    <input
                      type="text"
                      placeholder="Quick reply…"
                      value={replyDrafts[m.collaborationId] ?? ''}
                      onChange={(e) => setReplyDrafts((d) => ({ ...d, [m.collaborationId]: e.target.value }))}
                      disabled={sendingId === m.collaborationId}
                      aria-label={`Quick reply to ${m.collaborationTitle}`}
                    />
                    <button type="submit" disabled={sendingId === m.collaborationId || !(replyDrafts[m.collaborationId] ?? '').trim()}>
                      Send
                    </button>
                  </form>

                  <button type="button" className="sp-inbox__open-transmissions" onClick={() => openTransmissions(m.collaborationId)}>
                    OPEN TRANSMISSIONS <span aria-hidden="true">→</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
