#!/usr/bin/env bash
# Stage I3M: the ONLY script in this repo permitted to deploy Edge
# Functions to production. A SEPARATE mechanism from
# with-approved-prod-migration-guard.sh (that guard's allowlist still
# only ever matches "db push" — nothing here touches or widens it),
# built with the same fail-closed discipline for the one other kind of
# production write this project needs: deploying one of the 9
# approved SIGNAL PORTAL functions, one at a time, never more.
#
# No database password, API key, or secret VALUE ever appears in this
# file. The one write this guard can reach (functions deploy) uses the
# CLI's own already-authenticated session, exactly like every prior
# guard in this engagement — never a literal credential passed by this
# script. The non-deploying pre-checks below (project identity,
# secrets presence) use the same read-only mechanisms already proven
# safe in with-readonly-prod-guard.sh.
#
# SIGNAL_PORTAL_FUNCTION_DEPLOY_SELFTEST=1 stops immediately after
# every check passes, printing what WOULD run instead of running it —
# the only way this script should be invoked before a real deployment
# is explicitly authorized.
set -euo pipefail

PRODUCTION_REF="drsidtagxezznqviupsr"
EXPECTED_PROJECT_NAME="moon-racer-passport"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FUNCTIONS_DIR="$REPO_ROOT/supabase/functions"
MANIFEST="$REPO_ROOT/supabase/scripts/approved-functions.manifest"

refuse() {
  echo "[approved-prod-function-deploy-guard] REFUSED: $1" >&2
  exit 1
}

for tool in jq shasum; do
  command -v "$tool" >/dev/null 2>&1 || refuse "required tool '$tool' is not available -- failing closed rather than attempting a workaround."
done

# ---------- 6. reject arbitrary commands/arguments ----------
# The ONLY invocation shape this guard will ever consider:
#   npx supabase functions deploy <name> --remote=<ref> --yes
# Exactly 7 tokens, each checked by literal value or pattern -- one
# function per invocation, never a bare "deploy everything" call and
# never --prune (which could delete production functions outside our
# approved set -- requirement 7, "no unrelated functions").
if [ "$#" -ne 7 ]; then
  refuse "expected exactly 'npx supabase functions deploy <name> --remote=<ref> --yes' (7 tokens), got $# token(s): $*"
fi
[ "$1" = "npx" ] || refuse "token 1 must be 'npx', got '$1'"
[ "$2" = "supabase" ] || refuse "token 2 must be 'supabase', got '$2'"
[ "$3" = "functions" ] || refuse "token 3 must be 'functions', got '$3'"
[ "$4" = "deploy" ] || refuse "token 4 must be 'deploy' -- this guard permits no other subcommand, got '$4'"
function_name="$5"
case "$6" in
  --remote=*) target_ref="${6#--remote=}" ;;
  *) refuse "token 6 must be '--remote=<ref>', got '$6'" ;;
esac
[ "$7" = "--yes" ] || refuse "token 7 must be '--yes' (the hosted-mutation confirmation flag), got '$7'"

for arg in "$@"; do
  case "$arg" in
    --prune|--no-verify-jwt|--import-map*)
      refuse "flag '$arg' is never permitted on a guarded deploy -- --prune can delete unapproved production functions, --no-verify-jwt/--import-map change security-relevant behavior outside manifest review. Command: $*"
      ;;
  esac
done

# ---------- 1. production ref must match exactly ----------
if [ "$target_ref" != "$PRODUCTION_REF" ]; then
  refuse "target ref '$target_ref' does not match the one approved production ref '$PRODUCTION_REF'"
fi

# ---------- 8. explicit, dedicated production-write confirmation ----------
# Deliberately a DIFFERENT variable name from the migration guard's
# SIGNAL_PORTAL_PROD_MIGRATION_CONFIRMED -- confirming one kind of
# production write never satisfies the gate for the other.
if [ "${SIGNAL_PORTAL_FUNCTION_DEPLOY_CONFIRMED:-}" != "1" ]; then
  refuse "SIGNAL_PORTAL_FUNCTION_DEPLOY_CONFIRMED=1 was not set -- a dedicated gate for the one script allowed to deploy production functions."
fi

# ---------- 2. confirm the production project identity resolves correctly ----------
projects_json="$(npx supabase projects list --output-format json 2>/dev/null)" \
  || refuse "could not list projects to confirm production project identity -- failing closed rather than assuming."
