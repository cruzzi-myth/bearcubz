# Signal Portal — Stage I3 Production Readiness Audit & Controlled Launch Plan

Status: **read-only audit**. Nothing in this document has been applied,
deployed, committed, or pushed. No production operation of any kind
occurred while writing it. Every claim below is either a direct finding
from inspecting the actual repository/build output, or is explicitly
marked as relying on an earlier, user-confirmed fact (since this audit did
not link to or query the production Supabase project directly).

Severity key: **BLOCKER** (must be resolved before launch) · **REQUIRED**
(must happen during the deployment itself, not before) · **OPTIONAL**
(safe to defer).

---

## A. Current repository and application status

Everything built across Stages A–I2H is local-only and functioning: Supabase
Auth-based invitation authentication, artist↔collaboration membership, admin
authorization, private Storage with signed URLs, recipient-scoped feedback,
NYX Ardent, and the Administrator Command Center. 86+ unit assertions, 46
browser/accessibility assertions, and the full live integration suite have
all been re-confirmed passing against the isolated `signal-portal-dev`
project across Stages I1–I2H. The approved entrance and Admin Command Center
designs are unchanged since their respective approvals. `git status` shows
the entire `portal-app/` and `supabase/` Signal Portal work as **untracked**
— none of it has ever been committed, matching every prior stage's report.

**New finding this stage** (not previously reported, found by actually
running the production build and inspecting its output — see B):
`portal-app/.env.local`, created in Stage I2C to point local development at
the isolated `signal-portal-dev` project, is picked up by Vite for **any**
build mode, including `production`, and currently causes a production-mode
build to embed the **development** project's credentials instead of the
real production ones. Classified **BLOCKER** below.

## B. Production database compatibility assessment

Cross-checked every object name the 5 Signal Portal migrations create
against the 2 Moon Racer migrations present in this repo (`moon_racer_votes`
table + index; `moon_racer_vote_results()` is referenced, revoked from
anon/authenticated). **Zero naming collisions** — every Signal Portal table
(`artist_profiles`, `collaborations`, `collaboration_members`,
`collaboration_assets`, `collaboration_feedback`, `artist_invitations`,
`portal_admins`, `portal_admin_audit_log`, `portal_access_request_log`),
function (`is_portal_admin`, `accept_artist_invitation`,
`promote_primary_cover`), and storage bucket (`collaboration-audio`,
`collaboration-proposals`, `collaboration-visuals`) uses a name distinct
from anything in this repo's migration history.

**Caveat (REQUIRED to verify, not a known conflict)**: comments inside the
existing Moon Racer migration reference `claim_passport` and
`initialize_player_profile` as already-existing production functions that
were **never** created through a migration file in this repo — meaning
production's real schema is not fully represented by what's in
`supabase/migrations/`. The naming-collision check above is therefore
necessarily based on an incomplete picture. Before applying anything,
whoever has production access should run a read-only check (e.g.
`select table_name from information_schema.tables where table_schema =
'public'` and the equivalent for `routines`) to confirm none of the 9 new
names above already exist. This audit could not do this itself without
linking the CLI to production, which was explicitly not authorized.

