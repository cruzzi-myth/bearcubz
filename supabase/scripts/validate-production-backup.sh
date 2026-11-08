#!/usr/bin/env bash
# Stage I3H: generalized version of the Stage I3E manual verification
# procedure. Usage:
#   supabase/scripts/validate-production-backup.sh <backup-dir>
#
# Writes <backup-dir>/VALIDATION_REPORT.txt ending in either
#   STATUS: PASS
# or
#   STATUS: FAIL
# -- the exact line with-approved-prod-migration-guard.sh checks for.
# Fails closed: any step that cannot be completed is a FAIL, never a
# skip. Step 6 (live row-count comparison) requires production
# read access -- set SIGNAL_PORTAL_READONLY_PROD_CONFIRMED=1 when
# running this script, or that step (and therefore the whole report)
# fails closed rather than being silently skipped.
set -uo pipefail

DEST="${1:?Usage: validate-production-backup.sh <backup-dir>}"
[ -d "$DEST" ] || { echo "FAIL: '$DEST' is not a directory" >&2; exit 1; }
DEST="$(cd "$DEST" && pwd)"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PG_BIN="$(brew --prefix postgresql@17)/bin"
GUARD="$REPO_ROOT/supabase/scripts/with-readonly-prod-guard.sh"
PRODUCTION_REF="drsidtagxezznqviupsr"

EXPECTED_PROJECT_NAME="moon-racer-passport"
REPORT="$DEST/VALIDATION_REPORT.txt"
FAILURES=()
note() { echo "$1" | tee -a "$REPORT" >&2; }

: > "$REPORT"
chmod 600 "$REPORT"
note "Stage I3H backup validation: $DEST"
note "Run at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
note ""

# ---------- 0. bind this report to the correct production project, verified, not assumed ----------
note "--- 0: production project identity binding ---"
proj_name="$(npx supabase projects list --output-format json 2>/dev/null | jq -r --arg ref "$PRODUCTION_REF" '.projects[]? | select(.ref == $ref) | .name')"
if [ "$proj_name" = "$EXPECTED_PROJECT_NAME" ]; then
  note "OK: this report is bound to project ref $PRODUCTION_REF, confirmed live as '$proj_name'"
else
  note "FAIL: could not confirm ref $PRODUCTION_REF resolves to '$EXPECTED_PROJECT_NAME' (got '${proj_name:-<none>}')"
  FAILURES+=("project-identity-unconfirmed")
fi
note ""

# ---------- 1 & 2. expected files exist and are non-empty ----------
note "--- 1/2: file existence and non-empty ---"
for f in schema-public.sql data-public.sql auth-identity-data.sql storage-metadata.sql CHECKSUMS.sha256; do
  if [ -s "$DEST/$f" ]; then
    note "OK: $f exists and is non-empty ($(wc -c < "$DEST/$f" | tr -d ' ') bytes)"
  else
    note "FAIL: $f is missing or empty"
    FAILURES+=("missing-or-empty:$f")
  fi
done

# ---------- 3. check for SQL dump errors / truncation ----------
note "--- 3: dump completion markers (a truncated dump omits this) ---"
for f in schema-public.sql data-public.sql auth-identity-data.sql storage-metadata.sql; do
  if [ -f "$DEST/$f" ] && grep -q "PostgreSQL database dump complete" "$DEST/$f"; then
    note "OK: $f ends with pg_dump's own completion marker"
  else
    note "FAIL: $f is missing the completion marker -- likely truncated or failed mid-export"
    FAILURES+=("truncated:$f")
  fi
done

# ---------- 4. checksum verification ----------
note "--- 4: SHA-256 checksum verification ---"
if [ -f "$DEST/CHECKSUMS.sha256" ] && ( cd "$DEST" && shasum -a 256 -c CHECKSUMS.sha256 --status ); then
  note "OK: all files match CHECKSUMS.sha256"
else
  note "FAIL: checksum mismatch or CHECKSUMS.sha256 unreadable"
  FAILURES+=("checksum-mismatch")
fi

# ---------- 5. expected table coverage ----------
# Plain "table:file" pairs, not an associative array -- the default
# /usr/bin/env bash on macOS is 3.2, which predates declare -A
# entirely. This script is meant to run unmodified on whatever bash an
# operator actually has, not a Homebrew-installed newer one.
note "--- 5: expected table coverage ---"
EXPECTED_PAIRS="
public.avatar_generations:schema-public.sql
public.avatar_presets:schema-public.sql
public.moon_racer_votes:schema-public.sql
public.passport_members:schema-public.sql
public.player_abilities:schema-public.sql
public.player_avatar:schema-public.sql
public.player_profiles:schema-public.sql
public.player_progress:schema-public.sql
public.player_settings:schema-public.sql
auth.identities:auth-identity-data.sql
auth.users:auth-identity-data.sql
storage.buckets:storage-metadata.sql
storage.objects:storage-metadata.sql
"
for pair in $EXPECTED_PAIRS; do
  t="${pair%%:*}"
  f="${pair#*:}"
  if [ -f "$DEST/$f" ] && grep -q "CREATE TABLE $t " "$DEST/$f"; then
    note "OK: $f declares $t"
  else
    note "FAIL: $f is missing expected table $t"
    FAILURES+=("missing-table:$f:$t")
  fi
