import { useState } from 'react';
import type { CollaborationAsset } from '../hooks/useAuthorizedCollaboration';
import { useSignedAssetUrl } from '../hooks/useSignedAssetUrl';

type Props = { asset: CollaborationAsset; onClose: () => void };

/**
 * Rendered in-page via <iframe>, never a new-tab link — a signed URL
 * handed to the browser's own address bar/history would outlive the
 * component that requested it. Viewing is the only action here;
 * there is no acceptance/signature step, intentionally.
 */
export function PrivateProposalViewer({ asset, onClose }: Props) {
  const signed = useSignedAssetUrl(asset.id, 'full');
  const [dismissedNotice, setDismissedNotice] = useState(false);

  return (
    <div className="sp-proposal__viewer" role="dialog" aria-label={`Viewing ${asset.displayLabel}`}>
      {!dismissedNotice && (
        <p className="sp-proposal__notice">
          Viewing this document is not an acceptance of its terms. <button type="button" onClick={() => setDismissedNotice(true)}>Dismiss</button>
        </p>
      )}
      {signed.status === 'loading' && <p className="sp-proposal__empty">Requesting secure document access…</p>}
      {signed.status === 'unavailable' && <p className="sp-proposal__empty">Couldn't authorize this document right now.</p>}
      {signed.status === 'ready' && (
        <iframe title={asset.displayLabel} src={signed.url} style={{ width: '100%', height: '60vh', border: '1px solid var(--sp-glass-border)', borderRadius: 10 }} />
      )}
      <button type="button" className="sp-proposal__view-btn" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