The `public` schema's grant pattern used throughout (`revoke all from
anon, authenticated` immediately after `enable row level security`, narrow
`grant select` only where intended) exactly mirrors the existing
`moon_racer_votes`/`moon_racer_vote_results()` convention already live in
production — confirmed by direct comparison, not assumed.

## C. Migration and Edge Function deployment plan

**Migrations — apply in this exact order** (filename-timestamp order,
confirmed dependency-safe in Stage I1's migration-safety review and
re-confirmed by re-reading all 5 files for this audit):

| # | File | Creates |
|---|---|---|
| 1 | `20261106140000_signal_portal_schema.sql` | 9 tables, `is_portal_admin()`, `accept_artist_invitation()` |
| 2 | `20261106140100_signal_portal_storage.sql` | 3 private Storage buckets |
| 3 | `20261106150000_signal_portal_artwork.sql` | artwork columns, expanded `asset_type` check, partial unique index |
| 4 | `20261106160000_signal_portal_upload_lifecycle.sql` | `upload_status`, original `promote_primary_cover(uuid)` |
| 5 | `20261106170000_signal_portal_security_hardening.sql` | hardened `promote_primary_cover(uuid,uuid)`, `collaboration_feedback.recipient_user_id` |

Using `supabase db push` against production applies all 5 not-yet-applied
migrations in this same order automatically — no manual file-by-file
application needed, provided the Moon Racer migrations are **not**
accidentally re-run (they already show as applied in production's own
migration-history table, so `db push` would skip them on its own; Stage
I2B's workaround of physically moving them aside was only needed because
the *dev* project had never seen them at all).

**RLS and authorization dependencies**: every member-facing table's RLS
policy depends on `collaboration_members` existing first (migration 1
creates both in the right order internally). `is_portal_admin()` must exist
before the "admin select all" policies are added (same migration, correct
internal order — already verified). No migration depends on anything from
the artwork/upload-lifecycle migrations out of order.

**Storage buckets required**: `collaboration-audio` (100MB limit,
audio/mp4|x-m4a|mpeg|wav|x-wav), `collaboration-proposals` (25MB,
application/pdf), `collaboration-visuals` (15MB, image/jpeg|png|webp) — all
created `public: false`.

**Edge Function deployment order**: no ordering dependency between the 9
functions themselves. The only real constraint: deploy **after** migration
5, since `portal-admin-confirm-upload` and
`portal-admin-manage-collaboration` both call the 2-argument
`promote_primary_cover`, which doesn't exist until that migration runs
(confirmed fail-closed in Stage I1: calling the old 1-arg signature after
only the 2-arg version exists raises a clean "function does not exist"
error, never a silent wrong-behavior).

The 9 functions: `portal-request-access`, `portal-signed-url`,
`portal-submit-feedback`, `portal-admin-create-invitation`,
`portal-admin-manage-collaboration`, `portal-admin-request-upload-url`,
`portal-admin-confirm-upload`, `portal-admin-list-invitations`,
`portal-admin-reply-feedback`. `moon-racer-vote` must **not** be included
in any deploy command's argument list (Stage I2B's established safeguard —
deploy by explicit name, never a bare `functions deploy`).

**Required secrets/environment variables, by name only**:
- `PORTAL_REDIRECT_URL` — the one Signal-Portal-specific secret. Its
  hardcoded fallback (`https://bearcubz.com/portal/`) is already the
  correct production value, but setting it explicitly is still **REQUIRED**
  rather than relying on the fallback for a production deployment.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` — these
  are auto-injected by the Supabase platform into every Edge Function in
  every project; nothing to configure manually.

**Rollback and recovery**: migrations 1–4 have no corrective migration
needed (nothing to roll back from, since this is a first application).
Migration 5's own reversibility was already documented in Stage I1's
audit (§H) — re-confirmed accurate on re-read: the function change is
cleanly revertible to the original 1-arg signature by re-running migration
4's function body; the `recipient_user_id` column drop is safe only before
any row sets a non-null value. Edge Function rollback is a platform-level
redeploy of the previous version — no custom tooling needed.

**Effects on existing Moon Racer functionality**: none identified. No
Moon Racer table, function, policy, or Edge Function is read, written, or
referenced by any Signal Portal migration or function. The only shared
surface is the Supabase project itself and its platform-level defaults
(confirmed safe in Stage I1 by direct comparison with
`moon_racer_vote_results()`'s own grant pattern).

## D. Hosting and routing requirements

- **Vite base path**: `base: '/portal/'` in production mode, confirmed by
  directly inspecting a fresh production build's `index.html` — asset URLs
  correctly resolve to `/portal/assets/...`.
- **SPA route fallback**: already fully implemented and present on disk —
  `404.html` (repo root) redirects any `/portal/...` deep link to
  `/portal/?p=<path>`, and `portal-app/index.html` restores the real path
  via `history.replaceState` before React Router mounts. This is the exact
  same, already-proven mechanism the Universe app uses. **Not yet
  committed** (`git diff 404.html` shows it as a local, uncommitted
  addition) — committing it is part of Phase 2 of the launch sequence, not
  before.
- **Static asset paths**: confirmed correct in the build output; all 7
  original chamber/dashboard images plus the new wide-entrance asset and
  the NYX character art land at their expected `/portal/assets/...` paths.
- **HTTPS**: inherited for free from the existing `bearcubz.com` GitHub
  Pages + custom-domain setup; nothing Signal-Portal-specific to configure.
- **Authentication redirects**: per your explicit correction in Stage I1,
  the production Auth redirect allow-list already contains all three
  required URLs (`https://bearcubz.com/passport/`,
  `https://bearcubz.com/universe/login`, `https://bearcubz.com/portal/`).
  This audit did not re-verify this via the CLI (no production link was
  made); **REQUIRED**: a final visual re-check of the live dashboard
  setting immediately before Phase 2, since it's a manually-edited setting
  that could in principle have changed since Stage I1.
