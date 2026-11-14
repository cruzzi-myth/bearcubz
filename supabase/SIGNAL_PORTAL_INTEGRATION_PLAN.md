# SIGNAL PORTAL — Integration & Verification Plan (Stage I1)

Status: a plan only. Nothing in this document authorizes execution. Every
step below is written as "what Stage I2 would need to do," not as
instructions to run now. No production operation, migration application,
Edge Function deployment, or account creation has occurred as part of
writing this plan.

---

## 1. Test environment requirements

Signal Portal must be verified against a Supabase project that is **not**
the production project (`drsidtagxezznqviupsr`) before any of this touches
real users. Two options, in order of preference:

1. **A separate Supabase project** created specifically for this purpose (free tier is sufficient — this schema is small). Fully isolated; zero risk of ever touching production data. Preferred.
2. **A local Supabase stack** (`supabase start`) running Postgres/Auth/Storage in Docker on the development machine. Faster iteration, no network dependency, but requires Docker and the Supabase CLI to already be installed and working locally — not assumed present.

Either way, the test project needs:
- All four Signal Portal migrations applied, in filename order (see §2).
- All eight Edge Functions deployed (see §3).
- `PORTAL_REDIRECT_URL` set to something reachable in the test environment — for a local stack this can be `http://localhost:5173/portal/` or similar; it does not need to be `bearcubz.com`.
- `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` in `portal-app/.env.local` pointed at the test project, never production.
- Auth email sending configured (or, for a local stack, read OTP links directly from the Inbucket/mail-trap the CLI provides) — invitation acceptance depends on a real magic-link/OTP flow.

## 2. Migration application order

Apply in this exact order (matches filename timestamp order, which is also
dependency order — confirmed by reading each file's `create`/`alter`
statements for forward references):

1. `20261106140000_signal_portal_schema.sql` — base tables, `is_portal_admin()`, `accept_artist_invitation()`.
2. `20261106140100_signal_portal_storage.sql` — the three private buckets.
3. `20261106150000_signal_portal_artwork.sql` — artwork columns, expanded `asset_type` check, `approval_status`, partial unique index.
4. `20261106160000_signal_portal_upload_lifecycle.sql` — `upload_status`, the original `promote_primary_cover(uuid)`, RLS tightening on `collaboration_assets`.
5. `20261106170000_signal_portal_security_hardening.sql` — replaces `promote_primary_cover` with the 2-arg hardened version, adds `collaboration_feedback.recipient_user_id` and its policy.

Using `supabase db push` (or `supabase migration up` against a local stack)
applies all five in one pass already in the correct order, since the CLI
sorts by filename. Manual/partial application (e.g. via the SQL editor) must
preserve this order — applying #5 before #4 would fail outright (`drop
function if exists public.promote_primary_cover(uuid)` would be a no-op
against a function that doesn't exist yet, which is harmless, but the
`approval_status` column #5's function body reads would not yet exist,
which is not harmless).

## 3. Edge Function deployment order

No ordering dependency exists between the eight functions themselves — each
is independently deployable. The real ordering constraint is **migrations
before functions**, specifically:

- `portal-admin-confirm-upload` and `portal-admin-manage-collaboration` both call `promote_primary_cover(target_asset_id, acting_admin_id)` (2-arg form). Deploying either of these functions before migration #5 is applied would make every primary-cover-promotion call fail with a "function does not exist" Postgres error (fail-closed, per the Security Audit §H failure-recovery analysis) until the migration catches up. Not dangerous, but will surface as a visible error in any end-to-end test run in that window.
- `portal-admin-create-invitation` depends on migration #1 (`artist_invitations` table) only.
- `portal-request-access` depends on migration #1 (`artist_invitations`) and Auth being configured to accept `createUser`/`signInWithOtp` calls.

Recommended order: deploy all eight functions together, immediately after
all five migrations are confirmed applied — there's no benefit to
staggering them in a test environment, only in a live production rollout
(out of scope for this plan; this document does not cover a production
deployment sequence).

The eight functions: `portal-admin-confirm-upload`,
`portal-admin-create-invitation`, `portal-admin-list-invitations`,
`portal-admin-manage-collaboration`, `portal-admin-reply-feedback`,
`portal-admin-request-upload-url`, `portal-request-access`,
`portal-submit-feedback`.

## 4. Required configuration

| Setting | Value | Notes |
|---|---|---|
| `PORTAL_REDIRECT_URL` (function env var) | test environment's own portal URL | Falls back to `https://bearcubz.com/portal/` if unset — **must** be overridden for a test project, or a real OTP email would redirect a tester back to production. |
| Auth → URL Configuration → Redirect URLs | test environment's portal URL added | Only relevant if testing against a separate Supabase project; a local stack doesn't enforce this the same way. |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | test project's values | `portal-app/.env.local`, never committed. |
| Storage buckets | created by migration #2 | No manual step needed beyond applying the migration. |