proj_name="$(printf '%s' "$projects_json" | jq -r --arg ref "$PRODUCTION_REF" '.projects[]? | select(.ref == $ref) | .name')"
[ -n "$proj_name" ] || refuse "ref $PRODUCTION_REF was not found in 'projects list' output -- failing closed."
if [ "$proj_name" != "$EXPECTED_PROJECT_NAME" ]; then
  refuse "ref $PRODUCTION_REF resolved to project name '$proj_name', not the expected '$EXPECTED_PROJECT_NAME' -- failing closed."
fi

# ---------- 3 & 7. exactly one of the nine approved function names ----------
APPROVED_NAMES="portal-request-access portal-signed-url portal-submit-feedback portal-admin-create-invitation portal-admin-list-invitations portal-admin-manage-collaboration portal-admin-reply-feedback portal-admin-request-upload-url portal-admin-confirm-upload"
name_is_approved=0
for approved in $APPROVED_NAMES; do
  [ "$function_name" = "$approved" ] && name_is_approved=1
done
[ "$name_is_approved" -eq 1 ] || refuse "'$function_name' is not one of the 9 approved SIGNAL PORTAL function names -- refusing to deploy anything outside the reviewed set."

# ---------- 4 & 5. combined source hash (own file + every bundled _shared dependency) ----------
[ -f "$MANIFEST" ] || refuse "approved-functions.manifest is missing -- cannot verify function integrity without it."
manifest_line="$(grep -E "^[0-9a-f]+  $function_name  " "$MANIFEST" || true)"
[ -n "$manifest_line" ] || refuse "no manifest entry found for '$function_name' in $MANIFEST."

expected_hash="$(echo "$manifest_line" | awk '{print $1}')"
deps="$(echo "$manifest_line" | awk '{print $4}')"

own_file="$FUNCTIONS_DIR/$function_name/index.ts"
[ -f "$own_file" ] || refuse "source file missing: $own_file"
files=("$own_file")
IFS=',' read -ra dep_list <<< "$deps"
for dep in "${dep_list[@]}"; do
  dep_file="$FUNCTIONS_DIR/_shared/$dep"
  [ -f "$dep_file" ] || refuse "bundled shared dependency missing: $dep_file"
  files+=("$dep_file")
done

actual_hash="$(cat "${files[@]}" | shasum -a 256 | awk '{print $1}')"
if [ "$actual_hash" != "$expected_hash" ]; then
  refuse "'$function_name' (or one of its bundled _shared dependencies: $deps) does not match its reviewed manifest hash -- a changed function OR a changed shared module it depends on is never auto-approved, regardless of how small the change. Expected $expected_hash, got $actual_hash."
fi

# ---------- 9. required production configuration ----------
# Only portal-request-access reads PORTAL_REDIRECT_URL (it has a
# matching hardcoded fallback, but this guard requires it set
# explicitly in production before THAT function specifically may
# deploy, per Stage I3L's finding -- never silently relying on the
# fallback for a guarded production deploy).
if [ "$function_name" = "portal-request-access" ]; then
  secrets_json="$(npx supabase secrets list --remote="$PRODUCTION_REF" --output-format json 2>/dev/null)" \
    || refuse "could not list production secrets to verify PORTAL_REDIRECT_URL is configured -- failing closed."
  has_redirect="$(printf '%s' "$secrets_json" | jq -r '.secrets[]? | select(.name == "PORTAL_REDIRECT_URL") | .name' | head -1)"
  [ "$has_redirect" = "PORTAL_REDIRECT_URL" ] || refuse "PORTAL_REDIRECT_URL is not set in production -- required before deploying portal-request-access (see Stage I3L/I3M; set it per Task 5's documented procedure first)."
fi

echo "[approved-prod-function-deploy-guard] ALL CHECKS PASSED: ref=$PRODUCTION_REF ($proj_name); function='$function_name' is approved; combined source+shared-deps hash verified; required production configuration present." >&2

# ---------- self-test escape hatch -- never a real execution ----------
if [ "${SIGNAL_PORTAL_FUNCTION_DEPLOY_SELFTEST:-}" = "1" ]; then
  echo "[approved-prod-function-deploy-guard] SELFTEST MODE: all checks passed, stopping here WITHOUT executing. Would have run: $*" >&2
  exit 0
fi

echo "[approved-prod-function-deploy-guard] Executing: $*" >&2
exec "$@"
