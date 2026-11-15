#!/usr/bin/env bash
# Switches the DEVELOPMENT project's malware scanner between:
#   mock  — standard testing: scans go to portal-test-scanner-mock (no provider credits)
#   live  — live-provider verification: real Cloudmersive
# DEV ONLY (hard-coded ref, routed through with-dev-guard.sh). Production is never
# touched, and the scanner itself refuses any test mode when running on production
# (see supabase/functions/_shared/scannerTestMode.ts). No secret VALUE is read or printed.
set -euo pipefail
DEV_REF="gcbonlvbgyhsgfayvlvz"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mode="${1:-}"
export SIGNAL_PORTAL_DEV_CONFIRMED=1
case "$mode" in
  mock) "$HERE/with-dev-guard.sh" npx supabase secrets set PORTAL_SCANNER_TEST_MODE=mock --remote="$DEV_REF" --yes ;;
  live) "$HERE/with-dev-guard.sh" npx supabase secrets unset PORTAL_SCANNER_TEST_MODE --remote="$DEV_REF" --yes ;;
  *) echo "usage: $0 mock|live" >&2; exit 1 ;;
esac
echo "dev scanner mode requested: $mode" >&2