No other configuration is required. This plan does not invent any
configuration requirement beyond what the existing code already reads from
environment variables — confirmed by grep across `supabase/functions/` for
every `Deno.env.get(...)` call: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_ANON_KEY` (all auto-injected by Supabase into every Edge
Function), and `PORTAL_REDIRECT_URL` (the one function-specific value).

## 5. Admin bootstrap (test environment only)

Per `supabase/ADMIN_BOOTSTRAP.md` (unchanged this stage): there is no
self-service "become an admin" path, by design. In a test environment:

1. Create a disposable test user through normal Supabase Auth (sign up, or `auth.admin.createUser` via the SQL editor/CLI using a service-role key scoped to the TEST project only).
2. Manually insert one row into `portal_admins` for that user's `id`, with `granted_by = null` (the documented bootstrap exception).
3. Verify `is_portal_admin()` returns `true` for that session before testing any admin-only Edge Function.

This must never be done against the production project as part of this
plan — it is listed here only as the test-environment equivalent of the
real bootstrap process, which remains a manual, out-of-band, production
decision for later.

## 6. Test identity setup

Disposable identities needed, all created only in the test environment:

| Identity | Purpose |
|---|---|
| Admin test user | Bootstrapped per §5; exercises every `portal-admin-*` function. |
| Artist A | Invited to Collaboration 1 only; exercises the full invite→accept→dashboard→chamber flow as the "normal" case. |
| Artist A (post-revocation) | Same user as above, after an admin calls `revoke_member` on them — exercises the `revoked` authorization state. |
| Artist B | Invited to Collaboration 2 only; exercises cross-artist isolation against Collaboration 1. |
| Artist C | A second active member added to Collaboration 1 (deliberately, to create the first-ever multi-member collaboration) — the only way to actually exercise the feedback-recipient-scoping fix (Security Audit §A3) end-to-end, since no such collaboration exists anywhere today. |
| Unauthenticated browser session | Exercises `not-authorized`/redirect-to-entrance behavior with zero session. |

No real artist email address, and no account with any connection to a real
person, is to be used for any of these — this plan assumes disposable
addresses (e.g. a test inbox domain, or the local stack's Inbucket) for
every identity above.

## 7. Security test execution plan

Each scenario below is **prepared, not executed**. It names the exact
behavior to exercise and which finding or control it verifies; running it
is Stage I2's work, against the test environment from §1, never production.

1. **RLS isolation** — Artist B queries every table in the §C matrix (Security Audit) for Collaboration 1's id; expect 0 rows everywhere except columns the matrix marks ✅ for their own collaboration.
2. **Invitation acceptance (happy path)** — create an invitation for Artist A via `portal-admin-create-invitation`, have Artist A sign in via the OTP link, confirm `accept_artist_invitation()` creates the `artist_profiles` row and the `collaboration_members` row, and that a second sign-in (simulating a returning artist) does not break authorization (the Stage E bug this guards against).
3. **Invitation expiry/revocation** — create an invitation, revoke it before acceptance via `revoke_invitation`; confirm `accept_artist_invitation()` then raises `NOT_ELIGIBLE` for that email. Separately, create one with `expiresInDays: 1`, wait (or directly update `expires_at` in the test DB to the past), confirm the same.
4. **Admin privilege enforcement** — call every `portal-admin-*` function as Artist A (a non-admin, authenticated artist); expect `403 NOT_AUTHORIZED` from every one of them, confirming `requireAdmin()` actually blocks a real non-admin session, not just a theoretical one.
5. **Storage confirmation integrity** — request an upload URL, deliberately do NOT upload anything, then call `portal-admin-confirm-upload` for that asset; expect `upload_status` to transition to `failed` with reason `OBJECT_NOT_FOUND`, never `ready`. Then actually upload a file of the wrong size and confirm `SIZE_MISMATCH`.
6. **Signed-URL authorization** — request a signed URL for an asset as Artist B (not a member of that asset's collaboration); expect `403 NOT_AUTHORIZED`. Then as the real active member, expect success with a URL that expires in 5 minutes.
7. **Primary-cover atomicity** — with two ready, cover-eligible assets in one collaboration, call `promote_primary_cover` (via `update_asset`) on each in rapid succession (as close to simultaneous as two scripted requests can manage) and confirm exactly one ends up `is_primary_cover = true`, never zero or two. Separately, attempt to promote a `failed`-status asset and a `rejected`-approval asset; expect `ASSET_NOT_READY` and `ASSET_REJECTED` respectively, never a silent success.
8. **Feedback privacy** — using Artist C from §6, have the admin reply once with no explicit recipient (should auto-scope to nothing, since there are now 2 active members — confirm it stays `NULL`, i.e., visible to both, which is the documented fallback for the "more than one, ambiguous" case) and once with an explicit `recipientUserId` set to Artist A; confirm Artist A sees the targeted reply and Artist C does not.

## 8. Regression testing requirements

- Re-run the full Signal Portal unit suite (`portal-app/tests/security/*.test.mjs`, 79 assertions as of this stage) after any further code change, before re-authorizing a later stage.
- Re-run `cd portal-app && npx tsc -b && npm run build && npx oxlint` after any further code change.
- Re-run the Stage G/H `resolveQuickAction`/dialogue tests (now folded into `portalHostActions.test.mjs`) if `portalHostActions.ts`, `portalHostDialogue.ts`, or `portalHostConfig.ts` ever changes, to catch any regression in NYX ARDENT's navigation decisions.
- Confirm via `git diff` (or `git status --short`, as in Security Audit §J) that no file outside `portal-app/` and `supabase/` changes as part of any future Signal Portal work — this is the standing Moon Racer regression guard that has held across every stage (A through I1) so far.
- No existing Moon Racer Edge Function, migration, or frontend app should ever need to change for Signal Portal work; if a future stage proposes touching one, that is itself a signal to stop and re-scope before proceeding.

## 9. Rollback and recovery procedures

- **Migrations**: none of the five Signal Portal migrations have been applied anywhere yet, so there is nothing to roll back in production today. Once applied to a test environment, migration #5's specific rollback procedure is documented in Security Audit §H ("Reversibility") — in short, the function change is cleanly reversible, the `recipient_user_id` column drop is reversible only before any row sets a non-null value.
- **Edge Functions**: Supabase Edge Functions are deployed per-function and versioned by the platform; reverting a function to its previous deployed version is a platform-level redeploy of the prior code, not a migration-style operation. No custom rollback tooling is needed beyond redeploying the prior `index.ts`.
- **Admin bootstrap**: reversible by deleting (or setting `revoked_at`) the test `portal_admins` row — never relevant to production under this plan, since no production bootstrap has occurred.
- **Test data**: every identity and row created under §6/§7 lives only in the disposable test project/local stack and is discarded by simply not reusing that project, or by `supabase db reset` on a local stack.

## 10. Production approval checkpoint

This plan explicitly stops before production. The following must all be
true, and separately, explicitly re-confirmed by the user, before any
Signal Portal migration is applied or any function deployed to the
production project (`drsidtagxezznqviupsr`):

1. Every scenario in §7 has been executed (not just reviewed) against a test environment, with results recorded.
2. The regression checks in §8 pass on the exact code about to be deployed.
3. A specific, explicit go-ahead is given for Stage I2 (test-environment execution) and, separately again, for a subsequent production-migration stage — this document does not treat passing §7 as implicit authorization to deploy anywhere, including the test environment itself, which still requires the user's go-ahead to create and use.
4. No absolute restriction from the Stage I1 brief (no production migrations, no Edge Function deployment, no website deployment, no real invitations, no production admin bootstrap, no commit/push) has been read as satisfied by anything in this plan — this plan describes future authorized work, and performs none of it now.
