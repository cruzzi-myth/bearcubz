// Real supabase-js clients and real test-identity sessions — no auth
// bypass anywhere. A "signed in as Artist A" session in these tests is
// always obtained by actually calling Supabase Auth (admin.createUser
// then signInWithPassword), never by constructing a fake session or
// trusting a bare user id as if it were a verified session.
import { createClient } from '@supabase/supabase-js';

export function buildClients({ supabaseUrl, anonKey, serviceRoleKey }) {
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error('buildClients requires supabaseUrl, anonKey, and serviceRoleKey — see .env.integration.example');
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const anon = () => createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return { admin, anon };
}

/** Creates a disposable synthetic test user (service-role, admin API)
 * with a known password, then signs in as them through the real Auth
 * flow (anon client + signInWithPassword) — this IS Supabase verifying
 * the credential; nothing here skips that step. Returns a client whose
 * session is this user's real, Auth-issued session, for use directly
 * against RLS-protected tables exactly as the real app would. */
export async function createAndSignInTestUser(clients, email, password) {
  const created = await clients.admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error && !created.error.message?.toLowerCase().includes('already')) {
    throw new Error(`createUser(${email}) failed: ${created.error.message}`);
  }

  const userClient = clients.anon();
  const signedIn = await userClient.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) {
    throw new Error(`signInWithPassword(${email}) failed: ${signedIn.error?.message}`);
  }

  return { client: userClient, uid: signedIn.data.session.user.id, email, accessToken: signedIn.data.session.access_token };
}

/** Deletes a synthetic test user by uid (service-role). Call during
 * teardown for every identity created via createAndSignInTestUser —
 * test data must be removable, per the Stage I2A brief's test-data
 * requirement. Returns the error (if any) rather than swallowing it —
 * an earlier version discarded this, which let a foreign-key failure
 * (an undeleted portal_admin_audit_log row referencing this uid) leave
 * a synthetic user stranded in the dev project without ever being
 * reported (Stage I2B finding; see fixtures.mjs's teardown ordering). */
export async function deleteTestUser(clients, uid) {
  const { error } = await clients.admin.auth.admin.deleteUser(uid);
  return error ?? null;
}
