import { useState } from 'react';
import { useAdminCollaborations } from '../hooks/useAdminCollaborations';
import { useAdminAssets } from '../hooks/useAdminAssets';
import { updateAsset, markAssetInactive, confirmUpload } from '../services/adminApi';
import { AssetUploadForm } from './AssetUploadForm';
import { useSignedAssetUrl } from '../../../hooks/useSignedAssetUrl';
import { isCoverEligible } from '../lib/coverEligibility';
import type { ApprovalStatus } from '../types/adminTypes';

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusPillClass(status: string): string {
  if (status === 'ready') return 'sp-admin__pill';
  if (status === 'failed') return 'sp-admin__pill sp-admin__pill--bad';
  return 'sp-admin__pill sp-admin__pill--warn';
}

function PreviewButton({ assetId }: { assetId: string }) {
  const [open, setOpen] = useState(false);
  const signed = useSignedAssetUrl(open ? assetId : null, 'full');

  if (!open) {
    return (
      <button type="button" className="sp-admin__btn sp-admin__btn--ghost" onClick={() => setOpen(true)}>
        Preview
      </button>
    );
  }
  if (signed.status !== 'ready') {
    return <span className="sp-admin__empty">{signed.status === 'unavailable' ? 'Not available' : 'Requesting signed URL…'}</span>;
  }
  return (
    <a href={signed.url} target="_blank" rel="noopener noreferrer" className="sp-admin__btn sp-admin__btn--ghost">
      Open (expires in 5 min)
    </a>
  );
}

export function AssetsTab() {
  const { state: collabState } = useAdminCollaborations();
  const [selectedCollaboration, setSelectedCollaboration] = useState<string>('');
  const { state: assetState, reload } = useAdminAssets(selectedCollaboration || undefined);

  async function handleApprovalChange(assetId: string, approvalStatus: ApprovalStatus) {
    await updateAsset(assetId, { approvalStatus });
    reload();
  }

  async function handleMarkInactive(assetId: string) {
    await markAssetInactive(assetId);
    reload();
  }

  async function handleSetPrimary(assetId: string) {
    await updateAsset(assetId, { isPrimaryCover: true });
    reload();
  }

  async function handleRetryConfirm(assetId: string) {
    await confirmUpload(assetId);
    reload();
  }

  const collaborations = collabState.kind === 'ready' ? collabState.collaborations : [];

  return (
    <>
      <h2>Asset Library</h2>
      <div className="sp-admin__field" style={{ maxWidth: 420, marginBottom: 20 }}>
        <label htmlFor="asset-collab-filter">Collaboration</label>
        <select id="asset-collab-filter" value={selectedCollaboration} onChange={(e) => setSelectedCollaboration(e.target.value)}>
          <option value="">All collaborations</option>
          {collaborations.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>

      {selectedCollaboration && (
        <div className="sp-admin__section">
          <h2>Upload</h2>
          <AssetUploadForm collaborationId={selectedCollaboration} onUploaded={reload} />
        </div>
      )}

      <div className="sp-admin__section">
        {assetState.kind === 'loading' && <p className="sp-admin__empty">Loading assets…</p>}
        {assetState.kind === 'backend-unavailable' && <p className="sp-admin__status-msg sp-admin__status-msg--error">Backend not configured in this environment yet.</p>}
        {assetState.kind === 'error' && <p className="sp-admin__status-msg sp-admin__status-msg--error">{assetState.message}</p>}
        {assetState.kind === 'ready' && assetState.assets.length === 0 && <p className="sp-admin__empty">No assets recorded yet.</p>}
        {assetState.kind === 'ready' && assetState.assets.length > 0 && (
          <div className="sp-admin__table-wrap">
            <table className="sp-admin__table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Type</th>
                  <th>Version</th>
                  <th>Upload Status</th>
                  <th>Approval</th>
                  <th>Primary Cover</th>
                  <th>Size</th>
                  <th>Uploaded</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {assetState.assets.map((asset) => (
                  <tr key={asset.id} style={{ opacity: asset.isActive ? 1 : 0.45 }}>
                    <td>{asset.displayLabel}</td>
                    <td>{asset.assetType}</td>
                    <td>{asset.version}</td>
                    <td>
                      <span className={statusPillClass(asset.uploadStatus)}>{asset.uploadStatus}</span>
                    </td>
                    <td>
                      {asset.approvalStatus ? (
                        <select value={asset.approvalStatus} onChange={(e) => handleApprovalChange(asset.id, e.target.value as ApprovalStatus)}>
                          <option value="pending">pending</option>
                          <option value="approved">approved</option>
                          <option value="rejected">rejected</option>
                        </select>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{asset.isPrimaryCover ? <span className="sp-admin__pill">primary</span> : '—'}</td>
                    <td>{formatBytes(asset.byteSize)}</td>
                    <td>{new Date(asset.uploadedAt).toLocaleDateString()}</td>
                    <td>
                      <div className="sp-admin__row-actions">
                        {asset.uploadStatus === 'ready' && <PreviewButton assetId={asset.id} />}
                        {!asset.isPrimaryCover && isCoverEligible(asset) && (
                          <button type="button" className="sp-admin__btn sp-admin__btn--ghost" onClick={() => handleSetPrimary(asset.id)}>
                            Set Primary
                          </button>
                        )}
                        {(asset.uploadStatus === 'pending' || asset.uploadStatus === 'failed') && (
                          <button type="button" className="sp-admin__btn sp-admin__btn--ghost" onClick={() => handleRetryConfirm(asset.id)}>
                            Retry Verify
                          </button>
                        )}
                        {asset.isActive && (
                          <button type="button" className="sp-admin__btn sp-admin__btn--danger" onClick={() => handleMarkInactive(asset.id)}>
                            Mark Inactive
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
