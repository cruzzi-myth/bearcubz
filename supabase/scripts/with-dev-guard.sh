#!/usr/bin/env bash
# Stage I2B deployment safety gate. Every remote Supabase CLI command
# in this stage — migrations, function deploys, link, anything that
# touches a real project — is run through this wrapper, never called
# bare. This is deliberately a SEPARATE mechanism from
# portal-app/tests/integration/_guard.mjs (which only protects the
# Node test runner): a guard that only runs after a deployment command
# is insufficient, per the Stage I2B brief, so this one wraps the
# command itself and refuses to exec it at all if anything is wrong.
#
# Usage:
#   supabase/scripts/with-dev-guard.sh <command...>
# The wrapped command MUST include an explicit target-ref argument
# somewhere — either the older `--project-ref <ref>` (space-separated)
# or the CLI's newer `--remote=<ref>`/`--remote <ref>` forms (v3 warns
# that --project-ref is deprecated in favor of --remote, and at least
# one subcommand (`db dump`) only accepts --remote at all) — this
# script recognizes all three shapes and requires whichever one is
# present to equal the one authorized development ref below. It does
# not trust any separately-set environment variable instead of the
# command's own real argument, specifically so the thing being checked
# is the thing that is about to run, not a parallel claim about it.
set -euo pipefail

PRODUCTION_REF="drsidtagxezznqviupsr"
AUTHORIZED_DEV_REF="gcbonlvbgyhsgfayvlvz"

if [ "$#" -eq 0 ]; then
  echo "[guard] REFUSED: no command given." >&2
  exit 1
fi

target_ref=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "--project-ref" ] || [ "$prev" = "--remote" ]; then
    target_ref="$arg"
  fi
  case "$arg" in
    --remote=*) target_ref="${arg#--remote=}" ;;
  esac
  prev="$arg"
done

if [ -z "$target_ref" ]; then
  echo "[guard] REFUSED: command has no explicit --project-ref/--remote argument. Every remote command must name its target. Command: $*" >&2
  exit 1
fi

if [ "$target_ref" = "$PRODUCTION_REF" ]; then
  echo "[guard] REFUSED: --project-ref is the PRODUCTION project ($PRODUCTION_REF). Command: $*" >&2
  exit 1
fi

if [ "$target_ref" != "$AUTHORIZED_DEV_REF" ]; then
  echo "[guard] REFUSED: --project-ref ($target_ref) is not the authorized development project ($AUTHORIZED_DEV_REF). Command: $*" >&2
  exit 1
fi

if [ "${SIGNAL_PORTAL_DEV_CONFIRMED:-}" != "1" ]; then
  echo "[guard] REFUSED: SIGNAL_PORTAL_DEV_CONFIRMED=1 was not set. This is a deliberate second gate, independent of --project-ref, so a correct-looking command alone is never sufficient on its own." >&2
  exit 1
fi

echo "[guard] target verified: --project-ref=$target_ref matches the authorized development project. Proceeding: $*" >&2
exec "$@"
