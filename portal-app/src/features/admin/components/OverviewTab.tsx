import { useAdminOverview } from '../hooks/useAdminOverview';
import { AdminMetricCard } from './AdminMetricCard';

function formatAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export function OverviewTab() {
  const state = useAdminOverview();

  if (state.kind === 'loading') return <p className="sp-admin__empty">Loading overview…</p>;
  if (state.kind === 'backend-unavailable') {
    return <p className="sp-admin__status-msg sp-admin__status-msg--error">The Signal Portal backend isn't configured in this environment yet. These are not confirmed-zero metrics — they simply couldn't be read.</p>;
  }
  if (state.kind === 'error') {
    return <p className="sp-admin__status-msg sp-admin__status-msg--error">Couldn't load overview metrics: {state.message}</p>;
  }

  const { metrics, recentActivity } = state;
  return (
    <>
      <h2>Overview</h2>
      <div className="sp-admin__metrics">
        <AdminMetricCard label="Total Artists" value={metrics.totalArtists} />
        <AdminMetricCard label="Active Collaborations" value={metrics.activeCollaborations} />
        <AdminMetricCard label="Draft Collaborations" value={metrics.draftCollaborations} />
        <AdminMetricCard label="Pending Invitations" value={metrics.pendingInvitations} />
        <AdminMetricCard label="Private Audio Assets" value={metrics.audioAssets} />
        <AdminMetricCard label="Track Artwork Assets" value={metrics.artworkAssets} />
        <AdminMetricCard label="Proposals" value={metrics.proposalAssets} />
        <AdminMetricCard label="Unanswered Transmissions" value={metrics.unansweredTransmissions} />
      </div>

      <div className="sp-admin__section">
        <h2>Recent Activity</h2>
        {recentActivity.length === 0 ? (
          <p className="sp-admin__empty">No administrator activity recorded yet.</p>
        ) : (
          <div className="sp-admin__table-wrap">
            <table className="sp-admin__table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>Target</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatAt(entry.createdAt)}</td>
                    <td>{entry.action}</td>
                    <td>
                      {entry.targetTable ?? '—'} {entry.targetId ? `#${entry.targetId.slice(0, 8)}` : ''}
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
