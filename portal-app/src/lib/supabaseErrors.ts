import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Stage D's migrations haven't been applied anywhere yet. Every query
 * against a Signal Portal table or RPC will fail until they are — and
 * that failure must never be read as "confirmed no access." This
 * recognizes the two concrete error shapes Postgres/PostgREST produce
 * for "that doesn't exist yet": an undefined relation (42P01, for a
 * missing table) and PostgREST's own "could not find function in
 * schema cache" (PGRST202, for a missing RPC). Anything else is a
 * real query failure, not a backend-not-configured state, and is
 * reported as such rather than lumped in here.
 */
export function isBackendUnavailableError(error: PostgrestError | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST202' || error.code === 'PGRST205') return true;
  return messageLooksLikeBackendUnavailable(error.message);
}

/** Same "doesn't exist yet" check as above, for call sites (the
 * admin API layer's ApiResult, Edge Function error strings) that
 * only ever carry a plain message, not a typed PostgrestError. */
export function messageLooksLikeBackendUnavailable(message: string | null | undefined): boolean {
  const lower = message?.toLowerCase() ?? '';
  return lower.includes('does not exist') || lower.includes('schema cache');
}
