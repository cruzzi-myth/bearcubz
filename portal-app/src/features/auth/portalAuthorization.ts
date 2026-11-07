import type { PostgrestError } from '@supabase/supabase-js';
import { isBackendUnavailableError } from '../../lib/supabaseErrors';
import type { PortalAuthorization } from './PortalAuthContext';

export interface MembershipRow {
  status: string;
}

export interface ClassifyAuthorizationInput {
  membershipsError: PostgrestError | null | undefined;
  adminCheckError: PostgrestError | null | undefined;
  adminStatus: boolean;
  memberships: MembershipRow[];
}

/**
 * Pure decision step extracted from PortalAuthContext's resolveAuthorization
 * so it can be exercised directly in tests, without a live Supabase client
 * or React. Behavior must stay identical to the inline version it replaced.
 */
export function classifyAuthorization(input: ClassifyAuthorizationInput): PortalAuthorization {
  const { membershipsError, adminCheckError, adminStatus, memberships } = input;

  if (isBackendUnavailableError(membershipsError) || isBackendUnavailableError(adminCheckError)) {
    return 'backend-unavailable';
  }

  if (membershipsError || adminCheckError) {
    return 'error';
  }

  if (adminStatus) {
    return 'authorized';
  }

  const hasActive = memberships.some((row) => row.status === 'active');
  if (hasActive) return 'authorized';
  if (memberships.length > 0) return 'revoked';
  return 'not-authorized';
}
