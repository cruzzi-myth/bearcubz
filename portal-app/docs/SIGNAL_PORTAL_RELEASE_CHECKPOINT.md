# SIGNAL PORTAL — Release Checkpoint

## Release metadata

- **Release date**: 2026-11-15
- **Branch**: `master`
- **Commit SHA**: `6cb1a68928b53c95c7dcd9cf00d08978015f1331` (plus this checkpoint commit)
- **Production deployment**: GitHub Pages, serving `master` branch root (`portal/` directory) at `bearcubz.com/portal/` — current as of commit `e00cd75` (last commit to touch both `portal-app/src/` and the built `portal/` bundle). No source or build changes have landed since; no redeploy required for this checkpoint.
- **Repository status**: clean working tree at time of writing (no uncommitted changes to tracked files).

## Release scope

- Dashboard and Artist Portal
- Admin Command Center (Asset Library, Collaborations, Feedback tabs)
- Listening Chamber
- Proposal Chamber
- Visual Concept Chamber
- Transmission Chamber
- NYX ARDENT companion
- Four collaboration projects
- Twelve uploaded collaboration assets

## Verification

### Production data state (verified directly against production, read-only)

| Collaboration | Status | Primary cover | Audio | Proposal PDF |
|---|---|---|---|---|
| THE GHOST IN THE SIGNAL — XYLØ | draft | 1 approved, unique | ready/clean/approved | ready/clean/approved |
| LOST TRANSITION — Issey Cross | draft | 1 approved, unique | ready/clean/approved | ready/clean/approved |
| CLIMBING TREES — BEλR CUBZ | draft | 1 approved, unique | ready/clean/approved | ready/clean/approved |
| WONKY LIQUID DREAMS — Setia Saint Haven | draft | 1 approved, unique | ready/clean/approved | ready/clean/approved |

All 12 assets: `upload_status=ready`, `security_status=clean`, `security_review_status=approved`. Every collaboration has exactly one `is_primary_cover=true` row (uniqueness confirmed by direct query, not assumed). The production audit log shows a coherent, genuine sequence for the two new projects (`request_upload_url` → `request_asset_scan` → `asset_scan_result` → `approve_asset_security_release` → `update_asset` → `admin_preview_asset`), consistent with real administrator action, not a fabricated or bypassed state.

**No unintended invitations or accounts**: `collaboration_members`, `artist_invitations`, and `artist_profiles` are all empty (0 rows) in production. Exactly one active administrator account exists. No real artist has been invited or onboarded.

### Owner-confirmed visual checks (production, authenticated browser — performed by the owner, not automated)

The following require an authenticated production browser session, which this assistant does not have and did not attempt to obtain. The owner has personally verified these and reported the visual experience as correct:

- All four project covers display correctly in the Dashboard and Artist Portal.
- The Listening Chamber loads the correct audio per project with working playback, seeking, pause, and duration display.
- Each proposal PDF loads with both pages accessible.
- Project switching preserves the correct collaboration context.
- Dashboard → Command Center and Command Center → Dashboard navigation both work.

These are recorded as **owner-confirmed**, not as automated verification — distinguishing the two per release instructions.

### Automated verification (existing coverage, re-run or cited, dev project + unit-level)

- **Unit tests**: 23/23 files passing (311 assertions) — covers asset lifecycle status, visibility, cover eligibility, collaboration readiness, upload lifecycle, ZIP/attachment validation, portal authorization classification, and more.
- **Integration suite** (dev project, real backend, disposable fixtures, real Cloudmersive scanning): **220 passed, 0 failed**.
- **Browser suites** (prior stages, re-confirmed in the preceding validation pass): K1.6Q 9/9, K1.6S 9/9, K1.6T 5/5, plus the new K1.6 isolation/NYX/viewport suite (`k16u.mjs`) 13/13 — covering cross-collaboration isolation (list visibility and direct-URL denial), NYX ARDENT scoping to the signed-in artist's own collaboration, and five viewport sizes (375×812, 390×844, 430×932, 768×1024, 1024×768).
- **Security/isolation mechanism**: cross-artist asset, feedback, and signed-URL denial already exhaustively proven at the backend boundary (`rls.mjs`, `storage.mjs`, `feedback.mjs`) — re-confirmed structurally intact, not re-audited from scratch this pass.

### Security and data integrity

- Administrator-only Command Center: enforced server-side (`is_portal_admin()`), not just UI-hidden — unchanged.
- Invitation-only artist access: enforced via `accept_artist_invitation()` (atomic, identity from `auth.uid()` only) — unchanged. Zero real invitations exist.
- Collaboration-specific RLS, private storage buckets, short-lived signed asset URLs, clean malware-scan evidence, security-release enforcement, artwork approval enforcement: all unchanged from prior verified state; no authentication-architecture changes were made or attempted this checkpoint.
- No cross-artist asset access: structurally enforced and independently tested (see above).

## Deferred work (not blockers for this checkpoint)

- **Production SMTP configuration**: real invitation emails currently fail with Supabase's default shared-SMTP rate limit (`over_email_send_rate_limit`), confirmed independently on both the production and dev projects. Does not block preserving or using the current administrator-verified portal; it blocks inviting external artists until resolved (custom SMTP or a dashboard-side rate-limit change — an owner action).
- **Real artist invitations**: none sent; all four collaborations remain private drafts by design.
- **Artist onboarding acceptance test**: cannot be completed end-to-end until the SMTP item above is resolved.
- Any further visual/UX polish is explicitly out of scope for this checkpoint per the owner's own sign-off on the current visual state.

## Outcome

**RELEASE CHECKPOINT COMPLETE — SAFE TO MOVE ON**
