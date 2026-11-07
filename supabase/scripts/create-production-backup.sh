#!/usr/bin/env bash
# Stage I3H: reusable version of the Stage I3E manual export procedure.
# Run by the OPERATOR directly (never through an agent tool call) --
# it needs the project's real database password at pg_dump's own
# interactive prompt, which must never pass through anything else.
#
# No password or API key is read, stored, or printed by this script.
set -euo pipefail

PG_BIN="$(brew --prefix postgresql@17)/bin"
PRODUCTION_REF="drsidtagxezznqviupsr"

: "${PGSSLROOTCERT:?Set PGSSLROOTCERT to the downloaded Supabase root CA certificate path -- never defaulted.}"
: "${PROD_DB_HOST:?Set PROD_DB_HOST to the exact Session Pooler host from Project Settings -> Database.}"
: "${PROD_DB_PORT:?Set PROD_DB_PORT (5432 for Session Pooler).}"
: "${PROD_DB_USER:?Set PROD_DB_USER (e.g. postgres.<project-ref>).}"

case "$PROD_DB_USER" in
  *"$PRODUCTION_REF"*) ;;
  postgres) echo "[backup] note: PROD_DB_USER is a bare 'postgres' -- expected for a Direct connection, not the Session Pooler. Confirm this is intentional." >&2 ;;
  *) echo "[backup] WARNING: PROD_DB_USER ('$PROD_DB_USER') does not contain the production ref ($PRODUCTION_REF) -- double-check this points at the right project before continuing." >&2 ;;
esac

export PGSSLMODE="verify-full"
export PGOPTIONS="-c default_transaction_read_only=on"

BACKUP_ROOT="$HOME/MoonRacer-Secure-Backups"
TS="$(date +%Y-%m-%dT%H-%M-%S)"
DEST="$BACKUP_ROOT/moon-racer-production-$TS"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
case "$DEST" in
  "$REPO_ROOT"*)
    echo "[backup] REFUSED: destination '$DEST' resolves inside the repository ($REPO_ROOT) -- backups must never live in a git-tracked directory." >&2
    exit 1
    ;;
esac

if [ -e "$DEST" ]; then
  echo "[backup] REFUSED: '$DEST' already exists -- never overwriting a prior backup (including Stage I3E's)." >&2
  exit 1
fi

mkdir -p "$DEST"
chmod 700 "$BACKUP_ROOT" "$DEST"

run_dump() {
  local label="$1"; shift
  echo "[backup] exporting: $label..." >&2
  "$PG_BIN/pg_dump" -h "$PROD_DB_HOST" -p "$PROD_DB_PORT" -U "$PROD_DB_USER" -d postgres -W "$@"
}

run_dump "public schema structure"            --schema=public --schema-only --no-owner --no-privileges -f "$DEST/schema-public.sql"
run_dump "public row data"                    --schema=public --data-only --no-owner                     -f "$DEST/data-public.sql"
run_dump "auth.users + auth.identities"       --table=auth.users --table=auth.identities --no-owner --no-privileges -f "$DEST/auth-identity-data.sql"
run_dump "storage.buckets + storage.objects"  --table=storage.buckets --table=storage.objects --no-owner --no-privileges -f "$DEST/storage-metadata.sql"

chmod 600 "$DEST"/*.sql
( cd "$DEST" && shasum -a 256 schema-public.sql data-public.sql auth-identity-data.sql storage-metadata.sql > CHECKSUMS.sha256 )
chmod 600 "$DEST/CHECKSUMS.sha256"

echo "[backup] complete: $DEST" >&2
echo "[backup] next: supabase/scripts/validate-production-backup.sh '$DEST'" >&2
echo "$DEST"
