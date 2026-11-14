# SIGNAL PORTAL — Security Audit (Stage I1)

Status: local review only. Nothing in this document has been applied to, or
tested against, any live Supabase project. "Verification method" for each
finding states exactly what was and wasn't executed — a method described as
unit-tested means a real, passing, checked-in test; a method described as
"reviewed" or "prepared" means code/SQL was read or written but not run
against a database.

Severity scale: **CRITICAL** (exploitable without authentication, or breaks
cross-artist isolation) · **HIGH** (exploitable by an authenticated artist
beyond their own data, or defeats an admin-only control) · **MEDIUM**
(requires an unlikely precondition, or degrades defense-in-depth without a
direct exploit path) · **LOW** (hardening opportunity, no realistic exploit
found) · **INFORMATIONAL** (noted for completeness, no action recommended).

---

## A. Findings fixed during this stage

### A1. [HIGH → FIXED] `promote_primary_cover()` had no authorization check of its own
- **File**: `supabase/migrations/20261106160000_signal_portal_upload_lifecycle.sql` (original), superseded by `supabase/migrations/20261106170000_signal_portal_security_hardening.sql`
- **Condition**: The function's only protection was that nothing except a `service_role` connection could reach it (no `grant` to `authenticated`/`anon`). That is a calling-convention guarantee, not one the database enforces inside the function itself. Any current or future service-role code path that called it — correctly or by mistake — could promote any asset, including a non-visual one (audio, PDF), to `is_primary_cover = true`.
- **Fix**: New signature `promote_primary_cover(target_asset_id uuid, acting_admin_id uuid)`. The function body now independently calls `is_portal_admin(acting_admin_id)` and raises `NOT_AUTHORIZED` if false — it no longer trusts its caller. It also now rejects `asset_type` outside `('track_cover','alternate_cover','visual_image','visual_concept')`, `is_active = false`, and `approval_status = 'rejected'`.
- **Verification method**: REVIEWED — EXECUTED (partial). The function body was read statement-by-statement for correctness and the migration's statement ordering (`drop function` → `create function` → `revoke` → unrelated `alter table`/policy statements) was confirmed valid by inspection. The authorization/eligibility *decision logic* was extracted into `UI-side coverEligibility.ts` for the admin button's own gating and unit-tested (12/12, `portal-app/tests/security/coverEligibility.test.mjs`) — but that is a convenience mirror for the UI, not the SQL function itself. **The SQL function's behavior has not been executed against a real Postgres instance in this stage.** Running it is part of the Integration Plan (I1.13), not this audit.

### A2. [MEDIUM → FIXED] Primary-cover promotion had a race window between two concurrent promotions
- **File**: same as A1.
- **Condition**: The original function locked (`for update`) only the target row before clearing every other row's `is_primary_cover` flag in the same collaboration. Two concurrent promotion calls for two different target assets in the same collaboration could each pass the `v_status <> 'ready'` check before either had committed its clear-and-set, risking two rows briefly or permanently flagged primary (caught eventually by the partial unique index added in the artwork migration, but as an unhandled constraint-violation error rather than a clean rejection).
- **Fix**: The function now locks every asset row belonging to the target's collaboration (`for update` over `where collaboration_id = (...)`) before reading state, serializing concurrent promotions within the same collaboration.
- **Verification method**: REVIEWED — NOT EXECUTED. Correct by inspection of the lock scope; a concurrent-transaction test (two simultaneous `promote_primary_cover` calls) was not run, since that requires two live Postgres sessions. Added to the Integration Plan's required test list (I1.13 §7).

### A3. [HIGH → FIXED] `collaboration_feedback` had no per-recipient scoping for admin replies
- **File**: `supabase/migrations/20261106140000_signal_portal_schema.sql` (original policy), superseded by `20261106170000_signal_portal_security_hardening.sql`.
- **Condition**: Every active member of a collaboration could see every `is_admin_reply = true` row for that collaboration, with no way to address a reply to one specific member. Safe only because every collaboration built so far has exactly one active member — the first collaboration with two or more active members would leak one artist's private feedback thread to the other.
- **Fix**: Added nullable `recipient_user_id` (FK to `auth.users(id)`). RLS policy `"member select own thread"` rewritten to: a member sees a row if `author_id = auth.uid()`, or if it's an admin reply AND (`recipient_user_id is null` OR `recipient_user_id = auth.uid()`). `NULL` preserves today's "visible to the whole collaboration" behavior exactly. `portal-admin-reply-feedback` defaults `recipient_user_id` to the sole active member when exactly one exists and none was supplied, and otherwise leaves it `NULL`.
- **Verification method**: REVIEWED — NOT EXECUTED. The policy's boolean logic was traced by hand against all 4 cases (own row / admin reply, no recipient / admin reply, recipient = self / admin reply, recipient = someone else) and is covered in the RLS matrix below. Not run against live Postgres rows in this stage — see Integration Plan §7, scenario "feedback-privacy."

