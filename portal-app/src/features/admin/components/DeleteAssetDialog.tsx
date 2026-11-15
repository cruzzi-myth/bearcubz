import { useId } from 'react';
import { Modal } from '../../../components/Modal';
import { formatBytes } from '../lib/formatBytes';
import type { AdminAsset } from '../types/adminTypes';

type Props = {
  asset: AdminAsset;
  collaborationTitle: string;
  deleting: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Stage K1.6O — the confirmation step for a genuine, permanent
 * delete (distinct from "Mark Inactive", which keeps both the row
 * and the Storage object). Shown before portal-admin-delete-asset is
 * ever called; nothing here deletes anything by itself.
 */
export function DeleteAssetDialog({ asset, collaborationTitle, deleting, error, onConfirm, onCancel }: Props) {
  const titleId = useId();

  return (
    <Modal titleId={titleId} onClose={onCancel} className="sp-admin__delete-dialog">
      <h2 id={titleId}>Delete this asset permanently?</h2>
      <dl className="sp-admin__delete-dl">
        <div>
          <dt>Collaboration</dt>
          <dd>{collaborationTitle}</dd>
        </div>
        <div>
          <dt>Display label</dt>
          <dd>{asset.displayLabel}</dd>
        </div>
        <div>
          <dt>Asset type</dt>
          <dd>{asset.assetType}</dd>
        </div>
        <div>
          <dt>File size</dt>
          <dd>{formatBytes(asset.byteSize)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{asset.isActive ? 'ACTIVE' : 'INACTIVE'}</dd>
        </div>
      </dl>
      <p className="sp-admin__status-msg sp-admin__status-msg--warning">
        This permanently deletes the private file from Storage and cannot be undone. Every upload,
        scan, and approval record for this asset remains in the audit log regardless.
      </p>
      {error && <p role="alert" className="sp-admin__status-msg sp-admin__status-msg--error">{error}</p>}
      <div className="sp-admin__row-actions">
        <button type="button" className="sp-admin__btn sp-admin__btn--ghost" onClick={onCancel} disabled={deleting}>
          Cancel
        </button>
        <button type="button" className="sp-admin__btn sp-admin__btn--danger" onClick={onConfirm} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete Permanently'}
        </button>
      </div>
    </Modal>
  );
}
