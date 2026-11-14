import { useState, type FormEvent } from 'react';
import { requestUploadUrl, confirmUpload } from '../services/adminApi';
import type { AssetType } from '../types/adminTypes';

const ASSET_TYPE_OPTIONS: { value: AssetType; label: string }[] = [
  { value: 'audio_short', label: 'Audio — Short Demo' },
  { value: 'audio_full', label: 'Audio — Full Recording' },
  { value: 'proposal_pdf', label: 'Proposal PDF' },
  { value: 'track_cover', label: 'Artwork — Primary Track Cover' },
  { value: 'alternate_cover', label: 'Artwork — Alternate Cover' },
  { value: 'visual_image', label: 'Artwork — Visual Image' },
  { value: 'visual_concept', label: 'Artwork — Visual Concept' },
];

const MAX_BYTES: Record<AssetType, number> = {
  audio_short: 100 * 1024 * 1024,
  audio_full: 100 * 1024 * 1024,
  proposal_pdf: 25 * 1024 * 1024,
  track_cover: 15 * 1024 * 1024,
  alternate_cover: 15 * 1024 * 1024,
  visual_image: 15 * 1024 * 1024,
  visual_concept: 15 * 1024 * 1024,
};
const ALLOWED_MIME: Record<AssetType, string[]> = {
  audio_short: ['audio/mp4', 'audio/x-m4a', 'audio/mpeg', 'audio/wav', 'audio/x-wav'],
  audio_full: ['audio/mp4', 'audio/x-m4a', 'audio/mpeg', 'audio/wav', 'audio/x-wav'],
  proposal_pdf: ['application/pdf'],
  track_cover: ['image/jpeg', 'image/png', 'image/webp'],
  alternate_cover: ['image/jpeg', 'image/png', 'image/webp'],
  visual_image: ['image/jpeg', 'image/png', 'image/webp'],
  visual_concept: ['image/jpeg', 'image/png', 'image/webp'],
};

type Props = { collaborationId: string; onUploaded: () => void };
type Stage = 'idle' | 'requesting' | 'uploading' | 'confirming' | 'done' | 'failed';

/**
 * Faithfully walks the real H10 sequence client-side: validate ->
 * request a signed upload URL (server validates admin + type/size
 * again) -> PUT the file directly to Storage -> ask the server to
 * confirm it (which verifies the object actually exists before ever
 * marking it ready). Nothing here marks anything "ready" itself —
 * that only ever happens after confirmUpload's own server-side check
 * succeeds.
 */
export function AssetUploadForm({ collaborationId, onUploaded }: Props) {
  const [assetType, setAssetType] = useState<AssetType>('audio_short');
  const [displayLabel, setDisplayLabel] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!file || !displayLabel.trim()) {
      setError('A display label and file are required.');
      return;
    }
    if (!ALLOWED_MIME[assetType].includes(file.type)) {
      setError(`File type ${file.type || '(unknown)'} isn't allowed for this category.`);
      return;
    }
    const transferLimit = 50 * 1024 * 1024;
    if (file.size > transferLimit) {
      setError('This development storage configuration supports files up to 50 MiB. Larger-file delivery is not enabled.');
      return;
    }
    if (file.size > MAX_BYTES[assetType]) {
      setError(`File is too large for this category (max ${Math.round(MAX_BYTES[assetType] / (1024 * 1024))}MB).`);
      return;
    }

    setStage('requesting');
    const requested = await requestUploadUrl({
      collaborationId,
      assetType,
      mimeType: file.type,
      fileSizeBytes: file.size,
      displayLabel: displayLabel.trim(),
      description: description.trim() || undefined,
      includeThumbnail: false, // Full-image fallback; never allocate unuploaded thumbnail bytes.
    });
    if (!requested.ok) {
      setStage('failed');
      setError(requested.error);
      return;
    }

    setStage('uploading');
    const uploadResponse = await fetch(requested.data.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
    if (!uploadResponse.ok) {
      setStage('failed');
      setError('The upload to Storage itself failed — nothing was confirmed, and this attempt will be retried as a fresh one next time.');
      return;
    }

    setStage('confirming');
    const confirmed = await confirmUpload(requested.data.assetId);
    if (!confirmed.ok) {
      setStage('failed');
      setError(`Upload completed but could not be verified: ${confirmed.error}. It will not appear to any artist.`);
      return;
    }

    setStage('done');
    setFile(null);
    setDisplayLabel('');
    setDescription('');
    onUploaded();
  }

  const busy = stage === 'requesting' || stage === 'uploading' || stage === 'confirming';

  return (
    <form className="sp-admin__form" onSubmit={handleSubmit}>
      <div className="sp-admin__field">
        <label htmlFor="asset-type">Category</label>
        <select id="asset-type" value={assetType} onChange={(e) => setAssetType(e.target.value as AssetType)} disabled={busy}>
          {ASSET_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="sp-admin__field">
        <label htmlFor="asset-label">Display Label</label>
        <input id="asset-label" value={displayLabel} onChange={(e) => setDisplayLabel(e.target.value)} disabled={busy} required />
      </div>
      <div className="sp-admin__field">
        <label htmlFor="asset-desc">Description</label>
        <textarea id="asset-desc" value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} />
      </div>
      <div className="sp-admin__field">
        <label htmlFor="asset-file">File</label>
        <input id="asset-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={busy} required />
      </div>
      <p className="sp-admin__status-msg">After security release review, use Set Primary in the Asset Library to select cover artwork.</p>
      {error && <p className="sp-admin__status-msg sp-admin__status-msg--error">{error}</p>}
      {stage === 'done' && <p className="sp-admin__status-msg sp-admin__status-msg--success">Upload received. Security scanning and release review must complete before artist delivery.</p>}
      <button type="submit" className="sp-admin__btn" disabled={busy}>
        {stage === 'requesting' && 'Requesting authorized upload…'}
        {stage === 'uploading' && 'Uploading…'}
        {stage === 'confirming' && 'Verifying…'}
        {(stage === 'idle' || stage === 'done' || stage === 'failed') && 'Upload'}
      </button>
    </form>
  );
}