### A4. [LOW → FIXED] `portal-admin-confirm-upload` used a 64-byte size tolerance
- **File**: `supabase/functions/portal-admin-confirm-upload/index.ts`, logic now in `supabase/functions/_shared/uploadLifecycle.ts`.
- **Condition**: Storage's reported object size is exact, not an estimate — there was no legitimate reason for a ±64-byte window, and it strictly widened (by 128 possible byte values) the range in which a truncated or substituted file could still pass verification.
- **Fix**: Exact-size comparison (`primarySize === expectedByteSize`), with the "unknown size" cases (either side `null`) still treated as "can't disprove," unchanged from before.
- **Verification method**: UNIT-TESTED — EXECUTED. `portal-app/tests/security/uploadLifecycle.test.mjs`, 16/16 passed, including a case 1 byte off the expected size now correctly failing as `SIZE_MISMATCH`.

---

## B. Findings reviewed and confirmed safe (no change made)

### B1. [INFORMATIONAL] `promote_primary_cover()` has no explicit `grant ... to service_role`
- **Condition considered**: The function has `revoke all ... from public` and no further grant line. Does the Edge Function's `service_role` connection actually have `EXECUTE` on it?
- **Why not a finding**: Compared directly against `moon_racer_vote_results()`, a pre-existing, already-functioning function in this same project using the identical pattern (`revoke` from `anon`/`authenticated`, no explicit `service_role` grant). Supabase's platform-level default schema privileges grant `service_role` access that an explicit `revoke ... from public` does not remove (PostgreSQL's `public` pseudo-role grant and `service_role`'s own privileges are independent). This was a verification question, not a guess — resolved by precedent already running in production, not assumed either way.
- **Verification method**: REVIEWED — NOT EXECUTED against this specific function (would require calling it via a real service-role client against an applied migration).

### B2. [INFORMATIONAL] Admin-only Edge Functions have no explicit rate limiting
- **Condition considered**: `portal-admin-*` functions check `requireAdmin()` but have no per-admin request-rate cap, unlike the two artist-facing functions (`portal-request-access`: 3/15min, `portal-submit-feedback`: 10/60min).
- **Why classified this way, not fixed**: An admin is already a fully-trusted principal under this system's model — every admin-only table already grants that principal unrestricted read (`admin select all ...` policies) and the write surface goes through functions that re-verify admin status per call. Rate limiting an already-fully-trusted actor defends against a compromised admin credential, which is a real but different threat (credential theft) than an authorization gap. Per the brief's explicit instruction to prioritize real security corrections over cosmetic improvements, this is documented, not acted on, in this stage.
- **Recommendation for a future stage**: if this is wanted, it belongs with a broader credential-compromise response plan (session revocation, audit-log alerting), not a bolt-on counter.
- **Verification method**: REVIEWED — NOT EXECUTED (no rate-limit code exists to test).

