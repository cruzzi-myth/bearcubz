import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../services/supabaseClient';
import { classifyAuthorization } from './portalAuthorization';
import { isBackendUnavailableError } from '../../lib/supabaseErrors';

export type PortalAuthStatus = 'loading' | 'signed-out' | 'signed-in';

// 'checking' — session exists, still asking the backend. The other
// five are mutually exclusive, final answers:
//   'authorized'          — at least one ACTIVE membership, or admin.
//   'revoked'             — has membership row(s), but none active —
//                           distinct from never having been invited.
//   'not-authorized'      — zero membership rows at all, and not admin.
//   'backend-unavailable' — Stage D's migrations aren't applied in
//                           this environment yet. This must never be
//                           confused with 'not-authorized' — a missing
//                           table is not proof of "no access."
//   'error'               — the query itself failed for some OTHER
//                           reason (a real network error, say) —
//                           found as a gap during the Stage H review:
//                           the original code let any non-"missing
//                           table" error silently fall through to
//                           'not-authorized', which is just as wrong
//                           as confusing it with 'backend-unavailable'.
export type PortalAuthorization = 'checking' | 'authorized' | 'revoked' | 'not-authorized' | 'backend-unavailable' | 'error';

interface PortalAuthState {
  status: PortalAuthStatus;
  authorization: PortalAuthorization;
  isAdmin: boolean;
  session: Session | null;
  signOut: () => Promise<void>;
  /** Re-runs invitation acceptance + the membership/admin check (used by the error state's retry). */
  retry: () => void;
}

const PortalAuthContext = createContext<PortalAuthState | null>(null);

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<PortalAuthStatus>('loading');
  const [authorization, setAuthorization] = useState<PortalAuthorization>('checking');
  const [isAdmin, setIsAdmin] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function resolveAuthorization() {
      // Step 1: attempt to accept a pending invitation, if one exists
      // for this email. Expected to fail with NOT_ELIGIBLE for a
      // returning artist who already accepted theirs — that failure
      // is normal and is NOT treated as "not authorized" below.
      // Accepting and being authorized are different questions;
      // conflating them would lock out every onboarded artist on
      // their second visit. If the RPC itself doesn't exist yet
      // (migrations not applied), that's handled in step 2's check,
      // not here.
      const accepted = await supabase.rpc('accept_artist_invitation');
      if (cancelled) return;
      // NOT_ELIGIBLE (no pending invitation — every returning artist)
      // and NOT_AUTHENTICATED are normal here. A missing RPC is handled
      // by the backend-unavailable classification below. Anything else
      // (network, server error) means acceptance may not have happened:
      // surface an error with a retry — never a success/empty state.
      if (accepted.error) {
        const msg = accepted.error.message ?? '';
        const expected = msg.includes('NOT_ELIGIBLE') || msg.includes('NOT_AUTHENTICATED') || isBackendUnavailableError(accepted.error);
        if (!expected) {
          setAuthorization('error');
          return;
        }
      }

      // Step 2: read this user's OWN membership rows, unfiltered by
      // status — RLS scopes this to auth.uid() regardless, and
      // (unlike every other table here) this policy deliberately
      // doesn't filter by status, specifically so a revoked member
      // can still see that they once had access, and the UI can
      // explain that rather than showing the generic "never
      // invited" message.
      const [memberships, adminCheck] = await Promise.all([
        supabase.from('collaboration_members').select('status'),
        supabase.rpc('is_portal_admin'),
      ]);
      if (cancelled) return;

      // Classification itself lives in portalAuthorization.ts as a pure
      // function so it can be unit-tested directly — see
      // tests/security/portalAuthorization.test.mjs. Behavior here must
      // stay identical to that extraction.
      const adminStatus = adminCheck.data === true;
      const result = classifyAuthorization({
        membershipsError: memberships.error,
        adminCheckError: adminCheck.error,
        adminStatus,
        memberships: memberships.data ?? [],
      });

      // isAdmin only reflects a successfully-resolved check — on
      // 'backend-unavailable'/'error' adminCheck.data isn't trustworthy,
      // so isAdmin is left as whatever it already was (unchanged from
      // the pre-extraction behavior).
      if (result !== 'backend-unavailable' && result !== 'error') {
        setIsAdmin(adminStatus);
      }
      setAuthorization(result);
    }

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setStatus(data.session ? 'signed-in' : 'signed-out');
      if (data.session) resolveAuthorization();
      else setAuthorization('not-authorized');
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setStatus(nextSession ? 'signed-in' : 'signed-out');
      if (nextSession) {
        setAuthorization('checking');
        resolveAuthorization();
      } else {
        // Clears on sign-out — no Portal-specific state survives it.
        setAuthorization('not-authorized');
        setIsAdmin(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [attempt]);

  const value = useMemo<PortalAuthState>(
    () => ({
      status,
      authorization,
      isAdmin,
      session,
      async signOut() {
        // End the session everywhere; if the server call fails (offline, expired
        // token) still end it locally, then CONFIRM no session remains.
        try {
          const { error } = await supabase.auth.signOut();
          if (error) await supabase.auth.signOut({ scope: 'local' });
        } catch {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
        }
        const { data } = await supabase.auth.getSession();
        if (data.session) await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      },
      retry() {
        setAuthorization('checking');
        setAttempt((n) => n + 1);
      },
    }),
    [status, authorization, isAdmin, session],
  );

  return <PortalAuthContext.Provider value={value}>{children}</PortalAuthContext.Provider>;
}

export function usePortalAuth(): PortalAuthState {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) throw new Error('usePortalAuth must be used within PortalAuthProvider');
  return ctx;
}
