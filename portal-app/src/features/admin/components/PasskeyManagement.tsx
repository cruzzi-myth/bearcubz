import { useCallback, useEffect, useState } from 'react';
import { listPasskeys, registerPasskey, renamePasskey, revokePasskey, type PasskeySummary } from '../../auth/passkeyClient';
import { PASSKEY_MESSAGES } from '../../auth/passkeyErrors';

function when(iso: string | null): string {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}

/**
 * SECURE ACCESS // PASSKEY MANAGEMENT — administrator only (the Settings tab is
 * inside the Command Center, and every call is re-verified server-side).
 * Only public-key credential metadata is ever shown; nothing biometric exists.
 */
export function PasskeyManagement() {
  const [passkeys, setPasskeys] = useState<PasskeySummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);

  const load = useCallback(async () => {
    const r = await listPasskeys();
    if (r.ok) {
      setPasskeys(r.data.passkeys);
      setLoadError(false);
    } else {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRegister() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await registerPasskey(name.trim() || 'Passkey');
      if (r.ok) {
        setName('');
        setMessage({ kind: 'success', text: PASSKEY_MESSAGES.registered });
        await load();
      } else if (r.code === 'REAUTH_REQUIRED') {
        setMessage({ kind: 'error', text: PASSKEY_MESSAGES.reauth });
      } else if (r.code === 'CANCELLED') {
        setMessage({ kind: 'error', text: 'Passkey registration was cancelled. Nothing was changed.' });
      } else if (r.code === 'ALREADY_REGISTERED') {
        setMessage({ kind: 'error', text: 'This device already has a passkey registered for this account.' });
      } else if (r.code === 'UNSUPPORTED') {
        setMessage({ kind: 'error', text: PASSKEY_MESSAGES.unsupported });
      } else {
        setMessage({ kind: 'error', text: 'Passkey registration failed. Nothing was changed.' });
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(id: string, value: string) {
    const r = await renamePasskey(id, value);
    setRenaming(null);
    setMessage(r.ok ? { kind: 'success', text: 'Passkey renamed.' } : { kind: 'error', text: 'Could not rename that passkey.' });
    await load();
  }

  async function handleRevoke(p: PasskeySummary) {
    if (!window.confirm(`Revoke "${p.name}"? It will no longer sign anyone in. Email sign-in always remains available.`)) return;
    const r = await revokePasskey(p.id);
    if (r.ok) setMessage({ kind: 'success', text: 'Passkey revoked.' });
    else setMessage({ kind: 'error', text: r.code === 'REAUTH_REQUIRED' ? PASSKEY_MESSAGES.reauth : 'Could not revoke that passkey.' });
    await load();
  }

  const active = (passkeys ?? []).filter((p) => !p.revoked_at);
  const revoked = (passkeys ?? []).filter((p) => p.revoked_at);

  return (
    <section className="sp-admin__section" style={{ marginTop: 32 }} aria-labelledby="passkey-h">
      <h2 id="passkey-h">SECURE ACCESS // PASSKEY MANAGEMENT</h2>
      <p className="sp-admin__empty">
        Sign in to the Command Center with Touch ID, Face ID or a security key. Only a public key is stored on the server — never
        biometric data. Registering or removing a passkey requires a recent sign-in.
      </p>

      <div className="sp-admin__form" style={{ maxWidth: 560 }}>
        <div className="sp-admin__field">
          <label htmlFor="passkey-name">Passkey name (optional)</label>
          <input id="passkey-name" type="text" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. MacBook Touch ID" disabled={busy} />
        </div>
        <button type="button" className="sp-admin__btn" onClick={() => void handleRegister()} disabled={busy}>
          {busy ? 'Waiting for your device…' : 'REGISTER PASSKEY'}
        </button>
        {message && (
          <p className={`sp-admin__status-msg sp-admin__status-msg--${message.kind}`} role="status" data-testid="passkey-message">
            {message.text}
          </p>
        )}
      </div>

      <h3 style={{ marginTop: 24 }}>Registered passkeys</h3>
      {passkeys === null && !loadError && <p className="sp-admin__empty">Loading…</p>}
      {loadError && <p className="sp-admin__status-msg sp-admin__status-msg--error">Couldn’t load your passkeys right now.</p>}
      {passkeys !== null && active.length === 0 && <p className="sp-admin__empty" data-testid="passkey-empty">No passkeys registered yet. Email sign-in is your current method.</p>}
      {active.length > 0 && (
        <div className="sp-admin__table-wrap">
          <table className="sp-admin__table" data-testid="passkey-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Created</th>
                <th>Last used</th>
                <th>Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {active.map((p) => (
                <tr key={p.id}>
                  <td>
                    {renaming?.id === p.id ? (
                      <input
                        aria-label={`Rename ${p.name}`}
                        type="text"
                        maxLength={40}
                        value={renaming.value}
                        onChange={(e) => setRenaming({ id: p.id, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleRename(p.id, renaming.value);
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                      />
                    ) : (
                      p.name
                    )}
                  </td>
                  <td>{when(p.created_at)}</td>
                  <td>{when(p.last_used_at)}</td>
                  <td>{p.device_type === 'multiDevice' ? 'Synced passkey' : p.device_type === 'singleDevice' ? 'Device-bound' : '—'}</td>
                  <td>
                    <div className="sp-admin__row-actions">
                      {renaming?.id === p.id ? (
                        <button type="button" className="sp-admin__btn" onClick={() => void handleRename(p.id, renaming.value)}>
                          Save
                        </button>
                      ) : (
                        <button type="button" className="sp-admin__btn sp-admin__btn--ghost" onClick={() => setRenaming({ id: p.id, value: p.name })}>
                          Rename
                        </button>
                      )}
                      <button type="button" className="sp-admin__btn sp-admin__btn--danger" onClick={() => void handleRevoke(p)}>
                        Revoke
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {revoked.length > 0 && (
        <p className="sp-admin__empty" data-testid="passkey-revoked-count">
          {revoked.length} revoked passkey{revoked.length === 1 ? '' : 's'} (can no longer sign in).
        </p>
      )}

      <p className="sp-admin__empty" style={{ marginTop: 16 }}>
        <strong>Email authentication fallback:</strong> always available. If no passkey is available, request a secure sign-in link from the
        entrance page with your administrator email.
      </p>
    </section>
  );
}