- **Cache behavior**: GitHub Pages' default caching applies uniformly
  across the whole site; Signal Portal introduces nothing that needs
  different cache headers than any other app here.
- **Security headers**: GitHub Pages does not support custom HTTP response
  headers (no CSP, no `X-Frame-Options`, etc. configurable at the hosting
  layer) — a pre-existing platform constraint that already applies to
  Passport, Universe, and every other app on this domain. Signal Portal's
  real security boundary is Postgres RLS and signed URLs, not HTTP headers,
  so this is **OPTIONAL/informational**, not a blocker.
- **Compatibility with the existing site**: `robots: noindex` is already
  set on the portal's `index.html`; the entrance links back to
  `/package-resume/`, an existing live page. No shared asset path collides
  with any other app's `/assets/` folder (confirmed by the `portalAsset()`
  base-aware helper fixed back in the original domain-migration work).

**BLOCKER — found and proven this stage, not merely suspected**: ran
`npm run build` in this exact checkout and inspected the resulting JS
bundle directly. It embeds the **development** project ref
(`gcbonlvbgyhsgfayvlvz`), not production's. Root cause: Vite loads
`.env.local` for every mode, including `production`, and that file (created
in Stage I2C for local dev work against the isolated project) takes
precedence over `supabaseClient.ts`'s hardcoded fallback — which is itself
already the correct, real production URL and anon key (confirmed: the
fallback anon key is the same public key already live in
`network-app`/`passport.js`). **Required fix before the real deployment
build**: either delete/rename `.env.local` on whatever machine runs the
production build, or add a `.env.production.local` with the real
production `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (Vite's
documented precedence: `.env.production.local` > `.env.local` for a
production-mode build, so this cleanly overrides it without deleting
anything). The `portal/` directory currently sitting in this repo (from
this audit's own test build) **must not be the one deployed** — it was
built with the wrong credentials and would point the live site at the dev
database.

**REQUIRED cleanup, found incidentally**: `portal-entrance-wide.png` (the
3.1MB retained PNG source, kept deliberately per Stage I2E's "retain the
original as a source asset" instruction) lives inside `portal-app/public/`,
which Vite copies verbatim into every build. It is currently shipping into
`portal/assets/signal-portal/portal-entrance-wide.png` for no functional
reason — nothing in the app ever requests that file; only the `.webp`
conversion is used. Before the real deployment build, move the PNG source
outside `public/` (e.g. into `portal-app/docs/` or a new
`portal-app/design-source/` folder) so it stops being served.

## E. Authentication and administrator bootstrap plan

The bootstrap procedure is already fully documented in
`supabase/ADMIN_BOOTSTRAP.md` and was re-read for this audit — it remains
accurate: sign in once as the real owner, find the resulting `auth.users.id`
(Dashboard or a one-line `select`), then a single manual
`insert into portal_admins (user_id, granted_by) values ('<uuid>', null)`
run directly in the SQL editor — never through application code, never
committed with a real value. **Not yet run against any environment,**
confirmed by that document's own "Not done" section.

**Invitation lifecycle** (already built, re-confirmed working across
Stages I1–I2H's test suites): an admin creates an invitation
(`portal-admin-create-invitation`, email + optional collaboration,
1–90-day expiry, defaults to 14), the artist receives a Supabase magic-link
email (via `portal-request-access`'s `signInWithOtp`), accepting it runs
`accept_artist_invitation()` which atomically creates their
`artist_profiles` row and (if a collaboration was named) an active
`collaboration_members` row. Revocation
(`portal-admin-manage-collaboration`'s `revoke_invitation` op) and the full
audit trail (`portal_admin_audit_log`, every admin action) are both already
built and were exercised live in Stage I2B's integration suite.

**No invitation may be sent, and none was, during this stage.** Paige
Duddy/XYLØ and Issey Cross remain proposed, unconfirmed collaborators —
nothing in this repo or this audit treats them as portal users; the only
places their names appear are in this report's own asset-checklist section
(G) as placeholders for a future, separately-authorized step.

## F. Security and privacy assessment

No new security finding beyond what Stages I1/I2B already documented and
fixed (`SIGNAL_PORTAL_SECURITY_AUDIT.md` — re-read for this audit, still
accurate: the 2 HIGH findings from that pass were fixed and live-verified
in the dev project; the INFORMATIONAL items remain deliberately unactioned
for documented reasons). This audit's own new findings (B's naming-conflict
caveat, D's `.env.local` leak and PNG-bloat) are **deployment-process**
risks, not RLS/authorization defects — nothing about the actual
authorization model changed or needs to change.

## G. Collaboration asset preparation checklist

For **each** of the two proposed collaborations (Paige Duddy/XYLØ, Issey
Cross), once a real `collaborations` row exists and the real artist has
accepted a real invitation:

- [ ] Private demo audio — via Asset Library → Upload (admin-only), asset
      type `audio_short`/`audio_full`, through the real
      request-upload-url → PUT → confirm-upload flow (never a direct
      Storage write).
- [ ] Artist-specific proposal PDF — asset type `proposal_pdf`.
- [ ] Track cover artwork — asset type `track_cover`, promoted to primary
      cover via the admin's "Set Primary" action once ready.
- [ ] Visual concept artwork — asset type `visual_concept`/`alternate_cover`
      as applicable.
- [ ] Confirm, logged in as that specific artist's real account, that only
      their own collaboration's assets are visible — never the other
      collaboration's, verified the same way Stage I2B/I2C's cross-artist
      isolation tests already proved for synthetic data.

**Not done during this stage**: no real audio, artwork, or proposal content
was uploaded or even prepared as a file. This section is a checklist for a
later, separately-authorized phase (Phase 4 below), not a record of work
performed now.

## H. Production smoke-test plan

Distinguishing genuinely zero-footprint checks from ones that necessarily
write at least a disposable row, since "do not execute tests that modify
data" is stricter than Stage I2B's dev-environment approach (which created
and tore down synthetic fixtures):

**Safe with zero data modification** (page loads and rejection paths only):
- Entrance renders at `https://bearcubz.com/portal/` over HTTPS.
- Signed-out visitor sees the entrance, not dashboard/admin data.
- `/portal/dashboard` and `/portal/admin` both show the access-required
  empty state, not real data, with no session.
