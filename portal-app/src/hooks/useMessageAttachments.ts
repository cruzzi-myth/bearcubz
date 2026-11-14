import { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { isBackendUnavailableError } from '../lib/supabaseErrors';

export type AttachmentStatus =
  | 'pending_upload'
  | 'uploaded'
  | 'awaiting_scan'
  | 'rejected'
  | 'clean'
  | 'promoting'
  | 'available'
  | 'failed';

export type SecurityStatus = 'pending' | 'scanning' | 'clean' | 'infected' | 'error';

export type MessageAttachment = {
  id: string;
  feedbackId: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  status: AttachmentStatus;
  rejectionReason: string | null;
  // Stage K1.6G section 6 — needed to tell apart the distinct real
  // artist-facing states (still scanning vs. a retryable scan error
  // vs. exhausted retries vs. genuinely too large for the scanner vs.
  // expired) that all otherwise share the same `status` value.
  securityStatus: SecurityStatus;
  scanAttemptCount: number;
  awaitingScannerCapacity: boolean;
  isActive: boolean;
};

/**
 * One batched query for every message currently shown in the thread.
 * Stage K1.6D: RLS now returns two different kinds of rows here —
 * any 'available' attachment on a message the caller can see (the
 * original K1.6C policy, unchanged), AND the caller's OWN attachment
 * regardless of status (the new K1.6D policy, so an artist's own
 * "pending review"/"rejected"/"failed" status survives a refresh).
 * Nothing here can ever return someone ELSE's non-available row —
 * that would require either policy to grant it, and neither does.
 */
export function useMessageAttachments(feedbackIds: string[]) {
  const [byMessage, setByMessage] = useState<Record<string, MessageAttachment[]>>({});
  const [status, setStatus] = useState<'loading' | 'ready' | 'backend-unavailable' | 'error'>('loading');
  const key = feedbackIds.join(',');

  useEffect(() => {
    let cancelled = false;
    if (feedbackIds.length === 0) {
      setByMessage({});
      setStatus('ready');
      return;
    }
    setStatus('loading');
    supabase
      .from('collaboration_feedback_attachments')
      .select('id, feedback_id, original_filename, mime_type, byte_size, status, rejection_reason, security_status, scan_attempt_count, awaiting_scanner_capacity, is_active')
      .in('feedback_id', feedbackIds)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (isBackendUnavailableError(error)) {
          setStatus('backend-unavailable');
          return;
        }
        if (error) {
          setStatus('error');
          return;
        }
        const grouped: Record<string, MessageAttachment[]> = {};
        for (const row of data ?? []) {
          const entry: MessageAttachment = {
            id: row.id,
            feedbackId: row.feedback_id,
            originalFilename: row.original_filename,
            mimeType: row.mime_type,
            byteSize: row.byte_size,
            status: row.status,
            rejectionReason: row.rejection_reason,
            securityStatus: row.security_status,
            scanAttemptCount: row.scan_attempt_count,
            awaitingScannerCapacity: row.awaiting_scanner_capacity,
            isActive: row.is_active,
          };
          (grouped[row.feedback_id] ??= []).push(entry);
        }
        setByMessage(grouped);
        setStatus('ready');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { byMessage, status };
}