### B3. [INFORMATIONAL] Email-format regex exists in two places
- **Files**: `supabase/functions/_shared/invitationValidation.ts` (new, Stage I1) and `supabase/functions/portal-request-access/index.ts` (pre-existing, unchanged).
- **Condition**: Both use the same pattern `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, defined independently rather than sharing one constant.
- **Why not consolidated**: `portal-request-access`'s own comment states this check is "a defensive backstop, not where the real security boundary lives" — the real boundary there is the invitation-eligibility lookup and the neutral response, not the regex. Unifying the two is a pure readability/DRY improvement with no security effect; left alone per "don't add refactors beyond what the task requires."
- **Verification method**: REVIEWED — NOT EXECUTED (both patterns are syntactically identical by inspection; `invitationValidation.ts`'s copy is unit-tested, see §D).

### B4. [INFORMATIONAL] `portal-admin-reply-feedback`'s `recipientUserId` is not verified to be a member of the collaboration
- **File**: `supabase/functions/portal-admin-reply-feedback/index.ts`.
- **Condition**: If a caller supplies `recipientUserId` explicitly (today's admin UI never does — it only relies on the single-member auto-default), that value is inserted into `collaboration_feedback.recipient_user_id` with only a foreign-key check against `auth.users(id)`, not a check that the user is an active member of the target collaboration.
- **Why LOW, not HIGH**: This fails *closed*, not open. The RLS policy requires the viewer to both be an active member of the collaboration AND match (or null) the recipient. A `recipientUserId` that isn't an active member of the collaboration makes the reply invisible to everyone — including the real intended member and the wrongly-named user — rather than exposing it to someone who shouldn't see it. The failure mode is "reply silently never seen," not "reply leaked."
- **Recommendation for a future stage**: add a membership check before accepting a client-supplied `recipientUserId`, since today's admin UI doesn't exercise this path at all (no code has been written to let an admin choose a specific recipient yet — it only happens through the single-member auto-default).
- **Verification method**: REVIEWED — NOT EXECUTED.

### B5. [INFORMATIONAL] `collaboration_assets` size/MIME-type limits are duplicated (frontend + `portal-admin-request-upload-url`)
- **Condition considered**: `AssetUploadForm.tsx` and the Edge Function each hold their own copy of the per-asset-type size caps and MIME-to-extension maps.
- **Why not a finding**: Already identified and drift-checked in Stage H via an executed Node script comparing both constant tables (14/14 assertions passed at the time). The frontend copy is advisory only — the Storage bucket's own `file_size_limit`/`allowed_mime_types` (set in `20261106140100_signal_portal_storage.sql`) and this Edge Function's checks are the two real enforcement points, and both are server-side.
- **Verification method**: REVIEWED (prior executed test from Stage H; not re-run in this stage since neither constant table changed).

---

## C. DB authorization & RLS (I1.2 / I1.3 / I1.4)

Every table has RLS enabled. The pattern throughout: `revoke all ... from anon, authenticated` immediately after `enable row level security`, then narrow `grant select` (never `insert`/`update`/`delete` to `authenticated` on any table — every write goes through a `service_role` Edge Function or a `SECURITY DEFINER` function with its own internal checks). This matches the project's pre-existing `moon_racer_votes` convention.

### RLS verification matrix

Legend: ✅ = row visible / operation succeeds · ❌ = row not visible / operation fails · N/A = no policy grants this operation to this role at all (only reachable via a function or service-role Edge Function).

| Table | Operation | anon | authenticated, no membership | authenticated, active member | authenticated, revoked member | authenticated, unrelated artist | portal admin |
|---|---|---|---|---|---|---|---|
| `artist_profiles` | select | ❌ | ❌ (not their own row) | ✅ (own row only) | ✅ (own row only) | ❌ (not their own row) | ✅ (all rows) |
| `collaborations` | select | ❌ | ❌ | ✅ (own collaboration only) | ❌ (status no longer 'active') | ❌ (not a member of it) | ✅ (all rows) |
| `collaboration_members` | select | ❌ | ❌ (no row exists) | ✅ (own row only, never roster) | ✅ (own row, now status='revoked') | ❌ (not their row) | ✅ (all rows) |
| `collaboration_assets` | select | ❌ | ❌ | ✅ only if `is_active AND upload_status='ready'` | ❌ (membership check fails) | ❌ | ✅ (all rows, any status) |
| `collaboration_feedback` | select | ❌ | ❌ | ✅ own authored rows + admin replies where `recipient_user_id IS NULL OR = self` | ❌ (membership check fails) | ❌ | ✅ (all rows) |
| `artist_invitations` | select/insert/update | ❌ | N/A | N/A | N/A | N/A | N/A (no RLS grant to `authenticated` at all — even an admin reads this only via `portal-admin-list-invitations`, a service-role function) |
| `portal_admins` | select | ❌ | N/A | N/A | N/A | N/A | N/A (checked only via `is_portal_admin()`, never selected directly) |
| `portal_admin_audit_log` | select | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (all rows) |
| `portal_access_request_log` | select | ❌ | N/A | N/A | N/A | N/A | N/A (no grant to anyone; service-role only) |
| storage objects (3 buckets) | any direct access | ❌ | ❌ | ❌ (no direct path exists — see §E) | ❌ | ❌ | ❌ (same — admin also goes through signed URLs) |

Every write operation on every one of these tables (insert/update/delete) is ❌ for every non-`service_role` role in every column of this matrix — there is no `grant insert`/`update`/`delete` to `authenticated` anywhere in any of the four migrations. This was confirmed by grep across all four schema-affecting migrations for `grant` statements; every one is `grant select`, `grant execute`, or absent.

**Execution status**: this matrix was built by reading the policy definitions and is believed correct by inspection and by tracing the exact boolean expression of each `using (...)` clause. **It has not been executed against live test identities in this stage** — no test Supabase project, no disposable test users, no applied migration exists yet in this engagement. Prepared (not executed) SQL to exercise this matrix is below.

### Prepared (not executed) RLS test script

For use only against a disposable/test Supabase project, never production, once Stage I2 is authorized:

```sql
-- Run as each of: service_role (setup), then via PostgREST/supabase-js
-- using real auth tokens for: an unauthenticated anon key, Artist A
-- (active member of Collab 1), Artist A again after being revoked
-- from Collab 1, Artist B (member of Collab 2 only), and a bootstrapped
-- admin account. Each block below is the shape of one assertion, not
-- a runnable fixture — collaboration/user ids must be substituted for
-- real disposable test rows.

