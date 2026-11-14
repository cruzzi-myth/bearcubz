# Signal Portal — Stage I3C Deployment Preflight Report

Status: read-only inspection and documentation only. No production write,
migration, deployment, or account creation occurred. One new read-only
query type (`backups list`) was added to `with-readonly-prod-guard.sh`
under the same two-gate pattern as every prior entry, tested against
refusal cases first (wrong ref, no confirmation flag, the destructive
`backups restore` subcommand), then used for the real query below.

## A/B. Verified backup status and PITR availability

Queried directly via Supabase's own Management API
(`supabase backups list --remote=drsidtagxezznqviupsr`), not inferred:

```json
{
  "region": "us-west-1",
  "walg_enabled": true,
  "pitr_enabled": false,
  "backups": [],
  "physical_backup_data": {}
}
```

**This is a real, serious finding, not a formality.**

- **PITR is explicitly disabled** (`pitr_enabled: false`). Per your own
  instruction not to assume otherwise — confirmed, it genuinely is off.
- **`walg_enabled: true`** means the underlying physical-backup
  infrastructure (WAL-G) is available at the platform level, but...
- **`backups: []`** — **zero backups currently exist for this project**,
  of any kind, as of this inspection. The project was created
  2026-08-20 (per Stage I3's `projects list` output) — nearly 3 months
  ago — so this is not "too new to have one yet"; it indicates backups
  are not actually being taken on this project's current configuration.

**Most recent successful backup**: none — there isn't one.

**Backup retention**: not applicable — nothing is retained.

**Restoration methods available right now**: none, based on this
inspection. `supabase backups restore` exists as a CLI command but
operates on PITR timestamps or listed physical backups — with
`pitr_enabled: false` and `backups: []`, there is currently nothing for
it to restore *to*.

**Does recovery require a new project?** Not determinable from this
read-only query alone — depends on which recovery path (if any) becomes
available once backups are actually enabled. Flagging as unknown rather
than guessing.

**Effects on Auth/Storage/Edge Functions during any future restore**: not
assessed — moot until a real backup exists to restore from, and restoring
physical/PITR backups is a database-layer operation; Auth users, Storage
objects, and Edge Function deployments are managed somewhat independently
at the platform level, but the exact interaction wasn't testable
read-only and isn't assumed here either way.

**Exact Dashboard settings requiring manual confirmation** (since the CLI
query above is already authoritative for current state, but *enabling*
backups/PITR is a write action outside this stage's read-only scope):
Project Settings → Database → Backups (or the project's Add-ons /
Infra page, naming varies by Supabase dashboard version) — this is where
PITR and scheduled backups are enabled, and it is almost certainly gated
by the project's billing plan tier, which this inspection had no
read-only way to check.

## C. Recovery limitations

**As of right now, production has no usable recovery path if something
goes wrong with the database.** This is true independent of Signal
Portal — it's the existing state of `moon-racer-passport` today, found
during this stage's inspection, not introduced by anything in this
project. It does, however, directly affect how much caution Checkpoint A
below needs.

## D. Deployment prerequisites — re-verified, not re-discovered

Everything from Stage I3B's deployment approval package was re-checked
for continued validity (no production state has changed since; the
dev-environment code hasn't changed either):

- 5 migration files: present, reviewed, unchanged.
- 9 Edge Functions: present, reviewed, unchanged.
- Schema compatibility findings (Stage I3B §A): still valid — nothing in
  production's schema changed between that inspection and this one.
- Environment validation (`vite.config.ts` + `viteEnvValidation.ts`,
  Stage I3A): active; re-ran the full regression suite this stage —
  all 11 security test files, 140 assertions total, 0 failures.
- Fresh production build (`npm run build`, this stage, not reused from
  an earlier stage): succeeds cleanly, `tsc -b` clean.
- Release-bundle validation (`validate-release-bundle.mjs`, this stage,
  against that fresh build): 5/5 pass — production ref present, dev ref
  absent, no `service_role`-scoped token embedded, `/portal/` base path
  correct.
- Auth redirects: confirmed correct in Stage I3B via direct `config diff`
  inspection; not re-queried this stage since nothing suggests drift in
  the few hours since, but worth a final glance immediately before
  Checkpoint C regardless (settings are dashboard-editable).
- SPA routing: `404.html` + `portal-app/index.html` pair present,
  correct, still uncommitted (as designed — committing is part of the
  runbook below, not before).
- Administrator bootstrap: documented, unchanged, not run.
- Production secrets identified: `PORTAL_REDIRECT_URL` (value known,
  not yet set); `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/
  `SUPABASE_ANON_KEY` auto-injected, nothing to configure.

**New prerequisite, added by this stage**: backup/PITR status must be
resolved (enabled, or explicitly accepted as a known risk) before
Checkpoint A — see the stop/go criteria below.

## E. Deployment runbook — 6 checkpoints

### Checkpoint A — Database

**Prerequisites**: all of D above; backup/PITR question explicitly
resolved one way or the other (see stop/go); a real, read-only schema
re-check immediately before applying (`supabase migration list
--remote=drsidtagxezznqviupsr`) to confirm nothing changed in production
since Stage I3B.

**Exact intended changes**: apply the 5 migrations listed in Stage I3B §B,
in order, via `supabase db push --remote=drsidtagxezznqviupsr`.

**Verification**: re-run the same read-only queries from Stage I3B §A
(table list, function list, RLS policies) and confirm the 9 new Signal
Portal tables, 3 new functions, and their policies now exist, with
nothing unexpected alongside them. Re-run `migration list` and confirm
all 5 now show matching `local`/`remote` timestamps.

**Failure conditions**: `db push` reports an error on any of the 5
migrations; a verification query shows an unexpected object; any
pre-existing Moon Racer table/function/policy is missing or altered from
Stage I3B's recorded baseline.

**Recovery steps**: given C above, recovery is limited. Signal Portal's
own migrations are purely additive (confirmed across every prior audit),
so the most likely failure mode is a partially-applied migration 5 (the
most complex one) — in that case, the documented reversal (Stage I1 §H,
Stage I3 §C) re-creates the prior function/policy state manually. If
anything appears to have affected a *Moon Racer* object specifically,
stop immediately and do not proceed to Checkpoint B until that's
understood, since there is currently no backup to fall back on.

**Stop/go criteria**: **do not proceed past this checkpoint until the
backup/PITR gap from A/B is either resolved (PITR or a current backup
exists) or explicitly, knowingly accepted by you as an acceptable risk
for this specific deployment** — this is the single most important
gate in this entire runbook.

### Checkpoint B — Backend

**Prerequisites**: Checkpoint A verified complete and correct.

**Exact intended changes**: `supabase secrets set
PORTAL_REDIRECT_URL=https://bearcubz.com/portal/
--remote=drsidtagxezznqviupsr`; deploy the 9 named functions (never a
bare `functions deploy`).

**Verification**: `supabase functions list --remote=drsidtagxezznqviupsr`
shows all 9 as `ACTIVE`; a signed-out `curl`/fetch to
`portal-admin-manage-collaboration` with no auth header returns 403; one
authenticated-but-non-admin-shaped request (if any real session is
available) also returns 403.

**Failure conditions**: any function fails to deploy; the secret isn't
set correctly; `moon-racer-vote` appears modified in the function list.

**Recovery steps**: redeploy the specific failed function; Edge Function
rollback is a platform-level redeploy of prior code — no custom tooling
needed, and functions are independent of each other and of the database
backup question.

**Stop/go criteria**: do not proceed to Checkpoint C if any function
fails its own basic auth-rejection check.

### Checkpoint C — Frontend

**Prerequisites**: Checkpoints A and B verified; a **fresh** production
build run and validated (`npm run build && npm run validate-release`)
from a clean checkout, immediately before this checkpoint — not reusing
any build artifact from a prior stage; `404.html` and
`portal-app/index.html`'s SPA-fallback pair committed.

**Exact intended changes**: commit and push `portal/` (the build output),
`404.html`, `portal-app/index.html`, and any other now-ready Signal
Portal source files; this is the first commit/push in the entire
engagement.

**Verification**: `https://bearcubz.com/portal/` loads the entrance;
`https://bearcubz.com/portal/dashboard` (direct deep link, hard refresh)
correctly round-trips through the SPA fallback; `/passport/`, `/universe/`,
and every other existing route still work unchanged.

**Failure conditions**: the entrance doesn't load; a deep link 404s for
real instead of resolving; any existing route breaks.

**Recovery steps**: `git revert` the publishing commit; GitHub Pages
redeploys the prior state automatically once pushed.

**Stop/go criteria**: do not proceed to Checkpoint D until every existing
Moon Racer route has been manually re-checked working, not assumed.

### Checkpoint D — Administrator

**Prerequisites**: Checkpoint C live and verified.

**Exact intended changes**: the real site owner signs in once through the
live production entrance; their `auth.users.id` is found; the one manual
`insert into portal_admins` is run directly in the SQL editor (Stage I1's
documented procedure).

**Verification**: that session's `is_portal_admin()` RPC returns `true`;
`/portal/admin` loads the real Command Center for that session and
rejects it for any other.

**Failure conditions**: the insert fails (e.g. a constraint issue);
`is_portal_admin()` doesn't return true.

**Recovery steps**: delete the bad row and retry; this table has no
dependent data yet at this point in the sequence, so this is fully
reversible.

**Stop/go criteria**: do not proceed to Checkpoint E until real
administrator access is confirmed working end-to-end, not just the
database row existing.

### Checkpoint E — Collaboration assets

**Prerequisites**: Checkpoint D complete; the specific collaboration(s)
and artist(s) for this upload explicitly identified and approved by you,
separately from this runbook's general authorization.

**Exact intended changes**: per Stage I3's asset checklist (§G) — create
the real `collaborations` row, upload real demo audio/proposal/artwork
through the real admin upload flow for that one collaboration.

**Verification**: logged in as that specific real artist (once invited —
see Checkpoint F), confirm only their own assets are visible; logged in
as the admin, confirm the asset library shows the upload correctly.

**Failure conditions**: an asset fails verification (Stage I1's
upload-lifecycle check); wrong artist/collaboration association.

**Recovery steps**: `mark_asset_inactive`/revoke paths already built and
tested; nothing here is destructive to Moon Racer in any way.

**Stop/go criteria**: do not upload for a second collaboration until the
first is fully verified correct, including the cross-artist isolation
check.

### Checkpoint F — Artist invitations

**Prerequisites**: Checkpoint E complete and verified for that specific
collaboration.

**Exact intended changes**: one real invitation sent to one real,
approved artist's real email.

**Verification**: the artist actually receives and can act on the
invitation; after acceptance, their session shows exactly their own
collaboration, nothing else.

**Failure conditions**: invitation doesn't arrive; wrong collaboration
scoping.

**Recovery steps**: `revoke_invitation` (already built, tested); never
affects any other artist or Moon Racer.

**Stop/go criteria**: invite one artist at a time, verify fully, before
the next — never a batch, per your own standing instruction.

## F. Rollback and recovery procedures (consolidated)

- **Database**: given C above, **do not assume migrations can be rolled
  back by reversing SQL** — that's true in general, and *especially*
  true here given there's currently no backup to fall back on if a
  manual reversal itself goes wrong. The specific, tested reversal
  procedures for migration 5 (the only non-trivial one) remain the best
  available option, documented in Stage I1 §H / Stage I3 §C.
- **Edge Functions**: platform-level redeploy of prior code; fully
  independent of the database question.
- **Frontend**: `git revert`; GitHub Pages redeploys automatically.
- **Authentication**: no Signal-Portal-specific Auth setting is changed
  by any checkpoint above (the redirect URL was already correct,
  confirmed, not touched) — Moon Racer Passport's and Universe's own
  Auth behavior is never touched by anything in this runbook.
- **Private assets**: Storage objects are per-bucket; a bad Signal Portal
  upload has no path to affect the existing `avatar-images` bucket, and
  vice versa — confirmed by the Stage I3B storage-policy inspection.
- **Moon Racer continuity**: every checkpoint above that touches the
  database re-verifies Moon Racer's existing tables/functions/policies
  are unchanged before proceeding — not assumed, re-checked.

## G. Remaining blockers

1. **BLOCKER (new, this stage)**: production has no active PITR and zero
   existing backups. Recommend resolving this — enabling backups/PITR via
   the Dashboard (likely plan-tier-gated) — before Checkpoint A, or an
   explicit, informed decision from you to proceed without it.
2. Carried from Stage I3B: confirm the exact production plan tier (not
   determinable read-only) to know what backup options are even
   available.
3. Everything else from Stage I3/I3A/I3B remains resolved and
   re-confirmed valid this stage.

## H. Final authorization checklist

1. Resolve or explicitly accept the backup/PITR gap (G.1) — **before**
   anything else below.
2. Authorize Checkpoint A, separately.
3. Authorize Checkpoint B, separately, after A is verified.
4. Authorize Checkpoint C (the first-ever commit/push in this
   engagement), separately, after B is verified.
5. Authorize Checkpoint D, separately, after C is live.
6. Authorize Checkpoint E, per collaboration, after D is verified.
7. Authorize Checkpoint F, per artist, after each corresponding E.

No checkpoint authorizes the next. Production remains untouched as of
this report — confirmed via `supabase projects list` (production ref
shows `linked: false`; only the dev project, `signal-portal-dev`, is
linked, which is expected and unrelated) immediately before closing out
this stage, and no command outside the read-only guard's allowlist was
ever run against it.