done

# ---------- 6 & 7. live production row counts vs. exported data ----------
note "--- 6/7: live production row counts vs. exported COPY blocks ---"
if [ "${SIGNAL_PORTAL_READONLY_PROD_CONFIRMED:-}" != "1" ]; then
  note "FAIL: SIGNAL_PORTAL_READONLY_PROD_CONFIRMED=1 not set -- this step requires live read access and fails closed rather than being skipped."
  FAILURES+=("live-comparison-skipped")
else
  copy_count() {
    local file="$1" table="$2"
    awk -v t="COPY $table " '
      $0 ~ "^"t { flag=1; next }
      /^\\\.$/ { if (flag==1) { print c; exit } }
      flag { c++ }
    ' "$DEST/$file"
  }
  TABLE_FILE_PAIRS="
public.avatar_generations:data-public.sql
public.avatar_presets:data-public.sql
public.moon_racer_votes:data-public.sql
public.passport_members:data-public.sql
public.player_abilities:data-public.sql
public.player_avatar:data-public.sql
public.player_profiles:data-public.sql
public.player_progress:data-public.sql
public.player_settings:data-public.sql
auth.users:auth-identity-data.sql
auth.identities:auth-identity-data.sql
storage.buckets:storage-metadata.sql
storage.objects:storage-metadata.sql
"
  QFILE="$(mktemp)"
  for pair in $TABLE_FILE_PAIRS; do
    tbl="${pair%%:*}"
    tfile="${pair#*:}"
    exported="$(copy_count "$tfile" "$tbl")"
    exported="${exported:-0}"
    echo "select '$tbl' as t, count(*) as n from $tbl;" > "$QFILE"
    # Stage K1.5C fix (round 2): --output-format=json alone was not
    # enough -- the CLI also auto-detects whether it's being called by
    # an agent (its own --agent flag, confirmed via `db query --help`)
    # and changes the JSON SHAPE accordingly: agent-detected contexts
    # get an object wrapper ({"rows":[...], "boundary":..., "warning":
    # ...} -- a prompt-injection safety wrapper around untrusted DB
    # content, added for agent callers specifically), while a plain
    # human terminal gets a bare top-level array ([{...}]), no "rows"
    # key at all. Confirmed empirically by running the identical
    # command with --agent=no and comparing the raw byte output to the
    # same command without it -- not inferred from documentation
    # alone. --agent=no forces the plain, deterministic array shape
    # regardless of who/what actually invokes this script, so the
    # parser below only ever has to handle ONE confirmed shape.
    live_json="$(SIGNAL_PORTAL_READONLY_PROD_CONFIRMED=1 "$GUARD" npx supabase db query --read-only --output-format=json --agent=no --remote="$PRODUCTION_REF" --file="$QFILE" 2>/dev/null)"
    # Strict parsing: the output must be valid JSON AND shaped exactly
    # as the confirmed --agent=no response (a top-level array with
    # exactly one object, whose "t" matches the table just queried and
    # whose "n" is a number) before "n" is trusted at all. Malformed,
    # empty, truncated, wrapped-object, table-formatted, or any other
    # unexpectedly-shaped output is rejected outright, never silently
    # misread as a row count (never hardcoded; "live" always comes
    # from this exact response or not at all).
    if ! printf '%s' "$live_json" | jq -e 'type == "array" and length == 1 and .[0].t == $t and (.[0].n | type) == "number"' --arg t "$tbl" >/dev/null 2>&1; then
      note "FAIL: live query response for $tbl was not a valid, well-shaped JSON array (output-format/agent-mode mismatch, empty response, or unexpected shape) -- never treated as a row count"
      FAILURES+=("live-query-malformed:$tbl")
      continue
    fi
    live="$(printf '%s' "$live_json" | jq -r '.[0].n')"
    if [ "$live" = "ERROR" ] || [ -z "$live" ]; then
      note "FAIL: could not read live row count for $tbl"
      FAILURES+=("live-query-failed:$tbl")
    elif [ "$live" = "$exported" ]; then
      note "OK: $tbl -- exported=$exported, live=$live (match)"
    else
      note "FAIL: $tbl -- exported=$exported, live=$live (MISMATCH -- production has changed since this backup was taken)"
      FAILURES+=("row-count-drift:$tbl")
    fi
  done
  rm -f "$QFILE"
fi

# ---------- 8/9. restore into a fresh disposable local database ----------
note "--- 8/9: restore into a fresh disposable local database ---"
SOCKET_DIR="$HOME/MoonRacer-Secure-Backups/.isolated-restore-sockets"
if ! "$PG_BIN/pg_ctl" -D "$HOME/MoonRacer-Secure-Backups/.isolated-restore-pgdata" status >/dev/null 2>&1; then
  note "FAIL: isolated local Postgres instance is not running -- cannot test restoration."
  FAILURES+=("no-local-instance")
