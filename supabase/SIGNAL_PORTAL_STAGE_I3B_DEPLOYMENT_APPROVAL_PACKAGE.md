# Signal Portal — Stage I3B Deployment Approval Package

Status: read-only analysis and read-only production inspection. No
migration, deployment, commit, push, or production write occurred while
producing this document. This supersedes nothing in Stage I3/I3A — it
closes the specific gaps those audits flagged as unresolved.

## How the remaining schema gaps were closed

Stage I3A could list production's tables, storage buckets, and Auth
config, but had no way to see function signatures, RLS policies,
triggers, or foreign keys — `db dump` needs Docker (unavailable) and no
psql is installed. This stage found the real read-only tool: `supabase db
query --read-only --file=<path>`, which wraps the statement in a
**Postgres-enforced read-only transaction** — the database itself refuses
a write inside it, not just the CLI.

Because `db query` can run arbitrary SQL in general, it was added to
`supabase/scripts/with-readonly-prod-guard.sh` under its own, narrower
sub-guard, required in addition to the existing ref/confirmation checks:
`--read-only` must be present, the SQL must come from a reviewable
`--file=`, must be a single statement starting with `SELECT`/`WITH`, and
must contain none of a list of write-shaped keywords. Found and fixed two
real bugs in this new guard logic before it was ever used for a real
query (checked the exploit case, re-tested all prior cases, and verified
word-boundary matching didn't false-positive on legitimate column names
like `created_at`) — see the script's own comments for detail.

Every query below was run once, individually, through this guard, with
`--remote=drsidtagxezznqviupsr` and the two independent confirmation
flags. No `supabase link` was ever run against production.

---

## A. Production schema compatibility report

**Functions (public schema, complete list — 12 total):**

| Function | Security definer | Language |
|---|---|---|
| `claim_passport(p_email, p_racer_name)` | yes | plpgsql |
| `complete_initial_avatar()` | yes | plpgsql |
| `confirm_avatar_species(...)` | yes | plpgsql |
| `get_my_player_state()` | no | sql |
| `initialize_player_profile(p_username, p_display_name, p_avatar_base_model)` | yes | plpgsql |
| `is_hybrid_pair_allowed(p_a, p_b)` | no | sql |
| `level_for_xp(p_xp)` | no | sql |
| `link_my_passport()` | yes | plpgsql |
| `moon_racer_vote_results()` | yes | sql |
| `player_avatar_prevent_identity_mutation()` | no | plpgsql |
| `rank_for_level(p_level)` | no | sql |
| `xp_for_level(p_level)` | no | sql |

**Zero overlap** with the 3 Signal Portal functions (`is_portal_admin`,
`accept_artist_invitation`, `promote_primary_cover`).

**`claim_passport`/`initialize_player_profile` full definitions** were
retrieved and read in full (not excerpted). Both are tightly scoped:
`claim_passport` only touches `public.passport_members` and a sequence;
`initialize_player_profile` only touches `public.player_profiles`,
`player_progress`, `player_abilities`, `player_settings`, `player_avatar`,
`avatar_presets`, and calls `get_my_player_state()`. **Neither references,
nor could possibly be affected by, any Signal Portal object** — confirmed
by reading the actual function bodies, not inferred from naming alone.

**Tables** (re-confirmed from I3A via two independent queries): 9 tables,
all Moon Racer/Passport-owned (`passport_members`, `moon_racer_votes`,
`avatar_presets`, `avatar_generations`, `player_avatar`, `player_profiles`,
`player_settings`, `player_progress`, `player_abilities`). Zero overlap
with the 9 proposed Signal Portal tables.

**RLS policies** (public schema, complete list — 10 total): all scoped to
the 9 Moon Racer tables above, all "owner can read/update own X" or one
public-read policy for `avatar_presets`. No naming or logical interaction
with any Signal Portal policy.

**Triggers** (public schema): **zero** found via
`information_schema.triggers`. Signal Portal's own migrations create no
triggers either — moot either way, noted for completeness.

**Storage**: one bucket (`avatar-images`), one RLS policy on
`storage.objects` scoped to it. Zero overlap with Signal Portal's 3
proposed buckets (`collaboration-audio`, `collaboration-proposals`,
`collaboration-visuals`).