- Calling any `portal-admin-*` function with no/invalid Authorization
  header returns 401/403 — confirms `requireAdmin()` is live in production
  without ever reaching real data.
- Mobile responsiveness of the signed-out entrance (no session needed).

**Requires at least one disposable account** (a real but synthetic
`+test`-style address, explicitly authorized separately from the checks
above, with its own cleanup immediately after):
- Authenticated artist access, private audio playback, PDF viewing,
  artwork viewing, feedback submission — every one of these needs a real
  signed-in session with real membership, which is itself a write.
- Administrator access — needs the real bootstrap (E) to have already run.
- Invitation revocation — needs a real invitation to exist first.

**Recommendation**: run the zero-footprint checks immediately after Phase 2
(website deployment) as a blocking gate before Phase 3. Run the
account-requiring checks only as part of Phase 3 itself (Administrator
verification), using one disposable artist account created and removed
specifically for that purpose, under its own explicit authorization — not
folded into "testing" as if it were free of effect.

## I. Rollback and recovery plan

- **Migrations**: none applied yet; nothing to roll back. Migration 5's
  specific reversibility is detailed in C above.
- **Edge Functions**: platform-level redeploy of the prior version; no
  custom tooling required.
- **Website**: GitHub Pages serves whatever is currently committed at the
  repo root — reverting is a normal `git revert`/force-checkout of the
  previous commit for `portal/`, `404.html`, and `CNAME` if ever needed,
  same as any other page on this site.