else
  TESTDB="signal_portal_backup_validation_$(date +%s)"
  PSQL_SU=("$PG_BIN/psql" -h "$SOCKET_DIR" -p 55433 -U postgres -X)
  if "${PSQL_SU[@]}" -d postgres -c "CREATE DATABASE $TESTDB;" >/dev/null 2>>"$REPORT"; then
    WORKDIR="$(mktemp -d)"
    cat > "$WORKDIR/00-prereqs.sql" <<'SQL'
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE TYPE storage.buckettype AS ENUM ('STANDARD', 'ANALYTICS', 'VECTOR');
DO $do$
BEGIN
  -- Roles are cluster-wide, not per-database -- a prior restoration
  -- test in this same local Postgres instance may have already
  -- created these. IF NOT EXISTS isn't valid syntax for CREATE ROLE,
  -- so check pg_roles explicitly instead of assuming a fresh cluster.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT;
  END IF;
END
$do$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ select null::uuid $f$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $f$ select null::jsonb $f$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $f$ select null::text $f$;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE plpgsql STABLE AS $f$ begin return null::text[]; end; $f$;
SQL
    sed '/^CREATE TRIGGER/,/^$/d' "$DEST/storage-metadata.sql" | sed '/^-- Name:.*Type: TRIGGER/,/^$/d' > "$WORKDIR/storage-no-triggers.sql"
    sed 's/^CREATE SCHEMA public;/-- CREATE SCHEMA public; (already exists)/' "$DEST/schema-public.sql" > "$WORKDIR/schema-public-fixed.sql"
    # Extract only the exact 2-line FOREIGN KEY blocks (the ALTER
    # TABLE ONLY line immediately followed by its ADD CONSTRAINT ...
    # FOREIGN KEY line) -- not every "ALTER TABLE ONLY public." line,
    # which also covers PRIMARY KEY/UNIQUE constraints that must stay
    # in the main schema file, and not the trailing \unrestrict
    # meta-command, which a naive "once seen, always deferred" flag
    # caught earlier in testing and broke (it needs to stay paired
    # with its own \restrict at the top of the SAME file it runs in).
    awk -v fks="$WORKDIR/fks.sql" -v rest="$WORKDIR/schema-no-fks.sql" '
      /FOREIGN KEY/ { print prevline >> fks; print $0 >> fks; prevline=""; next }
      { if (prevline != "") print prevline >> rest; prevline=$0 }
      END { if (prevline != "") print prevline >> rest }
    ' "$WORKDIR/schema-public-fixed.sql"

    PSQL=("$PG_BIN/psql" -h "$SOCKET_DIR" -p 55433 -U postgres -d "$TESTDB" -X -v ON_ERROR_STOP=1)
    restore_ok=1
    for step in \
      "$WORKDIR/00-prereqs.sql" \
      "$DEST/auth-identity-data.sql" \
      "$WORKDIR/storage-no-triggers.sql" \
      "$WORKDIR/schema-no-fks.sql" \
      "$DEST/data-public.sql" \
      "$WORKDIR/fks.sql"
    do
      if ! "${PSQL[@]}" -f "$step" >>"$REPORT" 2>&1; then
        note "FAIL: restoration step failed on $step"
        FAILURES+=("restore-failed:$(basename "$step")")
        restore_ok=0
        break
      fi
    done

    if [ "$restore_ok" = "1" ]; then
      note "OK: all restoration steps completed without error"
      pk_count="$("${PSQL[@]}" -t -A -c "select count(*) from pg_constraint where contype='p' and connamespace::regnamespace::text in ('public','auth','storage');" 2>/dev/null)"
      fk_invalid="$("${PSQL[@]}" -t -A -c "select count(*) from pg_constraint where contype='f' and connamespace::regnamespace::text in ('public','auth','storage') and not convalidated;" 2>/dev/null)"
      note "primary keys present: ${pk_count:-ERROR}"
      note "foreign keys NOT validated: ${fk_invalid:-ERROR}"
      if [ "${fk_invalid:-1}" != "0" ]; then
        note "FAIL: one or more restored foreign keys are not validated"
        FAILURES+=("fk-not-validated")
      fi
    fi
    "${PSQL_SU[@]}" -d postgres -c "DROP DATABASE $TESTDB;" >/dev/null 2>&1 || true
    rm -rf "$WORKDIR"
  else
    note "FAIL: could not create disposable test database $TESTDB"
    FAILURES+=("create-testdb-failed")
  fi
fi

# ---------- 10. PASS/FAIL ----------
note ""
if [ "${#FAILURES[@]}" -eq 0 ]; then
  note "STATUS: PASS"
  exit 0
else
  note "FAILURES: ${FAILURES[*]}"
  note "STATUS: FAIL"
  exit 1
fi