-- 1. Cross-artist isolation: Artist B must get zero rows querying Collab 1.
select * from public.collaboration_assets where collaboration_id = '<collab-1-id>';
-- expected as Artist B: 0 rows (not 1 row with an authorization error — RLS
-- makes it look identical to "doesn't exist", which is correct per the
-- "not authorized" vs "doesn't exist" indistinguishability already
-- documented throughout the Edge Functions).

-- 2. Revoked member loses access to collaboration + assets, but can still
--    see their own (now-revoked) collaboration_members row.
select * from public.collaboration_members where user_id = auth.uid();
-- expected as revoked Artist A: 1 row, status = 'revoked'.
select * from public.collaborations where id = '<collab-1-id>';
-- expected as revoked Artist A: 0 rows.

-- 3. A non-ready asset is invisible even to its own active member.
-- (insert a collaboration_assets row with upload_status='pending' as
-- service_role, then query as the active member)
select * from public.collaboration_assets where id = '<pending-asset-id>';
-- expected as the active member of that collaboration: 0 rows.

-- 4. Feedback recipient scoping (requires a collaboration with 2 active
--    members, which does not exist in any environment today — this is
--    the first scenario that specifically needs one deliberately
--    created for testing).
-- insert one admin_reply row with recipient_user_id = Artist A's uid.
select * from public.collaboration_feedback where id = '<reply-id>';
-- expected as Artist A (the recipient): 1 row.
-- expected as Artist C (another active member, not the recipient): 0 rows.
```

---

## D. Automated test suite (I1.11)

All of the following are real, executed Node scripts under `portal-app/tests/security/`, run via a dependency-free harness (`runner.mjs`) that shells out to the already-available `esbuild` (a transitive dependency of Vite, not a new one) to transpile each pure-logic TypeScript module and dynamic-imports the result. No test framework (vitest/jest) was added. Every file below was executed in this session immediately before this document was written; the pass counts are from that run, not assumed.

| Test file | Subject | Result |
|---|---|---|
| `supabaseErrors.test.mjs` | `isBackendUnavailableError`/`messageLooksLikeBackendUnavailable` — never confusing a missing table/function with a real permission error | 11/11 passed |
| `coverEligibility.test.mjs` | `isCoverEligible` — UI-side mirror of the SQL function's cover-promotion eligibility rule | 12/12 passed |
| `portalAuthorization.test.mjs` | `classifyAuthorization` — the 6-state authorization decision (`authorized`/`revoked`/`not-authorized`/`backend-unavailable`/`error`), extracted from `PortalAuthContext.tsx` specifically to make it unit-testable | 10/10 passed |
| `portalHostActions.test.mjs` | `resolveQuickAction`/`resolveForCollaboration`/`matchFaq` — NYX ARDENT project-selection logic (never auto-picks among multiple projects, never fabricates data for a missing asset) | 8/8 passed |
| `invitationValidation.test.mjs` | `isValidInvitationEmail`/`normalizeInvitationEmail`/`resolveExpiryDays` — extracted from `portal-admin-create-invitation` | 17/17 passed |
| `uploadLifecycle.test.mjs` | `guardConfirmUpload`/`evaluateUploadVerification` — extracted from `portal-admin-confirm-upload`; covers every `upload_status` transition and the exact-size-match rule from finding A4 | 16/16 passed |
| `signedUrlRequest.test.mjs` | `resolveSignedUrlPath` — extracted from `portal-signed-url`; thumbnail-fallback-to-full-asset logic | 5/5 passed |

**Total: 79/79 assertions passed**, across 7 files, all executed via `node tests/security/<file>.test.mjs` in this session.

### What this suite deliberately does NOT cover, and why
- **The actual authorization decision inside `portal-signed-url` and `portal-submit-feedback`** is made by asking Postgres (RLS), as the real calling user — by design, so it can never drift from the real policy by being reimplemented in application code. There is no pure function to extract for this; it belongs to the RLS matrix in §C, which requires a live database and disposable test identities (not yet available in this stage).
- **Feedback visibility rules** are a pure RLS `using` clause (§A3), not application code — covered by the matrix in §C and the prepared SQL in §C, not a unit test.
- **`promote_primary_cover()`'s actual execution** (as opposed to the decision logic mirrored in `coverEligibility.ts` for the UI) requires a live Postgres function call and is not unit-testable in Node.

---

## E. Storage security (I1.5)

- All three buckets (`collaboration-audio`, `collaboration-proposals`, `collaboration-visuals`) are created with `public: false`.
- `storage.objects` has RLS enabled (Supabase default) and no migration here adds any policy granting `anon` or `authenticated` any operation on it — the absence of a policy is the control, confirmed by grep across `20261106140100_signal_portal_storage.sql` for any `create policy ... on storage.objects` (none exist).
- Every read goes through `portal-signed-url` (5-minute-TTL signed URL, minted only after the RLS-gated membership check in §C passes) or `portal-admin-confirm-upload`'s internal `storage.list()` existence check (service-role).
- Every write goes through `createSignedUploadUrl`, minted only by `portal-admin-request-upload-url` after `requireAdmin()` succeeds — there is no client-reachable path to upload directly.
- Bucket-level `file_size_limit`/`allowed_mime_types` are a second, independent enforcement layer behind the Edge Function's own size/MIME checks (§B5) — confirmed present in the migration for all three buckets.
- Thumbnail authorization (§A4/finding review): a thumbnail is signed by the exact same RLS-gated query as the full asset (`portal-signed-url` selects `thumbnail_storage_path` in the same query as `storage_path`) — there is no separate, weaker authorization path for thumbnails. Verified by reading `portal-signed-url/index.ts` directly; unit-tested indirectly via `signedUrlRequest.test.mjs` for the path-selection logic (5/5 passed).
- **Verification method for this entire section**: REVIEWED — NOT EXECUTED. No actual signed URL has been requested against a live bucket in this stage.

---

## F. Admin API security (I1.10)

- Every admin-write Edge Function (`portal-admin-confirm-upload`, `portal-admin-create-invitation`, `portal-admin-list-invitations`, `portal-admin-manage-collaboration`, `portal-admin-reply-feedback`, `portal-admin-request-upload-url`) calls `requireAdmin()` before doing anything else — confirmed by grep across all six files; each calls it as literally the first action after env-config validation.
- `requireAdmin()` (`_shared/requireAdmin.ts`) verifies the caller by asking Postgres as the real authenticated user (`auth.getUser()` + `rpc('is_portal_admin')`) — it never trusts a client-supplied claim of adminship.
- CORS (`_shared/cors.ts`) uses `Access-Control-Allow-Origin: '*'`. This is correctly NOT relied upon as an authorization boundary anywhere — every function's real check is `requireAdmin()`/the user's own JWT, which a permissive CORS header cannot bypass (CORS controls which *browsers* will expose a cross-origin response to script, not who can call the endpoint — a non-browser client ignores it entirely regardless of its value). Confirmed by inspection that no function branches on `Origin` for any authorization decision.
- Rate limiting exists on the two artist-facing, unauthenticated-reachable functions (`portal-request-access`, `portal-submit-feedback`) but not on admin-only functions — see §B2 for why this is documented as informational, not fixed.
- **Verification method**: REVIEWED — NOT EXECUTED (no live admin session exists to call these functions against).

---

## G. Auth error-state handling (I1.9)

`PortalAuthContext`'s `PortalAuthorization` type distinguishes six states rather than collapsing them: `checking`, `authorized`, `revoked`, `not-authorized`, `backend-unavailable`, `error`. The classification itself was extracted this stage into a pure function (`portalAuthorization.ts`, `classifyAuthorization`) specifically so it is unit-testable rather than only reviewable — see §D, 10/10 passed, covering:
- A missing-table/missing-function error on either underlying query → `backend-unavailable`, never confused with `not-authorized` (the Stage H-era bug this exists to prevent).
- Any other real query error → `error`, never silently treated as "zero rows found."
- Admin flag true → `authorized` regardless of membership rows.
- At least one `active` membership row → `authorized`; rows exist but none active → `revoked`; zero rows and not admin → `not-authorized`.
- `backend-unavailable` takes priority when both underlying queries fail that way, even if one of the two errors would otherwise classify as a generic `error`.

`isAdmin` state is only updated when the classification resolves to something other than `backend-unavailable`/`error` (preserved exactly from the pre-extraction inline logic — verified by comparing the extracted function's call site against the original inline branches before and after the refactor, and by the unchanged `npm run build`/`npx oxlint` results, both clean before and after).

**Verification method**: UNIT-TESTED — EXECUTED (the pure classification logic, 10/10). The React effect that calls it (session subscription, RPC sequencing) is NOT unit-tested — that would require mounting the component against a mocked Supabase client, which was judged out of scope for a dependency-free harness; its correctness was verified by code review only, consistent with the original Stage E/H reviews.

---

## H. Migration safety review (I1.12)

Migration under review: `supabase/migrations/20261106170000_signal_portal_security_hardening.sql`.

- **Additive only**: no existing migration file is modified or rewritten. This migration only drops-and-recreates one function (`promote_primary_cover`) and one policy (`"member select own thread"`), and adds one nullable column (`recipient_user_id`). No table is dropped, no column is dropped, no data is deleted.
- **Statement ordering**: confirmed valid by inspection — `drop function if exists public.promote_primary_cover(uuid)` (the old 1-arg signature) runs before `create function public.promote_primary_cover(uuid, uuid)` (the new 2-arg signature; a different signature is a different function as far as Postgres overload resolution is concerned, so the `drop function if exists` is for cleanliness, not strictly required to avoid a conflict — but prevents an orphaned unused 1-arg version persisting if anything still referenced it). The `revoke` statement for the new function follows its `create`. The `alter table ... add column` for `collaboration_feedback` runs before the `drop policy`/`create policy` pair that references the new column, so the column exists by the time the policy is (re)created.
- **Reversibility**: 
  - The function change is fully reversible by re-running the superseded migration's `create function public.promote_primary_cover(uuid) ...` body (its exact text is preserved in `20261106160000_signal_portal_upload_lifecycle.sql`, unmodified) after a `drop function ... (uuid, uuid)`. No data loss either direction, since the function holds no state.
  - The `recipient_user_id` column addition is reversible with `alter table ... drop column recipient_user_id` — but only safely BEFORE any row sets a non-null value; once an admin reply has been scoped to a specific recipient, dropping the column would discard that scoping decision (not catastrophic — the row reverts to "visible to the whole collaboration," a safe default, not an error state, but it IS a real information change, not a no-op).
  - The policy change is reversible by re-running the original policy text from `20261106140000_signal_portal_schema.sql` — but doing so while `recipient_user_id` has non-null values would silently widen visibility back to the whole collaboration for those rows (same caveat as above, inverted).
- **Data preservation**: no `update`/`delete` statements exist in this migration at all — every existing row in every affected table keeps its current values; `recipient_user_id` defaults to `NULL` for every row that predates the column, which is exactly the "visible to the whole collaboration" value, so no existing row's effective visibility changes the moment this migration is applied.
- **Deployment ordering dependency**: this migration must be applied AFTER `20261106160000_signal_portal_upload_lifecycle.sql` (which creates the 1-arg `promote_primary_cover` this one drops) and AFTER `20261106150000_signal_portal_artwork.sql` (which adds `approval_status`, referenced by the new function body). Supabase's migration system applies files in filename/timestamp order, and this file's timestamp (`20261106170000`) sorts after both — confirmed by filename comparison, not by actually running `supabase db push` in this stage.
- **Function compatibility with existing callers**: both Edge Function call sites (`portal-admin-confirm-upload`, `portal-admin-manage-collaboration`) were updated in the same stage to pass `acting_admin_id` — confirmed by grep that no remaining call site anywhere in `supabase/functions/` still calls `promote_primary_cover` with only one argument (which would fail at the database level with a "function does not exist" error for the old signature, correctly, rather than silently succeeding with the old unchecked behavior).
- **Failure-recovery scenario**: if this migration is applied but the Edge Function deployment that passes `acting_admin_id` is NOT deployed in the same window, every `promote_primary_cover` call from the stale Edge Function code would fail outright (wrong argument count) rather than silently running with the old, unchecked behavior — a fail-closed failure mode, not fail-open. This is exactly why the Integration Plan (§I1.13) specifies migration-then-function deployment ordering explicitly.

**Verification method**: REVIEWED — NOT EXECUTED. No `supabase db push`, `supabase db reset`, or any other migration-application command was run against any database, local or remote, in this stage.

---

## I. Cross-artist isolation (I1.4, consolidated)

Every member-facing table's RLS policy (`collaborations`, `collaboration_members`, `collaboration_assets`, `collaboration_feedback`) filters through an `exists (select 1 from collaboration_members cm where cm.collaboration_id = ... and cm.user_id = auth.uid() and cm.status = 'active')` clause, or (for `collaboration_members` itself) a direct `user_id = auth.uid()` filter. There is no policy anywhere that grants visibility based on anything other than the querying user's own `auth.uid()` — in particular, no policy grants access based on a client-supplied collaboration id, artist id, or email without independently re-deriving identity from the session. This was confirmed by reading every `using (...)` clause across all four migrations (§C matrix is the executable summary of this review).

The one path that could theoretically cross this boundary — a client-supplied id reaching a service-role query unchecked — was specifically reviewed in every Edge Function: every `collaborationId`/`assetId`/`userId` taken from a request body is either (a) used only after `requireAdmin()` succeeds (so the caller is a fully-trusted admin, for whom "can see everything" is the correct, intended behavior, not a leak), or (b) re-validated through a user-scoped (RLS-enforced) client rather than the admin client (`portal-signed-url`, `portal-submit-feedback`). No function was found that takes a client-supplied collaboration/asset id and uses it against the service-role client on behalf of a non-admin caller without an intervening RLS-scoped check.

**Verification method**: REVIEWED (code-level) — NOT EXECUTED (no live cross-artist attempt has been made against a real database with two distinct artist identities).

---

## J. Moon Racer regression protection (I1.14)

`git status --short` at the time of writing this document shows changes confined to `portal-app/`, `supabase/` (migrations, functions, this document, `ADMIN_BOOTSTRAP.md`), and four pre-existing modifications (`404.html`, `package-resume/index.html`, `package-resume/package-resume.css`, `package-resume/package-resume.js`) that were already present, uncommitted, at the start of this session — not touched during Stage I1. No file under `events-app/`, `network-app/`, `oracle-app/`, `signal-lost-app/`, `vote-app/`, `passport/`, or any shared Moon Racer asset path was created, modified, or deleted during this stage.

---

## Summary table

| Area | Findings | Fixed this stage | Deferred (documented, not actioned) |
|---|---|---|---|
| `promote_primary_cover()` authorization | 1 HIGH | 1 | 0 |
| `promote_primary_cover()` concurrency | 1 MEDIUM | 1 | 0 |
| Feedback recipient scoping | 1 HIGH | 1 | 0 |
| Upload size-match tolerance | 1 LOW | 1 | 0 |
| Admin rate limiting | 1 INFORMATIONAL | 0 | 1 |
| Duplicated email regex | 1 INFORMATIONAL | 0 | 1 |
| Unvalidated feedback recipient id | 1 INFORMATIONAL | 0 | 1 |
| Duplicated size/MIME tables | 1 INFORMATIONAL | 0 | 1 (pre-existing, drift-checked) |
| `service_role` grant convention | 1 INFORMATIONAL | 0 | 1 (confirmed safe, not a gap) |

No CRITICAL findings. No finding allows an unauthenticated or cross-artist read/write that RLS does not already block by construction.
