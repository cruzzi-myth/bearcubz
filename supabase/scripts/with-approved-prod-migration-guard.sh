#!/usr/bin/env bash
# Stage I3H: the ONLY script in this repo permitted to WRITE to
# production. Deliberately separate from with-readonly-prod-guard.sh
# (which refuses every write, no exceptions) and with-dev-guard.sh
# (which only ever targets the dev project) -- this exists to make the
# one necessary production write (applying the 5 approved SIGNAL
# PORTAL migrations) as narrow, verified, and fail-closed as possible.
#
# No database password or API key appears anywhere in this file. Every
# read-only pre-check below uses the Supabase CLI's own already-
# authenticated session (the same mechanism every prior read-only
# guard command in this engagement has used) -- never a literal
# credential. The one write this guard can ever reach (db push) uses
# that same session, not a password passed by this script.
#
# This script performs every verification for a real deployment. It
# does NOT execute one on its own: SIGNAL_PORTAL_GUARD_SELFTEST=1
# stops immediately after every check passes, printing what WOULD run
# instead of running it -- the only way this script has been invoked
# during Stage I3H.
set -euo pipefail

PRODUCTION_REF="drsidtagxezznqviupsr"
EXPECTED_PROJECT_NAME="moon-racer-passport"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MANIFEST="$REPO_ROOT/supabase/scripts/approved-migrations.manifest"

refuse() {
  echo "[approved-prod-migration-guard] REFUSED: $1" >&2
  exit 1
}

for tool in jq shasum; do
  command -v "$tool" >/dev/null 2>&1 || refuse "required tool '$tool' is not available -- failing closed rather than attempting a workaround."
done

# ---------- 9. reject arbitrary commands/arguments ----------
# The ONLY invocation shape this guard will ever consider:
#   npx supabase db push --remote=<ref>
# Exactly 5 tokens, each checked by literal value or pattern -- not a
# scan for tokens anywhere in a longer or reordered argument list.
if [ "$#" -ne 5 ]; then
  refuse "expected exactly 'npx supabase db push --remote=<ref>' (5 tokens), got $# token(s): $*"
fi
[ "$1" = "npx" ] || refuse "token 1 must be 'npx', got '$1'"
[ "$2" = "supabase" ] || refuse "token 2 must be 'supabase', got '$2'"
[ "$3" = "db" ] || refuse "token 3 must be 'db', got '$3'"
[ "$4" = "push" ] || refuse "token 4 must be 'push' -- this guard permits no other subcommand, got '$4'"
case "$5" in
  --remote=*) target_ref="${5#--remote=}" ;;
  *) refuse "token 5 must be '--remote=<ref>', got '$5'" ;;
esac

# ---------- 7. production ref must match exactly ----------
if [ "$target_ref" != "$PRODUCTION_REF" ]; then
  refuse "target ref '$target_ref' does not match the one approved production ref '$PRODUCTION_REF'"
fi

# ---------- 10. explicit, dedicated production-write confirmation ----------
# Deliberately a DIFFERENT variable name from the read-only guard's
# SIGNAL_PORTAL_READONLY_PROD_CONFIRMED -- confirming a read is never
# allowed to also satisfy the gate for a write.
if [ "${SIGNAL_PORTAL_PROD_MIGRATION_CONFIRMED:-}" != "1" ]; then
  refuse "SIGNAL_PORTAL_PROD_MIGRATION_CONFIRMED=1 was not set -- a dedicated gate for the one script allowed to write to production."
fi

# ---------- 2. confirm the production project identity resolves correctly ----------
projects_json="$(npx supabase projects list --output-format json 2>/dev/null)" \
  || refuse "could not list projects to confirm production project identity -- failing closed rather than assuming."
proj_name="$(printf '%s' "$projects_json" | jq -r --arg ref "$PRODUCTION_REF" '.projects[]? | select(.ref == $ref) | .name')"
[ -n "$proj_name" ] || refuse "ref $PRODUCTION_REF was not found in 'projects list' output -- failing closed."
if [ "$proj_name" != "$EXPECTED_PROJECT_NAME" ]; then
  refuse "ref $PRODUCTION_REF resolved to project name '$proj_name', not the expected '$EXPECTED_PROJECT_NAME' -- failing closed."
fi

