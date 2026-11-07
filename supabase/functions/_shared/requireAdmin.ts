import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createUserClient } from './clients.ts';

/** Verifies the caller is authenticated AND is_portal_admin() for
 * them returns true — both checked by asking Postgres as the real
 * user, never by trusting anything the client claims about itself.
 * Returns the verified admin's uid on success, or null. */
export async function requireAdmin(
  supabaseUrl: string,
  authHeader: string | null,
): Promise<{ uid: string; userClient: SupabaseClient } | null> {
  if (!authHeader) return null;

  const userClient = createUserClient(supabaseUrl, authHeader);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return null;

  const adminCheck = await userClient.rpc('is_portal_admin');
  if (adminCheck.error || adminCheck.data !== true) return null;

  return { uid: userData.user.id, userClient };
}
