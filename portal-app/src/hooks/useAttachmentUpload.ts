import { useCallback, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { validateAttachmentFile } from '../lib/attachmentRules';

export type AttachmentUploadStatus =
  | 'validating'
  | 'requesting'
  | 'uploading'
  | 'confirming'
  | 'awaiting_scan'
  | 'rejected'
  | 'available'
  | 'failed'
  | 'client_rejected';

export interface AttachmentUploadState {
  localId: string;
  file: File;
  status: AttachmentUploadStatus;
  progress: number;
  attachmentId: string | null;
  error: string | null;
}

// Stage K1.6G section 6 — the frontend's own validateAttachmentFile
// check (same effective thresholds, drift-tested against the backend
// in uploadPolicyDrift.test.mjs) should catch both of these before
// the server is ever asked, but if a stale build or a genuine race
// still reaches the server, the raw error CODE must never be shown to
// the artist directly (same "never expose internal error strings"
// requirement as everywhere else) — translate to the brief's exact copy.
const REQUEST_ERROR_COPY: Record<string, string> = {
  FILE_TOO_LARGE: 'This file exceeds the current upload limit. Please choose a smaller file.',
  EXCEEDS_LAUNCH_POLICY_LIMIT: 'This file exceeds the current upload limit. Please choose a smaller file.',
};

function describeRequestError(code: string | undefined): string {
  return (code && REQUEST_ERROR_COPY[code]) || "Couldn't start this upload.";
}

function putWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(file);
  });
}

/**
 * Stage K1.6C — drives one attachment through the full real lifecycle
 * (request -> PUT -> confirm) against the real Edge Functions, with
 * real upload progress. The resulting status (awaiting_scan / rejected
 * / failed) is relayed directly from each Edge Function's own
 * response — this is the ONLY place the uploader ever learns their
 * own attachment's status, since RLS deliberately makes a
 * not-yet-'available' row invisible to a later SELECT (see the
 * migration's own notes) — the status shown here is real but
 * necessarily ephemeral to this browser session, not something a
 * page reload can re-derive.
 */
export function useAttachmentUpload() {
  const [uploads, setUploads] = useState<AttachmentUploadState[]>([]);

  const addFiles = useCallback((files: File[]) => {
    setUploads((prev) => [
      ...prev,
      ...files.map((file) => ({
        localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        status: 'validating' as AttachmentUploadStatus,
        progress: 0,
        attachmentId: null,
        error: null,
      })),
    ]);
  }, []);

  const removeUpload = useCallback((localId: string) => {
    setUploads((prev) => prev.filter((u) => u.localId !== localId));
  }, []);

  const clearUploads = useCallback(() => setUploads([]), []);

  function patch(localId: string, next: Partial<AttachmentUploadState>) {
    setUploads((prev) => prev.map((u) => (u.localId === localId ? { ...u, ...next } : u)));
  }

  /** Uploads every pending file against the given, already-real
   * feedbackId. Validation failures and server rejections are both
   * reported per-file; nothing here throws for an individual file's
   * failure, so one bad attachment never blocks the others. */
  const uploadAll = useCallback(async (feedbackId: string, pending: AttachmentUploadState[]) => {
    for (const upload of pending) {
      const validation = validateAttachmentFile(upload.file);
      if (!validation.ok) {
        patch(upload.localId, { status: 'client_rejected', error: validation.reason });
        continue;
      }

      patch(upload.localId, { status: 'requesting' });
      const requested = await supabase.functions.invoke<{ ok: boolean; attachmentId: string; uploadUrl: string; error?: string }>(
        'portal-request-attachment-upload-url',
        { body: { feedbackId, mimeType: upload.file.type, fileSizeBytes: upload.file.size, originalFilename: upload.file.name } },
      );
      if (requested.error || !requested.data?.ok) {
        patch(upload.localId, { status: 'failed', error: describeRequestError(requested.data?.error) });
        continue;
      }
      const { attachmentId, uploadUrl } = requested.data;
      patch(upload.localId, { status: 'uploading', attachmentId });

      try {
        await putWithProgress(uploadUrl, upload.file, (pct) => patch(upload.localId, { progress: pct }));
      } catch {
        patch(upload.localId, { status: 'failed', error: 'The upload was interrupted.' });
        continue;
      }

      patch(upload.localId, { status: 'confirming' });
      const confirmed = await supabase.functions.invoke<{ ok: boolean; status: AttachmentUploadStatus; error?: string }>(
        'portal-confirm-attachment-upload',
        { body: { attachmentId } },
      );
      if (confirmed.error || !confirmed.data?.ok) {
        patch(upload.localId, { status: 'failed', error: confirmed.data?.error ?? "Couldn't verify this upload." });
        continue;
      }
      patch(upload.localId, { status: confirmed.data.status });
    }
  }, []);

  /** Retries exactly one failed upload from the beginning (a fresh
   * attachment row -- the earlier one, if any, stays failed/orphaned
   * for the retention cleanup to reclaim, never silently reused). */
  const retryUpload = useCallback(
    async (feedbackId: string, localId: string) => {
      const target = uploads.find((u) => u.localId === localId);
      if (!target) return;
      patch(localId, { status: 'validating', progress: 0, error: null, attachmentId: null });
      await uploadAll(feedbackId, [{ ...target, status: 'validating', progress: 0, error: null, attachmentId: null }]);
    },
    [uploads, uploadAll],
  );

  return { uploads, addFiles, removeUpload, clearUploads, uploadAll, retryUpload };
}
