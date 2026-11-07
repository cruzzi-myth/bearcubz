import { useState, type FormEvent } from 'react';
import { useAdminInvitations } from '../hooks/useAdminInvitations';
import { useAdminCollaborations } from '../hooks/useAdminCollaborations';
import { createInvitation, revokeInvitation, reissueInvitation } from '../services/adminApi';

function formatAt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function pillClass(status: string): string {
  if (status === 'accepted') return 'sp-admin__pill';
  if (status === 'revoked' || status === 'expired') return 'sp-admin__pill sp-admin__pill--bad';
  return 'sp-admin__pill sp-admin__pill--warn';
}

export function InvitationsTab() {
  const { state, reload } = useAdminInvitations();
  const { state: collabState } = useAdminCollaborations();
  const [email, setEmail] = useState('');
  const [collaborationId, setCollaborationId] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('14');
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  const collaborations = collabState.kind === 'ready' ? collabState.collaborations : [];

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormNotice(null);
    if (!email.trim()) return;
    setCreating(true);
    const result = await createInvitation({
      email: email.trim(),
      collaborationId: collaborationId || undefined,
      expiresInDays: Number(expiresInDays) || undefined,
    });
    setCreating(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    // Important distinction (H6): this created the invitation
    // RECORD. It has not sent anything — portal-request-access only
    // emails the artist once THEY submit this exact email on the
    // entrance page, and this environment's Edge Functions aren't
    // deployed regardless (Stage H is local-only).
    setFormNotice('Invitation record created. No email has been sent — delivery only happens when the artist requests access themselves.');
    setEmail('');
    setNote('');
    reload();
  }

  async function handleRevoke(invitationId: string) {
    await revokeInvitation(invitationId);
    reload();
  }

  async function handleReissue(email: string, collaborationId: string | null) {
    await reissueInvitation({ email, collaborationId: collaborationId ?? undefined });
    reload();
  }

  return (
    <>
      <h2>Create Invitation</h2>
      <form className="sp-admin__form" onSubmit={handleCreate}>
        <div className="sp-admin__field">
          <label htmlFor="invite-email">Artist Email</label>
          <input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="sp-admin__field">
          <label htmlFor="invite-collab">Collaboration (project-scoped — required to grant any real access)</label>
          <select id="invite-collab" value={collaborationId} onChange={(e) => setCollaborationId(e.target.value)}>
            <option value="">— none yet (invitation only, no access granted) —</option>
            {collaborations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
        <div className="sp-admin__field">
          <label htmlFor="invite-expiry">Expires In (days)</label>
          <input id="invite-expiry" type="number" min={1} max={90} value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} />
        </div>
        <div className="sp-admin__field">
          <label htmlFor="invite-note">Internal Note (not sent to the artist)</label>
          <textarea id="invite-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {formError && <p className="sp-admin__status-msg sp-admin__status-msg--error">{formError}</p>}
        {formNotice && <p className="sp-admin__status-msg sp-admin__status-msg--success">{formNotice}</p>}
        <button type="submit" className="sp-admin__btn" disabled={creating}>
          {creating ? 'Creating…' : 'Create Invitation Record'}
        </button>
      </form>

      <div className="sp-admin__section" style={{ marginTop: 32 }}>
        <h2>Invitations</h2>
        {state.kind === 'loading' && <p className="sp-admin__empty">Loading…</p>}
        {state.kind === 'backend-unavailable' && <p className="sp-admin__status-msg sp-admin__status-msg--error">Backend not configured in this environment yet.</p>}
        {state.kind === 'error' && <p className="sp-admin__status-msg sp-admin__status-msg--error">{state.message}</p>}
        {state.kind === 'ready' && state.invitations.length === 0 && <p className="sp-admin__empty">No invitations created yet.</p>}
        {state.kind === 'ready' && state.invitations.length > 0 && (
          <div className="sp-admin__table-wrap">
            <table className="sp-admin__table">
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Collaboration</th>
                  <th>Created</th>
                  <th>Expiration</th>
                  <th>Status</th>
                  <th>Accepted</th>
                  <th>Revoked</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.invitations.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.email}</td>
                    <td>{inv.collaborationTitle ?? '— none —'}</td>
                    <td>{formatAt(inv.createdAt)}</td>
                    <td>{formatAt(inv.expiresAt)}</td>
                    <td>
                      <span className={pillClass(inv.status)}>{inv.status}</span>
                    </td>
                    <td>{inv.acceptedAt ? formatAt(inv.acceptedAt) : '—'}</td>
                    <td>{inv.revokedAt ? formatAt(inv.revokedAt) : '—'}</td>
                    <td>
                      <div className="sp-admin__row-actions">
                        {inv.status === 'pending' && (
                          <button type="button" className="sp-admin__btn sp-admin__btn--danger" onClick={() => handleRevoke(inv.id)}>
                            Revoke
                          </button>
                        )}
                        {inv.status !== 'accepted' && (
                          <button type="button" className="sp-admin__btn sp-admin__btn--ghost" onClick={() => handleReissue(inv.email, inv.collaborationId)}>
                            Reissue
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
