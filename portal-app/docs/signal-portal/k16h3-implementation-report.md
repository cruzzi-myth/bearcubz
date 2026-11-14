# SIGNAL PORTAL — K1.6H.3 Implementation Report

Implementation date: 2026-11-12. Authorization: development implementation, local testing, documentation, and read-only production inspection. No production mutation, commit, push, purchase, invitation, or artwork activation occurred.

## Mission: close release-preparation tasks without purchases, within the owner's explicit decisions

The owner's nine explicit decisions (no PITR purchase, no Cloudmersive upgrade, no ClamAV hosting purchase, preserve the local ClamAV work, use Cloudmersive free tier for production-eligible small files, preserve private materials, no invitations, no artwork activation, no production deployment) governed every choice below. None were re-litigated or ignored.

## Section 1 — deployment configuration confirmed from the repository

The frontend is a static site built to `portal-app/build.outDir=../portal`, served from the repository root at `bearcubz.com/portal/` via GitHub Pages (`CNAME` present at repo root) — not a separate hosting pipeline. This means frontend "deployment" is literally "build, commit the `portal/` output, push to the default branch" — which is categorically impossible this stage regardless of any other gate, since commit/push are unauthorized. This was confirmed by reading `vite.config.ts` and the repo layout directly, not assumed.

## Section 3 — development baseline confirmed live, not assumed

Security 233/233 and integration 186/186 were re-run fresh and matched the K1.6H.2-era figures exactly. The genuine ClamAV 34/34 result was **not** re-run a third time — per the brief's own "do not waste API quota or development resources by repeatedly rerunning already-proven tests without a specific reason," and because this stage's own scanner-policy work (below) needed to verify *configuration* behavior, not re-prove the engine again.

## Section 4/5 — no-cost database recovery (the largest new work this stage)

A genuine logical schema+data backup of the real dev project was taken via native `pg_dump`/`psql` (the Supabase CLI's own `db dump` command requires Docker even for `--remote`, which is absent — worked around by executing its `--dry-run`-generated script directly with the native binaries, never exposing the ephemeral connection credential it contains). Restored into a fresh, disposable, loopback-only local PostgreSQL cluster after adding four minimal platform-role/schema shims. Result: 21/21 tables with RLS correctly enabled, 23 functions, 4 triggers, and exact row-count/content parity against a fresh live query of the source — including byte-exact matches on both real artists' known asset sizes. Full detail, including exactly what a logical dump does *not* capture (platform-managed schema/extensions/Realtime/Vault, Storage object bytes, Auth/OAuth/SMTP configuration): `k16h3-free-tier-recovery.md`.

## Sections 6/7 — Cloudmersive production config prepared; ClamAV live-verified as safely disabled

Live calls to the real `scannerConfig()`/`routeScanner()` confirmed: zero scanner env vars set (the real production starting state) → Cloudmersive-only, ClamAV unreachable; `dual` mode without a worker configured → rejected; fallback enabled → rejected; non-HTTPS worker URL → rejected. No production secret was provisioned. Full detail: `k16h3-production-scanner-policy.md`.

## Section 8 — legacy asset inventory and authorized local revalidation

All 15 `legacy_unverified` `collaboration_assets` rows were inventoried (9 real XYLØ/Issey rows, 6 disposable browser-test fixtures — distinguished by cross-referencing known byte-exact sizes, not guessed). A new reusable script, `infra/clamav/revalidate-legacy-assets.mjs`, downloaded the real bytes of every row directly from Storage, scanned each with a freshly-`freshclam`-updated local ClamAV daemon, and deleted every temp file immediately — no real bytes were sent to Cloudmersive, VirusTotal, or any third party, matching the brief's explicit prohibition. All 9 real rows scanned genuinely clean with verified byte-size/SHA-256 integrity. The result was deliberately **not** written back to the database as official clearance — this tests the workflow against real dev-stored bytes, it does not and cannot satisfy the brief's own "genuine security evidence for the exact production bytes" requirement, since those bytes don't exist in production yet. Full detail: `k16h3-legacy-asset-security.md`.

## Section 9 — artwork optimization measurement

Both real pending-approval cover images were downloaded, measured (1254×1254, no alpha, ~3.2MB PNG each), and locally re-encoded as WebP (quality 90) and JPEG (quality 90) candidates using `sips`/`cwebp` — official, no-cost tools. Both WebP candidates land around 527–534KB, roughly 5.4× under the 2,900,000-byte threshold. Nothing was uploaded, replaced, or scanned; no approval status changed. Full detail: `k16h3-artwork-optimization.md`.

## Section 10 — production migration validation

Live-reconfirmed (not assumed from K1.6H.2's two-day-old documentation): dev has 29 applied migrations, production has 17 applied and the same 12 pending identified in K1.6H.2 — no new migration file exists in the repository. Fresh SHA-256 computed for all 12. The genuine backup/restore test from section 4 doubles as additional, complementary evidence that the current cumulative schema (all 12 pending migrations' effect, already live in dev) is internally consistent — a different kind of verification than K1.6H.2's own native-replay-from-migration-files approach, not a repeat of it. Full detail: `k16h3-migration-validation.md`; rollback plan addendum added to `k16f-rollback-plan.md`.

## Section 11 — production secrets inventory

Compiled by grepping every `Deno.env.get`/config-lookup call across the actual deployed Edge Function source — not copied from a prior stage's prose — and categorized exactly as the brief requested (initial-release-required / cron / system-auth / future-ClamAV-only / optional / deprecated). Full detail: `k16h3-production-secrets.md`.

## Section 12 — storage & file security

Eight properties checked: six carried forward unchanged (no code in those paths changed since K1.6H.2, so re-testing them would prove nothing new); two freshly verified this stage (the exact 5-minute signed-URL TTL, read directly from current source; the legacy-asset activation gate, re-confirmed by observing that this stage's own revalidation script never triggered it). The "already-issued URL remains valid until expiry" limitation is stated plainly, not glossed over.

## Section 13 — artist experience regression

Verified via direct, targeted database queries rather than a full browser-suite run, since nothing in the artist-facing frontend changed since K1.6H.2 — running the full live-authentication browser suite again would exercise no new code, which the brief explicitly says to avoid. All required facts (titles, byte sizes, pending artwork state) matched exactly, including an independent cross-check via the section-4 restore test's own content spot-check.

## Section 14 — testing summary

See `k16h3-test-results.md` for the complete table distinguishing passed/genuine-local/genuine-external/mocked/not-rerun-and-why for every category the brief lists.

## What this stage did not do, and why

- Did not re-run the full browser/accessibility suite (no frontend change to justify it).
- Did not re-run the genuine ClamAV engine test a third time (no code change to justify it; configuration-level verification was the actually-needed check and was performed).
- Did not touch production in any way beyond read-only `migration list` and the pre-existing read-only backup-status inspection from K1.6H.2 (not repeated, since production's backup configuration cannot have changed without a purchase the owner explicitly declined).
- Did not activate, approve, transfer, or scan any asset's exact production bytes — none exist yet.

**STOP. No commit, push, production action, purchase, or invitation occurred. Awaiting the project owner's review.**