**Foreign keys** (public schema, complete list — 9 total): every one
references either `auth.users` or another Moon Racer table. None
reference, and none could be referenced by, any Signal Portal table.
Signal Portal's own tables referencing `auth.users` is expected and
identical in pattern to every existing Moon Racer table — not a conflict.

**Remaining limitation**: the 8 production migrations with no local file
(Stage I3A's finding) were not individually re-derived statement-by-
statement — but their actual, current *effect* (the tables/functions/
policies they produced) has now been fully enumerated above by querying
the live catalog directly, which is the thing that actually matters for a
conflict assessment. The historical migration files themselves remain
unavailable locally; this is now assessed as **informational, not a
blocker** — the compatibility question is answered by what currently
exists, not by how it got there.

**Conclusion: no table, function, RLS policy, trigger, storage bucket, or
foreign-key conflict exists between the 5 Signal Portal migrations and
production's actual current schema.** This is now based on direct
inspection of every relevant catalog, not absence-of-evidence.

## B. Migration execution plan

Unchanged from Stage I3's plan, now with A's findings removing the
remaining uncertainty:

| # | File | Creates | New risk found |
|---|---|---|---|
| 1 | `20261106140000_signal_portal_schema.sql` | 9 tables, `is_portal_admin()`, `accept_artist_invitation()` | none |
| 2 | `20261106140100_signal_portal_storage.sql` | 3 private Storage buckets | none |
| 3 | `20261106150000_signal_portal_artwork.sql` | artwork columns, expanded `asset_type` check, partial unique index | none |
| 4 | `20261106160000_signal_portal_upload_lifecycle.sql` | `upload_status`, original `promote_primary_cover(uuid)` | none |
| 5 | `20261106170000_signal_portal_security_hardening.sql` | hardened `promote_primary_cover(uuid,uuid)`, `collaboration_feedback.recipient_user_id` | none |

Required privileges, SECURITY DEFINER functions, RLS policies, and
rollback considerations for each migration are unchanged from Stage I3's
§C and remain accurate on this re-review. `supabase db push` applies all
5 in order; production's own migration-history table will correctly skip
the 2 already-applied Moon Racer migrations on its own.

## C. Edge Function deployment plan

Re-reviewed all 9 functions' security posture (task 4) — no new finding
beyond what Stage I1's `SIGNAL_PORTAL_SECURITY_AUDIT.md` already
documented and Stage I2B already live-verified against the isolated dev
project: every admin function calls `requireAdmin()` first; artist-facing
functions re-derive identity from the verified session, never from a
client-supplied id; `portal-signed-url` and `portal-submit-feedback`
authorize via the caller's own RLS-scoped session, not the service-role
client; upload validation (size/MIME, both client and server-enforced)
and the exact-size post-upload verification (Stage I1) are unchanged;
invitation lifecycle (create/accept/revoke/audit) and recipient-scoped
feedback isolation (Stage I1's hardening) are both intact.
**No additional hardening identified as necessary before deployment.**

| # | Function | Depends on |
|---|---|---|
| 1 | `portal-request-access` | migration 1 (`artist_invitations`) |
| 2 | `portal-signed-url` | migrations 1–4 |
| 3 | `portal-submit-feedback` | migration 1 |
| 4 | `portal-admin-create-invitation` | migration 1 |
| 5 | `portal-admin-manage-collaboration` | migration 5 (2-arg `promote_primary_cover`) |
| 6 | `portal-admin-request-upload-url` | migrations 1–3 |
| 7 | `portal-admin-confirm-upload` | migration 5 |
| 8 | `portal-admin-list-invitations` | migration 1 |
| 9 | `portal-admin-reply-feedback` | migration 5 (`recipient_user_id`) |

No ordering dependency between the 9 themselves; all must follow
migration 5. Deploy by explicit name only — never a bare `functions
deploy`, which would also touch the unrelated `moon-racer-vote` function.

## D. Environment configuration checklist (names and refs only)

- Target project reference for every deploy command: `drsidtagxezznqviupsr`
- Secret to set: `PORTAL_REDIRECT_URL` → `https://bearcubz.com/portal/`
- Auto-injected by the platform (nothing to configure): `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- Frontend build-time variables (`portal-app/.env.production.local`,
  gitignored, never committed): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  — both already validated by `vite.config.ts`'s fail-closed guard
  (Stage I3A) before any build can succeed.
- Auth redirect allow-list (already confirmed correct, Stage I3A §C):
  `https://bearcubz.com/passport/`, `https://bearcubz.com/universe/login`,
  `https://bearcubz.com/portal/`. No change needed.

No credential value appears in this document.

## E. Administrator bootstrap procedure

Unchanged from `supabase/ADMIN_BOOTSTRAP.md` (re-read for this stage,
still accurate): the real site owner signs in once through the real
production flow, their resulting `auth.users.id` is found (Dashboard or a
one-line read-only `select`), then a single manual
`insert into portal_admins (user_id, granted_by) values ('<uuid>', null)`
is run directly in the SQL editor — never through application code, never
committed with a real value. Verification: confirm `is_portal_admin()`
returns `true` for that session before treating the bootstrap as
complete. **Not run against any environment** — this stage created no
production account of any kind.

## F. Production smoke-test plan

Unchanged from Stage I3's §H, reproduced here for completeness since it's
part of this package:

**Genuinely zero-footprint** (no account, no write, safe to run any time
after Phase 2): entrance loads over HTTPS at `/portal/`; signed-out
visitor sees the entrance, not dashboard/admin data; `/portal/dashboard`
and `/portal/admin` both show access-required states with no session;
calling any `portal-admin-*` function with no/invalid auth returns
401/403; mobile responsiveness of the signed-out entrance.

**Requires one disposable account, created and removed under its own
explicit authorization** — not bundled into "testing" as if free of
effect: authenticated artist access, audio/PDF/artwork viewing, feedback
submission, administrator access, invitation revocation.

This stage created no test account and uploaded no test asset, as
required.

## G. Rollback and recovery plan

- **Database backup**: before Phase 1, confirm Supabase's automatic
  point-in-time/daily backup is active for the production project (this
  audit did not check backup configuration — not covered by the
  read-only queries run this stage; recommend confirming via the
  Dashboard before Phase 1, as a REQUIRED pre-flight item).
- **Migrations**: migration 5's reversibility is detailed in Stage I1's
  audit (§H) and Stage I3's §C — re-confirmed accurate. Migrations 1–4
  have no corrective migration needed, being a first application.
- **Edge Functions**: platform-level redeploy of the prior version.
- **Website**: GitHub Pages serves whatever is committed at the repo
  root — reverting is a normal `git revert`/checkout of the previous
  commit for `portal/`, `404.html`, `CNAME`.
- **Admin bootstrap**: reversible by deleting or setting `revoked_at` on
  the single `portal_admins` row.

## H. Launch authorization checklist — every action requiring explicit human approval

1. Confirm production backup/PITR is active (new, from G above).
2. Authorize Phase 1 (apply 5 migrations, deploy 9 functions, set
   `PORTAL_REDIRECT_URL`) — separately from every phase below.
3. Resolve Stage I3A's remaining BLOCKER before Phase 2: run a real
   production build from a clean checkout and re-verify (`npm run
   validate-release`) before it's ever pushed.
4. Commit the SPA-fallback pair (`404.html`, `portal-app/index.html`) and
   the built `portal/` output — separately authorized, not implied by #2.
5. Authorize Phase 2 (website publish).
6. Authorize Phase 3 (administrator bootstrap + the one disposable
   smoke-test account, created and removed under this specific
   authorization).
7. Authorize Phase 4, per confirmed collaboration, as real assets are
   actually ready to upload.
8. Authorize Phase 5, per artist, individually — never a batch.

No phase above is self-authorizing the next.

---

## Final verification — exact executed totals

- `tsc -b`: clean
- Production build (`.env.production.local` present): succeeds
- `npm run validate-release`: **5/5 checks PASSED**
- `oxlint`: exit 0
- Unit tests: **140/140 passed**
- Browser/accessibility suite: **46/46 passed**

No application code changed this stage (only the read-only inspection
guard, outside `portal-app/`) — all totals above are re-confirmations,
not new work, and match Stage I3A's results exactly.

**Production safety**: `supabase projects list` confirms `drsidtagxezznqviupsr`
still shows `linked: false`. Every inspection command this stage ran
through `with-readonly-prod-guard.sh`, targeting `--remote=` only, never
`supabase link`. No migration applied, no function deployed, no secret
set, no commit, no push, no real invitation, no test account created, no
test asset uploaded.
