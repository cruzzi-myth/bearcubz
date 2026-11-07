import { useAdminAuditLog } from '../hooks/useAdminAuditLog';

function formatAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export function AuditTab() {
  const { state, loadMore } = useAdminAuditLog();

  if (state.kind === 'loading') return <p className="sp-admin__empty">Loading audit log…</p>;
  if (state.kind === 'backend-unavailable') return <p className="sp-admin__status-msg sp-admin__status-msg--error">Backend not configured in this environment yet.</p>;
  if (state.kind === 'error') return <p className="sp-admin__status-msg sp-admin__status-msg--error">{state.message}</p>;

  return (
    <>
      <h2>Audit Log</h2>
      {state.entries.length === 0 ? (
        <p className="sp-admin__empty">No administrator actions recorded yet.</p>
      ) : (
        <>
          <div className="sp-admin__table-wrap">
            <table className="sp-admin__table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Administrator</th>
                  <th>Operation</th>
                  <th>Target Type</th>
                  <th>Target ID</th>
                </tr>
              </thead>
              <tbody>
                {state.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatAt(entry.createdAt)}</td>
                    <td>{entry.adminId.slice(0, 8)}…</td>
                    <td>{entry.action}</td>
                    <td>{entry.targetTable ?? '—'}</td>
                    <td>{entry.targetId ? `${entry.targetId.slice(0, 8)}…` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {state.hasMore && (
            <button type="button" className="sp-admin__btn sp-admin__btn--ghost" style={{ marginTop: 14 }} onClick={loadMore}>
              Load More
            </button>
          )}
        </>
      )}
    </>
  );
}
