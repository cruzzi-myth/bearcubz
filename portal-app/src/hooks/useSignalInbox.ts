import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { isBackendUnavailableError } from '../lib/supabaseErrors';
import { usePortalAuth } from '../features/auth/PortalAuthContext';
import { replyToFeedback } from '../features/admin/services/adminApi';

export type InboxMessage = {
  id: string;
  collaborationId: string;
  collaborationTitle: string;
  authorId: string;
  isAdminReply: boolean;
  /** "You" for the viewer's own messages, "The Collective" for admin
   * replies, or the real artist display name -- only ever resolved
   * for the admin's own inbox, since a non-admin's RLS-scoped rows
   * can never include another artist's message in the first place. */
  senderLabel: string;
  body: string;
  createdAt: string;
  assetId: string | null;
  assetType: string | null;
  isUnread: boolean;
};

type State =
  | { status: 'loading' }
  | { status: 'backend-unavailable' }
  | { status: 'error' }
  | { status: 'ready'; messages: InboxMessage[]; unreadCount: number; readTrackingAvailable: boolean };

type FeedbackRow = {
  id: string;
  collaboration_id: string;
  author_id: string;
  is_admin_reply: boolean;
  body: string;
  created_at: string;
  asset_id: string | null;
  recipient_user_id: string | null;
  collaborations: { title: string } | null;
  collaboration_assets: { asset_type: string } | null;
};

/**
 * Powers the global SIGNAL INBOX. Reuses collaboration_feedback
 * exactly as-is (same table, same RLS the Feedback/Transmissions
 * interfaces already depend on) -- a non-admin's query here is
 * already scoped by the existing "member select own thread" policy
 * to their own collaborations only, so there is no separate
 * authorization check to write; an admin's query is scoped by the
 * existing "admin select all feedback" policy. Neither path is new.
 *
 * Read tracking (collaboration_feedback_reads) is queried
 * defensively: if that table doesn't exist yet in this environment
 * (not yet approved/applied), isBackendUnavailableError catches it
 * and the inbox still renders every message correctly -- the unread
 * badge simply stays off (readTrackingAvailable: false) until the
 * migration is live, never a crash, never an invented count.
 */
export function useSignalInbox() {
  const { status: authStatus, isAdmin, session } = usePortalAuth();
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async () => {
    if (authStatus !== 'signed-in' || !session?.user.id) return;
    setState({ status: 'loading' });
    const myUid = session.user.id;

    const feedbackResult = await supabase
      .from('collaboration_feedback')
      .select('id, collaboration_id, author_id, is_admin_reply, body, created_at, asset_id, recipient_user_id, collaborations(title), collaboration_assets(asset_type)')
      .order('created_at', { ascending: false })
      .limit(50)
      .returns<FeedbackRow[]>();

    if (isBackendUnavailableError(feedbackResult.error)) {
      setState({ status: 'backend-unavailable' });
      return;
    }
    if (feedbackResult.error) {
      setState({ status: 'error' });
      return;
    }
    const rows = feedbackResult.data ?? [];

    // Admin-only: resolve real sender names for artist-authored rows.
    // Never attempted for a non-admin viewer -- their rows can only
    // ever be their own or an admin reply, so there is no other
    // identity to resolve, and no reason to query artist_profiles at
    // all for that case.
    const profileByUserId = new Map<string, string>();
    if (isAdmin) {
      const authorIds = [...new Set(rows.filter((r) => !r.is_admin_reply).map((r) => r.author_id))];
      if (authorIds.length > 0) {
        const profiles = await supabase.from('artist_profiles').select('user_id, display_name').in('user_id', authorIds);
        for (const p of profiles.data ?? []) profileByUserId.set(p.user_id, p.display_name);
      }
    }

    const readsResult = await supabase.from('collaboration_feedback_reads').select('feedback_id').eq('user_id', myUid);
    const readTrackingAvailable = !readsResult.error;
    const readIds = new Set((readsResult.data ?? []).map((r) => r.feedback_id as string));

    const messages: InboxMessage[] = rows.map((row) => {
      const isMine = row.author_id === myUid;
      const senderLabel = row.is_admin_reply ? 'The Collective' : isMine ? 'You' : (profileByUserId.get(row.author_id) ?? 'Artist');
      return {
        id: row.id,
        collaborationId: row.collaboration_id,
        collaborationTitle: row.collaborations?.title ?? 'Collaboration',
        authorId: row.author_id,
        isAdminReply: row.is_admin_reply,
        senderLabel,
        body: row.body,
        createdAt: row.created_at,
        assetId: row.asset_id,
        assetType: row.collaboration_assets?.asset_type ?? null,
        isUnread: readTrackingAvailable && !isMine && !readIds.has(row.id),
      };
    });

    setState({
      status: 'ready',
      messages,
      unreadCount: messages.filter((m) => m.isUnread).length,
      readTrackingAvailable,
    });
  }, [authStatus, isAdmin, session?.user.id]);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = useCallback(
    async (feedbackId: string) => {
      if (!session?.user.id) return;
      await supabase.from('collaboration_feedback_reads').upsert({ feedback_id: feedbackId, user_id: session.user.id }, { onConflict: 'feedback_id,user_id', ignoreDuplicates: true });
      setState((s) =>
        s.status === 'ready'
          ? { ...s, messages: s.messages.map((m) => (m.id === feedbackId ? { ...m, isUnread: false } : m)), unreadCount: s.messages.filter((m) => m.id !== feedbackId && m.isUnread).length }
          : s,
      );
    },
    [session?.user.id],
  );

  /** Quick reply -- routes to the exact same Edge Functions the full
   * Transmissions interface already uses, never a new write path. */
  const sendReply = useCallback(
    async (collaborationId: string, body: string): Promise<boolean> => {
      if (isAdmin) {
        const result = await replyToFeedback(collaborationId, body);
        if (result.ok) await load();
        return result.ok;
      }
      const { error } = await supabase.functions.invoke('portal-submit-feedback', { body: { collaborationId, kind: 'general', body } });
      if (!error) await load();
      return !error;
    },
    [isAdmin, load],
  );

  return { ...state, reload: load, markRead, sendReply };
}
