import { useRef, useState, type DragEvent } from 'react';
import type { AttachmentUploadState } from '../hooks/useAttachmentUpload';
import { ATTACHMENT_RULES, MAX_ATTACHMENTS_PER_MESSAGE, formatFileSize } from '../lib/attachmentRules';
import './attachment-composer.css';

const ACCEPT = Object.values(ATTACHMENT_RULES)
  .flatMap((r) => r.mimeTypes)
  .join(',');

const STATUS_LABEL: Record<AttachmentUploadState['status'], string> = {
  validating: 'Ready to send',
  requesting: 'Starting upload…',
  uploading: 'Uploading…',
  confirming: 'Verifying…',
  awaiting_scan: 'Pending review',
  rejected: 'Rejected — not delivered',
  available: 'Delivered',
  failed: 'Upload failed',
  client_rejected: 'Not supported',
};

type Props = {
  uploads: AttachmentUploadState[];
  onAddFiles: (files: File[]) => void;
  onRemove: (localId: string) => void;
  onRetry: (localId: string) => void;
  disabled: boolean;
};

/**
 * Stage K1.6C — attach-file control for the Transmission Chamber
 * composer. Files are only STAGED here (addFiles never starts a
 * network request) — the real upload sequence only begins once the
 * surrounding form's Send action calls uploadAll, so "write a message
 * and attach files, submit together" is one real action, not two.
 */
export function AttachmentComposer({ uploads, onAddFiles, onRemove, onRetry, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const atLimit = uploads.length >= MAX_ATTACHMENTS_PER_MESSAGE;

  function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const room = MAX_ATTACHMENTS_PER_MESSAGE - uploads.length;
    onAddFiles(Array.from(fileList).slice(0, Math.max(room, 0)));
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  }

  return (
    <div className="sp-attach">
      <div
        className={dragActive ? 'sp-attach__dropzone sp-attach__dropzone--active' : 'sp-attach__dropzone'}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <button
          type="button"
          className="sp-attach__button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || atLimit}
        >
          Attach File
        </button>
        <span className="sp-attach__hint">
          {atLimit ? `Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} attachments per message` : 'or drag files here · PDF, DOCX, TXT, ZIP, WAV, MP3, M4A, PNG, JPEG, WebP'}
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          aria-label="Attach a file to this message"
          className="sp-attach__input"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {uploads.length > 0 && (
        <ul className="sp-attach__list">
          {uploads.map((u) => (
            <li key={u.localId} className={`sp-attach__item sp-attach__item--${u.status}`}>
              <div className="sp-attach__item-main">
                <span className="sp-attach__item-name">{u.file.name}</span>
                <span className="sp-attach__item-size">{formatFileSize(u.file.size)}</span>
              </div>
              <div className="sp-attach__item-status">
                {(u.status === 'uploading' || u.status === 'requesting') && (
                  <span className="sp-attach__progress" role="progressbar" aria-valuenow={u.progress} aria-valuemin={0} aria-valuemax={100}>
                    <span className="sp-attach__progress-fill" style={{ width: `${u.status === 'uploading' ? u.progress : 5}%` }} />
                  </span>
                )}
                <span className="sp-attach__item-label">{u.error ?? STATUS_LABEL[u.status]}</span>
                {u.status === 'failed' && (
                  <button type="button" className="sp-attach__retry" onClick={() => onRetry(u.localId)}>
                    Retry
                  </button>
                )}
                {(u.status === 'validating' || u.status === 'client_rejected' || u.status === 'failed') && (
                  <button type="button" className="sp-attach__remove" onClick={() => onRemove(u.localId)} aria-label={`Remove ${u.file.name}`}>
                    ×
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
