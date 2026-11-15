import { useEffect, useState, type FormEvent } from 'react';
import { useAdminInvitations } from '../hooks/useAdminInvitations';
import { useAdminCollaborations } from '../hooks/useAdminCollaborations';
import { createInvitation, revokeInvitation, reissueInvitation, sendInvitation, listAssets } from '../services/adminApi';
import { proposalGate, PROPOSAL_GATE_MESSAGE } from '../lib/proposalGate';
import { PHASE01_RECIPIENTS } from '../lib/phase01Recipients';
import { invitationStage, STAGE_LABEL, describeSendError, type InvitationStage } from '../lib/invitationDelivery';

function formatAt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function pillClass(stage: InvitationStage): string {
  if (stage === 'accepted' || stage === 'sent') return 'sp-admin__pill';
  if (stage === 'revoked' || stage === 'expired' || stage === 'failed') return 'sp-admin__pill sp-admin__pill--bad';
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

  // --- Phase 01 Send Invitation ---
  const [recipientKey, setRecipientKey] = useState(PHASE01_RECIPIENTS[0].key);
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const recipient = PHASE01_RECIPIENTS.find((r) => r.key === recipientKey) ?? PHASE01_RECIPIENTS[0];
  const existingForRecipient =
    state.kind === 'ready'
      ? state.invitations.find((i) => i.email.toLowerCase() === recipient.email && i.collaborationId === recipient.collaborationId && invitationStage(i) !== 'revoked')
      : undefined;
  const existingStage = existingForRecipient ? invitationStage(existingForRecipient) : null;
  const sendBlocked = existingStage === 'accepted' || existingStage === 'requested' || existingStage === 'sent';

  // Live eligibility for recipients whose invitation depends on a revised
  // proposal. Read from the actual asset records (admin RLS), never hardcoded.
  const [gate, setGate] = useState<{ kind: 'na' | 'loading' | 'ready' | 'blocked' | 'error'; reason?: string }>({ kind: 'na' });
  useEffect(() => {
    let cancelled = false;
    if (!recipient.requiresRevisedProposal) {
      setGate({ kind: 'na' });
      return;
    }
    setGate({ kind: 'loading' });
    listAssets(recipient.collaborationId).then((r) => {
      if (cancelled) return;
      if (!r.ok) {
        setGate({ kind: 'error' });
        return;
      }
      const result = proposalGate(
        recipient.collaborationId,
        r.data.map((a) => ({
          assetType: a.assetType,
          isActive: a.isActive,
          uploadStatus: a.uploadStatus,
          securityStatus: a.securityStatus,
          securityReviewStatus: a.securityReviewStatus,
          fileSha256: a.fileSha256,
        })),
      );
      setGate(result.ready ? { kind: 'ready' } : { kind: 'blocked', reason: PROPOSAL_GATE_MESSAGE[result.reason] });
    });
    return () => {
      cancelled = true;
    };
  }, [recipient.collaborationId, recipient.requiresRevisedProposal]);
  const gateBlocksSend = gate.kind === 'loading' || gate.kind === 'blocked' || gate.kind === 'error';

  async function handleSend() {
    setSendMsg(null);
    setSending(true);
    const result = await sendInvitation({ email: recipient.email, collaborationId: recipient.collaborationId });
    setSending(false);
    setConfirmed(false);
    if (result.ok) {
      setSendMsg({ kind: 'success', text: 'Email sent — accepted by the mail provider. Inbox delivery cannot be confirmed from here.' });
    } else if (result.failure) {
      setSendMsg({ kind: 'error', text: `Delivery failed: ${result.failure.message}` });
    } else {
      setSendMsg({ kind: 'error', text: describeSendError(result.error) });
    }
    reload();
  }

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
      <h2>Send Invitation</h2>
      <div className="sp-admin__form" aria-label="Send Invitation (Phase 01)">
        <div className="sp-admin__field">
          <label htmlFor="send-artist">Artist</label>
          <select
            id="send-artist"
            value={recipientKey}
            onChange={(e) => {
              setRecipientKey(e.target.value);
              setConfirmed(false);
              setSendMsg(null);
            }}
          >
            {PHASE01_RECIPIENTS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.artistName}
              </option>
            ))}
          </select>
        </div>
        <p>
          <strong>Email:</strong> <span data-testid="send-email">{recipient.email}</span>
        </p>
        <p>
          <strong>Collaboration:</strong> <span data-testid="send-collab">{recipient.collaborationTitle}</span> (artist access to this project only)
        </p>
        {gate.kind === 'loading' && <p className="sp-admin__empty">Checking the revised proposal…</p>}
        {gate.kind === 'ready' && (
          <p className="sp-admin__status-msg sp-admin__status-msg--success" data-testid="proposal-gate">
            Revised proposal verified: active, scanned clean and security-approved.
          </p>
        )}
        {gate.kind === 'blocked' && (
          <p className="sp-admin__status-msg sp-admin__status-msg--error" data-testid="proposal-gate">
            {gate.reason}
          </p>
        )}
        {gate.kind === 'error' && (
          <p className="sp-admin__status-msg sp-admin__status-msg--error" data-testid="proposal-gate">
            Couldn’t verify the revised proposal right now. Reload and try again.
          </p>
        )}
        {existingStage && (
          <p>
            <strong>Status:</strong> <span className={pillClass(existingStage)}>{STAGE_LABEL[existingStage]}</span>
          </p>
        )}
        <label className="sp-admin__field" style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={sendBlocked || gateBlocksSend} />
          <span>I confirm this email address and collaboration are correct.</span>
        </label>
        {sendMsg && <p className={`sp-admin__status-msg sp-admin__status-msg--${sendMsg.kind}`}>{sendMsg.text}</p>}
        <button type="button" className="sp-admin__btn" onClick={handleSend} disabled={!confirmed || sending || sendBlocked || gateBlocksSend}>
          {sending ? 'Sending…' : 'Send Invitation'}
        </button>
      </div>

      <h2 style={{ marginTop: 32 }}>Create Invitation</h2>
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
                      {(() => {
                        const stage = invitationStage(inv);
                        return (
                          <span className={pillClass(stage)} title={inv.delivery?.failure ?? undefined}>
                            {STAGE_LABEL[stage]}
                          </span>
                        );
                      })()}
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
