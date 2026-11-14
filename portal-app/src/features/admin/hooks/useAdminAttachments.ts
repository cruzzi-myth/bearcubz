import { useCallback, useEffect, useState } from 'react';
import { listRawAttachments, listAttachmentFeedbackRows, listCollaborations } from '../services/adminApi';
import { messageLooksLikeBackendUnavailable } from '../../../lib/supabaseErrors';
import type { AdminAttachment } from '../types/adminTypes';

type State = { kind: 'loading' } | { kind: 'backend-unavailable' } | { kind: 'error'; message: string } | { kind: 'ready'; attachments: AdminAttachment[]; projects: { id: string; title: string }[] };

/**
 * Stage K1.6D — joins the three real, already-authorized reads
 * (attachments, their parent feedback rows, and the real collaboration
 * list) client-side, same pattern useAdminFeedback already uses for
 * collaboration titles. The project list this returns IS the real,
 * live collaborations table — never a hardcoded "XYLO"/"Issey Cross"
 * pair, so a third real project would show up here with zero code
 * changes.
 */
export function useAdminAttachments() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    const [attachments, feedback, collaborations] = await Promise.all([listRawAttachments(), listAttachmentFeedbackRows(), listCollaborations()]);

    for (const result of [attachments, feedback, collaborations]) {
      if (!result.ok) {
        setState(messageLooksLikeBackendUnavailable(result.error) ? { kind: 'backend-unavailable' } : { kind: 'error', message: result.error });
        return;
      }
    }
    if (!attachments.ok || !feedback.ok || !collaborations.ok) return; // narrows for TS below

    const feedbackById = new Map(feedback.data.map((f) => [f.id, f]));
    const titleByCollaboration = new Map(collaborations.data.map((c) => [c.id, c.title]));

    const joined: AdminAttachment[] = attachments.data
      .map((a) => {
        const fb = feedbackById.get(a.feedbackId);
        if (!fb) return null; // orphaned row (parent deleted) -- never shown rather than guessed at
        return {
          id: a.id,
          feedbackId: a.feedbackId,
          collaborationId: fb.collaborationId,
          collaborationTitle: titleByCollaboration.get(fb.collaborationId) ?? 'Unknown collaboration',
          messageBody: fb.body,
          authorId: fb.authorId,
          authorIsAdminReply: fb.isAdminReply,
          originalFilename: a.originalFilename,
          mimeType: a.mimeType,
          byteSize: a.byteSize,
          status: a.status as AdminAttachment['status'],
          securityStatus: a.securityStatus as AdminAttachment['securityStatus'],
          securityScanDetail: a.securityScanDetail,
          scanProvider: a.scanProvider,
          reviewStatus: a.reviewStatus as AdminAttachment['reviewStatus'],
          rejectionReason: a.rejectionReason,
          uploadedAt: a.uploadedAt,
          promotionError: a.promotionError,
          scanAttemptCount: a.scanAttemptCount,
          scanStartedAt: a.scanStartedAt,
          scanCompletedAt: a.scanCompletedAt,
          scanLastError: a.scanLastError,
          scanNextRetryAt: a.scanNextRetryAt,
          awaitingScannerCapacity: a.awaitingScannerCapacity,
          scanWaitingSince: a.scanWaitingSince,
          scanRetentionExpiresAt: a.scanRetentionExpiresAt,
          isActive: a.isActive,
        };
      })
      .filter((x): x is AdminAttachment => x !== null);

    setState({
      kind: 'ready',
      attachments: joined,
      projects: collaborations.data.map((c) => ({ id: c.id, title: c.title })),
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { state, reload: load };
}
