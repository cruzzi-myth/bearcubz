import { useState } from 'react';
import type { CollaborationAsset } from '../hooks/useAuthorizedCollaboration';
import { useSignedAssetUrl } from '../hooks/useSignedAssetUrl';
import { PdfCanvasViewer } from './PdfCanvasViewer';
import './private-proposal-viewer.css';

type Props = { asset: CollaborationAsset; onClose: () => void };

/**
 * Stage K1.6B addendum — a real page-by-page PDF.js renderer (see
 * PdfCanvasViewer), not a browser <iframe> embed. The document itself
 * still only ever reaches the browser via the same short-lived
 * signed URL useSignedAssetUrl already minted — nothing about how the
 * proposal is authorized or delivered changed, only how it's
 * displayed once it arrives.
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
      {signed.status === 'ready' && <PdfCanvasViewer url={signed.url} label={asset.displayLabel} />}

      <button type="button" className="sp-proposal__view-btn" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