# ---------- 3 & 4 & 6. the 5 approved migration files, byte-for-byte, by hash ----------
[ -f "$MANIFEST" ] || refuse "approved-migrations.manifest is missing -- cannot verify migration integrity without it."
manifest_count="$(wc -l < "$MANIFEST" | tr -d ' ')"
[ "$manifest_count" -eq 5 ] || refuse "manifest does not list exactly 5 migrations (found $manifest_count) -- failing closed."
if ! ( cd "$REPO_ROOT" && shasum -a 256 -c "$MANIFEST" --status ); then
  refuse "one or more approved migration files does not match its reviewed SHA-256 hash in $MANIFEST -- a changed migration file is never auto-approved, regardless of how small the change."
fi

# ---------- 5 & 8. migration history: exactly these 5 pending, nothing else ----------
# A 6th, unaccounted-for file sitting in supabase/migrations/ would be
# caught here too: db push applies every local-not-remote migration,
# not just the 5 named in the manifest, so this comparison is against
# the complete pending SET, not just "do the 5 approved files exist."
history_json="$(npx supabase migration list --remote="$PRODUCTION_REF" --output-format json 2>/dev/null)" \
  || refuse "could not read production migration history -- failing closed rather than assuming it is safe to proceed."
pending="$(printf '%s' "$history_json" | jq -r '.migrations[]? | select(.local != "" and .remote == "") | .local' | sort)"
expected="$(printf '%s\n' 20261106140000 20261106140100 20261106150000 20261106160000 20261106170000 | sort)"
if [ "$pending" != "$expected" ]; then
  refuse "pending migration set does not exactly match the 5 approved versions.
Expected: $(echo "$expected" | tr '\n' ' ')
Found:    $(echo "$pending" | tr '\n' ' ')
This could mean an unexpected migration is pending, one of the 5 was already applied out of band, or production has drifted since this guard was last reviewed -- failing closed rather than guessing which."
fi

# ---------- fresh backup verification gate ----------
# Task I3H §3 requires the backup be taken immediately before
# deployment, minimizing the interval -- enforced here, not left as a
# documentation-only expectation. The report path is supplied
# explicitly by the operator (never assumed, never defaulted to a
# fixed filename that could go stale unnoticed).
BACKUP_VERIFICATION_REPORT="${SIGNAL_PORTAL_BACKUP_VERIFICATION_REPORT:-}"
[ -n "$BACKUP_VERIFICATION_REPORT" ] || refuse "SIGNAL_PORTAL_BACKUP_VERIFICATION_REPORT was not set -- a fresh, verified backup's PASS report must be supplied explicitly."
[ -f "$BACKUP_VERIFICATION_REPORT" ] || refuse "backup verification report '$BACKUP_VERIFICATION_REPORT' does not exist."
grep -q "^STATUS: PASS$" "$BACKUP_VERIFICATION_REPORT" || refuse "backup verification report does not show STATUS: PASS -- refusing to proceed without a verified fresh backup."
report_epoch="$(stat -f '%m' "$BACKUP_VERIFICATION_REPORT" 2>/dev/null || stat -c '%Y' "$BACKUP_VERIFICATION_REPORT" 2>/dev/null)" \
  || refuse "could not read the backup verification report's timestamp -- failing closed."
now_epoch="$(date +%s)"
age_seconds=$(( now_epoch - report_epoch ))
max_age_seconds=$((6 * 3600))
if [ "$age_seconds" -gt "$max_age_seconds" ]; then
  refuse "backup verification report is $(( age_seconds / 3600 ))h old (max allowed: 6h) -- the backup must be taken immediately before deployment, not reused from an earlier run."
fi

echo "[approved-prod-migration-guard] ALL CHECKS PASSED: ref=$PRODUCTION_REF ($proj_name); manifest verified 5/5 by hash; pending migrations exactly match the 5 approved versions, nothing else; backup verification report is PASS and $(( age_seconds / 60 ))min old." >&2

# ---------- self-test escape hatch -- never a real execution ----------
if [ "${SIGNAL_PORTAL_GUARD_SELFTEST:-}" = "1" ]; then
  echo "[approved-prod-migration-guard] SELFTEST MODE: all checks passed, stopping here WITHOUT executing. Would have run: $*" >&2
  exit 0
fi

echo "[approved-prod-migration-guard] Executing: $*" >&2
exec "$@"