- **Admin bootstrap**: reversible by deleting or setting `revoked_at` on
  the single `portal_admins` row.
- **Invitations/assets**: both have working revoke/mark-inactive paths
  already built and tested; nothing bespoke needed for rollback.

## J. Launch blockers and outstanding decisions

**BLOCKER**
1. `.env.local` currently causes a production-mode build to embed
   development credentials (D). Must be resolved (remove the file for the
   real build, or add a correct `.env.production.local`) before Phase 2.
2. Production schema may contain objects outside this repo's migration
   history (B) — the naming-collision check this audit performed is
   necessarily incomplete without a direct, read-only look at the real
   production schema.

**REQUIRED**
3. Move `portal-entrance-wide.png` out of `public/` before the real build.
4. Re-confirm the production Auth redirect allow-list immediately before
   Phase 2 (settings can drift since Stage I1's confirmation).
5. Set `PORTAL_REDIRECT_URL` explicitly in production secrets rather than
   relying on the (correct, but implicit) fallback.
6. Commit `404.html` and `portal-app/index.html`'s SPA-fallback pair before
   Phase 2 — currently uncommitted local changes.

**OPTIONAL**
7. `portal-admin-manage-admins` (self-service second-admin) was never
   built — the documented manual-SQL path works for a single additional
   admin if ever needed.
8. The 2560×1080/3440×1440 entrance side-bars — already accepted by you as
   a deferred enhancement, not a blocker.
9. JS bundle size (~556KB) triggers Vite's size-warning but doesn't block
   anything; code-splitting would be a pure performance nicety.

## K. Recommended deployment sequence

Matches the 5-phase structure you specified, with this audit's blockers
folded in as pre-conditions for the phase where they'd otherwise bite:

- **Before Phase 1**: resolve BLOCKER #2 (read-only production schema
  check for name collisions).
- **Phase 1 — Production infrastructure**: apply the 5 migrations in
  order; deploy the 9 named functions (never a bare `functions deploy`);
  set `PORTAL_REDIRECT_URL` (REQUIRED #5) and verify the redirect allow-list
  (REQUIRED #4).
- **Before Phase 2**: resolve BLOCKER #1 (env file), REQUIRED #3 (PNG), and
  REQUIRED #6 (commit the SPA-fallback pair); run a fresh production build
  from a clean checkout and re-verify (as this audit did) that the bundle
  embeds the production ref, not dev's, before it's ever pushed.
- **Phase 2 — Website deployment**: publish; immediately run every
  zero-footprint smoke test from H.
- **Phase 3 — Administrator verification**: run the real bootstrap (E);
  run the account-requiring smoke tests from H using one disposable
  account, removed immediately after.
- **Phase 4 — Private collaboration materials**: work through the
  checklist in G for each confirmed collaboration, verifying per-artist
  isolation after each upload.
- **Phase 5 — Controlled invitations**: invite each approved artist
  individually, only after every preceding phase's checks have passed.

Each phase above still requires your own explicit go-ahead, separately,
per your Phase-checkpoint requirement — nothing in this plan treats any
phase as self-authorizing the next.
