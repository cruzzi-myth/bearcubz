# SIGNAL PORTAL — K1.6I.1 Source Control

Executed 2026-11-14. **Commit**: `60f4fab` ("feat(signal-portal): preserve K1.6 secure collaboration backend"), on `master`, pushed to `origin/master`. No history was rewritten; no force-push was used — this was a plain, linear commit on top of the K1.6I frontend-deploy commit (`39cd304`).

## What was included

163 new files + 29 modified tracked files: all 12 database migrations, all 11 new Edge Functions plus their shared scanner/orchestrator/ClamAV-policy modules, the local ClamAV worker source (`infra/clamav/`), the frontend attachment/upload components and hooks, the complete security/integration/browser test suites, and every K1.6-series release document and evidence record under `portal-app/docs/signal-portal/`.

## What was deliberately excluded, and why

| Excluded | Reason |
|---|---|
| `portal-app/design-source/` | Not implementation source; this project's own existing convention (see commit `24361bb`, "keep the NYX design-source PNG master untracked") already established this directory stays untracked |
| `portal-app/docs/screenshots/stage-*/` (~80MB, 85 files) | QA/visual-regression artifacts, not implementation source per the brief's own include list; potential gray area as screenshots of collaboration UI; excluded out of caution rather than assumed safe |
| `portal-app/docs/signal-portal/.k16b-dev-dataset.json` | Already correctly gitignored before this commit (synthetic dev identities + shared password); remained excluded, never staged |
| Any `.env*` file, the production backup, Storage-held private audio/proposals/artwork | None of these exist inside the repository tree at all; nothing to exclude because nothing was ever written there |

## Secret scanning performed (not just assumed clean)

1. Regex scan of the entire staged diff for JWT-shaped tokens, `sb_secret_*`, raw `PGPASSWORD=`/`SUPABASE_SERVICE_ROLE_KEY=` assignments, and PEM private-key headers.
2. **Every JWT-shaped string found was individually base64-decoded and its `role`/`ref` claims inspected** — not just pattern-matched. Result: every one decodes to `role: anon, ref: gcbonlvbgyhsgfayvlvz` (the development project's own public anon key, embedded in two already-applied migration files' `cron.schedule` definitions). Anon keys are designed to be public — the same category of value already embedded in the live production frontend bundle (K1.6I). **No `service_role` key, password, or Vault secret value appears anywhere in the diff.**
3. Regex scan for the two known real test passwords used earlier in this engagement (`Signal-Portal-K16B-Dev-1!`, `Signal-Portal-Browser-Review-1!`) — zero matches outside the already-gitignored dataset file.
4. `.gitignore`'s own diff was read line-by-line before committing it — confirmed it only *adds* a protective rule (the `.k16b-dev-dataset.json` exclusion), never removes or weakens one.

## Verification after push

- `git log --oneline -1` → `60f4fab`.
- `git status` → clean except the 6 deliberately-excluded directories, unchanged.
- Confirmed this repository has no `.github/workflows/` — the push triggers no CI/CD pipeline of any kind.
- Confirmed GitHub Pages' own "serve from branch" mode rebuilds on every push regardless of which paths changed (expected, harmless), but since this commit touched nothing under the served `portal/` directory, the live site's served asset hashes were re-checked immediately after and found byte-identical to before this push — **no functional or content change to the live site resulted from this commit.**
