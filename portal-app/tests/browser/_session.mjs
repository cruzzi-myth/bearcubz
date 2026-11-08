// Seeds a REAL Supabase-issued session into a browser tab's
// localStorage, in the exact shape supabase-js itself persists. The
// session is obtained via a genuine signInWithPassword call against
// the real dev project — Supabase does the actual verifying and
// issuing. This only substitutes "click the link in the inbox" with
// "the session is already in localStorage when the page loads" —
// the same pattern Supabase's own docs recommend for E2E testing an
// email/magic-link flow without real mail delivery. Never used
// against anything but the isolated dev project.
export function authStorageKey(supabaseUrl) {
  const ref = new URL(supabaseUrl).hostname.split('.')[0];
  return `sb-${ref}-auth-token`;
}

export async function signInForBrowser(anonClient, email, password) {
  const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`signInWithPassword(${email}) failed: ${error?.message}`);
  return data.session;
}

export async function seedSessionAndReload(page, supabaseUrl, session, path = '/') {
  const key = authStorageKey(supabaseUrl);
  await page.goto(`http://localhost:5173${path}`);
  await page.evaluate(
    ([k, v]) => {
      localStorage.setItem(k, v);
    },
    [key, JSON.stringify(session)],
  );
  await page.reload();
}
