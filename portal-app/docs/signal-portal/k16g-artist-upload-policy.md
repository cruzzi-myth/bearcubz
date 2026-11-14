# SIGNAL PORTAL — K1.6G Artist Upload Policy

Implementation date: 2026-11-09.

## Policy

A new, additional cap — `PORTAL_ARTIST_UPLOAD_MAX_BYTES` — is layered on top of (never replacing) each attachment category's existing `CATEGORY_RULES.maxBytes`. It governs the realistic free-tier scanner ceiling, independent of what a given category would otherwise allow.

**Resolution order** (backend, `_shared/uploadPolicy.ts`): configured env var `PORTAL_ARTIST_UPLOAD_MAX_BYTES` → `CLOUDMERSIVE_MAX_FILE_SIZE_BYTES` → hardcoded default `2,900,000` bytes. No new secret was required this stage since the effective value already falls through to the existing conservative default (chosen in K1.6E.1, below Cloudmersive's real confirmed 3MB free-tier ceiling).

**Frontend mirror** (`src/lib/attachmentRules.ts`): `ARTIST_UPLOAD_MAX_BYTES`, read from `import.meta.env.VITE_PORTAL_ARTIST_UPLOAD_MAX_BYTES` if set, falling back to the identical hardcoded default. A dedicated test (`tests/security/uploadPolicyDrift.test.mjs`) imports both modules' literal defaults via esbuild-bundled dynamic import and asserts numeric equality — there is no shared module between a Deno Edge Function and a Vite bundle to enforce this at the type level, so this drift test is the actual enforcement that the two "cannot drift silently," per the brief's own requirement.

**Enforcement order** (`portal-request-attachment-upload-url`): the existing category-size check runs first (unchanged, `FILE_TOO_LARGE`); the new launch-policy check runs second (`EXCEEDS_LAUNCH_POLICY_LIMIT`, with `maxBytes` in the response body). This ordering was verified to not break the pre-existing 20MB-image-exceeds-15MB-category-limit test.

**Frontend enforcement**: `validateAttachmentFile` in `attachmentRules.ts` rejects any file over `ARTIST_UPLOAD_MAX_BYTES` with the exact required artist-facing copy: *"This file exceeds the current upload limit. Please choose a smaller file."*

**Preserving the larger architecture for a future upgrade**: nothing about the category rules, the Storage buckets, or the quarantine/scan/promotion pipeline assumes 2.9MB — the launch cap is purely an additional, independently-configurable gate. Raising `PORTAL_ARTIST_UPLOAD_MAX_BYTES` (backend) and `VITE_PORTAL_ARTIST_UPLOAD_MAX_BYTES` (frontend, at build time) together, once a paid scanner tier is in place, requires no code or schema change.

## Cascading consequence: no new upload can ever exceed ~2.9MB

This is a structural, intended effect of the policy, not a side effect to work around — but it broke the ability to exercise "oversized file" scenarios through the *normal* upload flow in several existing tests, which assumed an oversized real upload would reach quarantine. Each was fixed according to what it actually needed, never by weakening the new policy:

| Test | Problem | Fix |
|---|---|---|
| `k16c.mjs` happy path (+ 7 dependent tests) | Used the original 4.67MB XYLØ proposal PDF | Switched to the K1.6F-optimized 210,264-byte PDF |
| `k16c.mjs` happy path's own status assertion | Asserted `status === 'awaiting_scan'` only | Widened to accept `'awaiting_scan' \|\| 'clean'` — a small legitimate file may now genuinely scan clean immediately against the live scanner |
| `k16d.mjs` signature-failure test | Same oversized original PDF | Switched to the same optimized PDF |
| `k16e.mjs` oversized-simulation test | Real 3.5MB upload attempt, now blocked at the request stage before `confirm` could run | Small real upload + direct service-role DB-state simulation of the oversized error; widened its own `confirm.body.status` precondition the same way |
| `k16e1.mjs` oversized-file tests (×2) | Needed the REAL quarantined Storage object to be large so a real retry re-exercises the real local size check — simulating DB state alone was not enough | New `createPreExistingOversizedAttachment` helper bypasses the gated request function entirely, uploading directly to Storage via the service-role client and inserting a matching row — explicitly framed as simulating "a file that predates the launch policy," matching the brief's own language |

Final confirmed state (prior to this stage's frontend-only Section 8 admin UI work, which made no backend changes): **185 passed, 0 failed** — the sole remaining failure at 184/185 (`[K1.6C] concurrent attachment-limit enforcement`, a 10-byte timing test with no connection to any size threshold touched this stage) was confirmed, via a clean rerun, to be pre-existing timing flakiness unrelated to this stage's changes, not a regression. See `k16g-test-results.md`.
