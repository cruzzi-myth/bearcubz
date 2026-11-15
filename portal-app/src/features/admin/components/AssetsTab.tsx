import { useState } from 'react';
import { useAdminCollaborations } from '../hooks/useAdminCollaborations';
import { useAdminAssets } from '../hooks/useAdminAssets';
import { updateAsset, markAssetInactive, confirmUpload, approveAssetSecurity, deleteAsset } from '../services/adminApi';
import { AssetUploadForm } from './AssetUploadForm';
import { AssetLibraryList } from '../../../components/AssetLibraryList';
import { AdminCollaborationBriefing } from './AdminCollaborationBriefing';
import { DeleteAssetDialog } from './DeleteAssetDialog';
import { useAdminAssetPreview } from '../hooks/useAdminAssetPreview';
import { isCoverEligible } from '../lib/coverEligibility';
import { formatBytes } from '../lib/formatBytes';
import { deriveAssetLifecycleStatus, LIFECYCLE_STATUS_META } from '../lib/assetLifecycleStatus';
import type { ApprovalStatus, AdminAsset, AdminCollaboration } from '../types/adminTypes';

function LifecycleStatusPill({ asset }: { asset: AdminAsset }) {
  const status = deriveAssetLifecycleStatus(asset);
  const meta = LIFECYCLE_STATUS_META[status];
  return <span className={`sp-admin__pill ${meta.pillClass}`}>{meta.label}</span>;
}

function PreviewButton({ assetId }: { assetId: string }) {
  const [open, setOpen] = useState(false);
  const signed = useAdminAssetPreview(open ? assetId : null, 'full');

  if (!open) {
    return (
      <button type="button" className="sp-admin__btn sp-admin__btn--ghost" onClick={() => setOpen(true)}>
        Preview
      </button>
    );
  }
  if (signed.status !== 'ready') {
    return <span className="sp-admin__empty">{signed.status === 'unavailable' ? 'Not available — scan not yet genuinely clean' : 'Requesting signed URL…'}</span>;
  }
  return (
    <a href={signed.url} target="_blank" rel="noopener noreferrer" className="sp-admin__btn sp-admin__btn--ghost">
      Open (expires in 5 min)
    </a>
  );
}

type Props = { initialCollaborationId?: string };

type SecurityFeedback = { kind: 'approving' | 'approved' | 'error'; message?: string };

