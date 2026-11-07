import { useAdminArtists } from '../hooks/useAdminArtists';
import { revokeMember, addMember } from '../services/adminApi';
import { useState } from 'react';

function formatAt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export function ArtistsTab() {
  const { state, reload } = useAdminArtists();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  if (state.kind === 'loading') return <p className="sp-admin__empty">Loading artist directory…</p>;
  if (state.kind === 'backend-unavailable') return <p className="sp-admin__status-msg sp-admin__status-msg--error">Backend not configured in this environment yet.</p>;
  if (state.kind === 'error') return <p className="sp-admin__status-msg sp-admin__status-msg--error">{state.message}</p>;

  async function handleRevoke(collaborationId: string, userId: string) {
    const key = `${collaborationId}:${userId}`;
    setBusyKey(key);
    await revokeMember(collaborationId, userId);
    setBusyKey(null);
    reload();
  }

  async function handleRestore(collaborationId: string, userId: string) {
    const key = `${collaborationId}:${userId}`;
    setBusyKey(key);
    // Restoring access is add_member again — the Edge Function
    // upserts with status: 'active', which is exactly a restore for
    // a previously-revoked row.
    await addMember(collaborationId, userId);
    setBusyKey(null);
    reload();
  }

  return (
    <>
      <h2>Artists</h2>
      {state.artists.length === 0 ? (
        <p className="sp-admin__empty">No artist profiles exist yet — a profile is only created once an invitation is actually accepted.</p>
      ) : (
        <div className="sp-admin__table-wrap">
          <table className="sp-admin__table">
            <thead>
              <tr>
                <th>Display Name</th>
                <th>Email</th>
                <th>Assigned Collaborations</th>
                <th>Membership Status</th>
                <th>Created</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.artists.map((artist) => (
                <tr key={artist.userId}>
                  <td>{artist.displayName}</td>
                  <td>{artist.email}</td>
                  <td>{artist.memberships.length}</td>
                  <td>
                    {artist.memberships.map((m) => (
                      <span key={m.collaborationId} className={`sp-admin__pill${m.status === 'revoked' ? ' sp-admin__pill--bad' : ''}`} style={{ marginRight: 4 }}>
                        {m.status}
                      </span>
                    ))}
                  </td>
                  <td>{formatAt(artist.createdAt)}</td>
                  <td>{formatAt(artist.updatedAt)}</td>
                  <td>
                    <div className="sp-admin__row-actions">
                      {artist.memberships.map((m) => (
                        <button
                          key={m.collaborationId}
                          type="button"
                          className={m.status === 'active' ? 'sp-admin__btn sp-admin__btn--danger' : 'sp-admin__btn sp-admin__btn--ghost'}
                          disabled={busyKey === `${m.collaborationId}:${m.userId}`}
                          onClick={() => (m.status === 'active' ? handleRevoke(m.collaborationId, m.userId) : handleRestore(m.collaborationId, m.userId))}
                        >
                          {m.status === 'active' ? 'Revoke' : 'Restore'}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