export function AssetsTab({ initialCollaborationId }: Props) {
  const { state: collabState } = useAdminCollaborations();
  const [selectedCollaboration, setSelectedCollaboration] = useState<string>(initialCollaborationId ?? '');
  const [briefingTarget, setBriefingTarget] = useState<AdminCollaboration | null>(null);
  const { state: assetState, reload } = useAdminAssets(selectedCollaboration || undefined);
  const [deleteTarget, setDeleteTarget] = useState<AdminAsset | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Stage K1.6Q — per-asset, not a single shared banner: "which row
  // just succeeded/failed" must stay unambiguous even with several
  // rows acted on across reloads. Mirrors CollaborationsTab's own
  // classificationFeedback pattern (saving/saved/error, auto-clearing
  // on success only — an error persists until the next attempt).
  const [securityFeedback, setSecurityFeedback] = useState<Record<string, SecurityFeedback>>({});

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

  async function handleSecurity(assetId: string, approve = false) {
    if (approve) setSecurityFeedback((prev) => ({ ...prev, [assetId]: { kind: 'approving' } }));
    const result = approve ? await approveAssetSecurity(assetId) : await confirmUpload(assetId, false, true);
    if (approve) {
      // A failed approval never changes the asset's own status — the
      // Edge Function's update is itself conditional on security_status
      // still being 'clean' (see portal-admin-review-asset), so this
      // feedback reports exactly what happened without ever implying
      // a state change that didn't occur.
      setSecurityFeedback((prev) => ({ ...prev, [assetId]: result.ok ? { kind: 'approved' } : { kind: 'error', message: result.error } }));
      if (result.ok) {
        setTimeout(() => {
          setSecurityFeedback((prev) => {
            if (prev[assetId]?.kind !== 'approved') return prev;
            const next = { ...prev };
            delete next[assetId];
            return next;
          });
        }, 2500);
      }
    }
    reload();
  }

  async function handleRetryConfirm(assetId: string) {
    await confirmUpload(assetId);
    reload();
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteAsset(deleteTarget.id);
    setDeleting(false);
    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }
    setDeleteTarget(null);
    reload();
  }

  const collaborations = collabState.kind === 'ready' ? collabState.collaborations : [];

  return (
    <>
      <h2>Asset Library</h2>

      {/* Stage K1.4.1 — the compact music-library-style browser (same
          shared row component the artist-facing Asset Library uses).
          This is the visual project browser; selecting a row opens
          its briefing (the same one Collaborations uses) rather than
          driving the dropdown/table below — that filter and the
          management table underneath are untouched, still the real
          administrative interface. */}
      <div style={{ marginBottom: 24 }}>
        <AssetLibraryList rows={collaborations} selectedId={briefingTarget?.id ?? null} onSelect={(row) => setBriefingTarget(row)} adminPreview />
      </div>

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
          <AssetUploadForm collaborationId={selectedCollaboration} onUploaded={reload} existingAssets={assetState.kind === 'ready' ? assetState.assets : []} />
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
                  <th>Security</th>
                  <th>Approval</th>
                  <th>Primary Cover</th>
                  <th>Size</th>
                  <th>Uploaded</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {assetState.assets.map((asset) => {
                  const lifecycle = deriveAssetLifecycleStatus(asset);
                  const feedback = securityFeedback[asset.id];
                  return (
                  <tr key={asset.id}>
                    <td>
                      <span className="sp-admin__asset-label">{asset.displayLabel}</span>
                      {!asset.isActive && <span className="sp-admin__pill sp-admin__pill--muted">Inactive</span>}
                    </td>
                    <td>{asset.assetType}</td>
                    <td>{asset.version}</td>
                    <td>
                      <LifecycleStatusPill asset={asset} />
                    </td>
                    <td>
                      <span>{asset.securityRequired ? asset.securityStatus : 'Legacy — scan evidence incomplete'}</span>
                      {asset.scanEvidence?.provider && <div>{asset.scanEvidence.provider}</div>}
                      {asset.scanEvidence?.detail && <div>{asset.scanEvidence.detail}</div>}
                      {lifecycle === 'awaiting-approval' && (
                        <button
                          type="button"
                          className="sp-admin__btn sp-admin__btn--ghost sp-admin__table-action-btn"
                          onClick={() => handleSecurity(asset.id, true)}
                          disabled={feedback?.kind === 'approving'}
                        >
                          {feedback?.kind === 'approving' ? 'Approving…' : 'Approve Security Release'}
                        </button>
                      )}
                      {(['legacy_unverified','pending','error'].includes(asset.securityStatus) || (asset.securityStatus === 'scanning' && asset.scanLeaseExpiresAt && Date.parse(asset.scanLeaseExpiresAt) < Date.now())) && <button type="button" className="sp-admin__btn sp-admin__btn--ghost sp-admin__table-action-btn" onClick={() => handleSecurity(asset.id)}>{asset.securityStatus === 'scanning' ? 'Retry expired scan' : 'Scan / revalidate'}</button>}
                      {feedback?.kind === 'approved' && <p role="status" className="sp-admin__status-msg sp-admin__status-msg--success">Approved — asset is now READY.</p>}
                      {feedback?.kind === 'error' && <p role="alert" className="sp-admin__status-msg sp-admin__status-msg--error">{feedback.message}</p>}
                    </td>
                    <td>
                      {asset.approvalStatus ? (
                        <select
                          aria-label={`Change approval status for ${asset.displayLabel}`}
                          value={asset.approvalStatus}
                          onChange={(e) => handleApprovalChange(asset.id, e.target.value as ApprovalStatus)}
                        >
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
                        {(lifecycle === 'ready' || lifecycle === 'awaiting-approval') && <PreviewButton assetId={asset.id} />}
                        {!asset.isPrimaryCover && isCoverEligible(asset) && (
                          <button type="button" className="sp-admin__btn sp-admin__btn--ghost sp-admin__table-action-btn" onClick={() => handleSetPrimary(asset.id)}>
                            Set Primary
                          </button>
                        )}
                        {(asset.uploadStatus === 'pending' || asset.uploadStatus === 'failed') && (
                          <button type="button" className="sp-admin__btn sp-admin__btn--ghost sp-admin__table-action-btn" onClick={() => handleRetryConfirm(asset.id)}>
                            Retry Verify
                          </button>
                        )}
                        {asset.isActive && (
                          <button type="button" className="sp-admin__btn sp-admin__btn--warn sp-admin__table-action-btn" onClick={() => handleMarkInactive(asset.id)}>
                            Mark Inactive
                          </button>
                        )}
                        <button
                          type="button"
                          className="sp-admin__btn sp-admin__btn--danger sp-admin__table-action-btn sp-admin__delete-btn"
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteTarget(asset);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {briefingTarget && <AdminCollaborationBriefing collaboration={briefingTarget} onClose={() => setBriefingTarget(null)} />}

      {deleteTarget && (
        <DeleteAssetDialog
          asset={deleteTarget}
          collaborationTitle={collaborations.find((c) => c.id === deleteTarget.collaborationId)?.title ?? 'Unknown collaboration'}
          deleting={deleting}
          error={deleteError}
          onConfirm={handleConfirmDelete}
          onCancel={() => {
            setDeleteTarget(null);
            setDeleteError(null);
          }}
        />
      )}
    </>
  );
}
