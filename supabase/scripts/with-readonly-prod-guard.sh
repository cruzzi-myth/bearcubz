#!/usr/bin/env bash
# Stage I3A: a SEPARATE guard from with-dev-guard.sh, deliberately
# inverted — this is the ONLY script in this repo permitted to target
# the production ref, and it exists to make that exception as narrow
# as possible rather than bypassing the dev guard. Unlike
# with-dev-guard.sh (which wraps an arbitrary already-trusted
# command), this guard requires the EXACT invocation shape
#   npx supabase <verb> <subcommand> ... --remote=<ref> ...
# and verifies $1/$2 literally (not just scanning for tokens anywhere
# in the args) — an earlier draft of this guard checked token
# positions without confirming the binary being run was actually
# "npx supabase", which would have let an unrelated command through
# as long as two of its arguments happened to read like an allowed
# subcommand. Fixed before this script was ever used for a real
# inspection.
set -euo pipefail

PRODUCTION_REF="drsidtagxezznqviupsr"

if [ "$#" -lt 4 ]; then
  echo "[readonly-prod-guard] REFUSED: expected at least 'npx supabase <verb> <subcommand> ...'. Command: $*" >&2
  exit 1
fi

if [ "$1" != "npx" ] || [ "$2" != "supabase" ]; then
  echo "[readonly-prod-guard] REFUSED: this guard only runs 'npx supabase ...' — refusing to exec an unrelated command. Got: $1 $2" >&2
  exit 1
fi

verb="$3"
subcommand="$4"

target_ref=""
for arg in "$@"; do
  case "$arg" in
    --remote=*) target_ref="${arg#--remote=}" ;;
  esac
done

if [ "$target_ref" != "$PRODUCTION_REF" ]; then
  echo "[readonly-prod-guard] REFUSED: this script only runs commands explicitly targeting --remote=$PRODUCTION_REF. Got target: '${target_ref:-<none>}'. Command: $*" >&2
  exit 1
fi

if [ "${SIGNAL_PORTAL_READONLY_PROD_CONFIRMED:-}" != "1" ]; then
  echo "[readonly-prod-guard] REFUSED: SIGNAL_PORTAL_READONLY_PROD_CONFIRMED=1 was not set. Deliberate second gate for the one script allowed to target production at all." >&2
  exit 1
fi

# The allowlist. Every entry here was individually verified (Stage
# I3A/I3B/I3C/I3D) to have no write path: no migration application, no
# config push, no secrets set, no function deploy, no `supabase link`,
# no backup restore, no storage upload.
case "$verb $subcommand" in
  "projects list") ;;
  "migration list") ;;
  "config diff") ;;
  "inspect db") ;;
  "storage ls") ;;
  "backups list") ;;
  "secrets list")
    # Stage I3G: Supabase's documented behavior for `secrets list` is
    # names + digests only -- it never returns a plaintext secret
    # value (that's the whole point of it being write-only once set).
    # Allowlisted on that basis, same read-only-by-construction
    # standard as every other non-`db query` entry above.
    ;;
  "storage cp")
    # Stage I3D: `storage cp` is bidirectional (uploads AND downloads
    # through the identical subcommand) — unlike every other entry in
    # this allowlist, the safety of a given invocation depends entirely
    # on argument VALUES, not just which subcommand was named. Only the
    # download direction (a Storage path as source, a local filesystem
    # path as destination) is permitted here.
    if ! printf '%s\n' "$@" | grep -qx -- '--experimental'; then
      echo "[readonly-prod-guard] REFUSED: 'storage cp' against production requires --experimental explicitly (this guard mirrors the CLI's own requirement, not just trusts it was set). Command: $*" >&2
      exit 1
    fi

    for arg in "$@"; do
      case "$arg" in
        --cache-control*|--content-type*|--jobs*|-j|-j=*)
          echo "[readonly-prod-guard] REFUSED: 'storage cp' against production may not use upload-oriented flags ($arg). Command: $*" >&2
          exit 1
          ;;
      esac
    done

    positional=()
    for arg in "${@:5}"; do
      case "$arg" in
        -*) ;;
        *) positional+=("$arg") ;;
      esac
    done

    if [ "${#positional[@]}" -ne 2 ]; then
      echo "[readonly-prod-guard] REFUSED: 'storage cp' against production requires exactly one source and one destination argument, got ${#positional[@]}. Command: $*" >&2
      exit 1
    fi

    cp_src="${positional[0]}"
    cp_dst="${positional[1]}"

    case "$cp_src" in
      ss:///*) ;;
      *)
        echo "[readonly-prod-guard] REFUSED: 'storage cp' against production requires the SOURCE to be a Storage path (ss:///...) — refusing anything else, including a bare upload shape. Command: $*" >&2
        exit 1
        ;;
    esac

    case "$cp_dst" in
      ss:///*)
        echo "[readonly-prod-guard] REFUSED: 'storage cp' against production requires the DESTINATION to be a local filesystem path, not another Storage path (ss:///...) — this would be upload or bucket-to-bucket, never download. Command: $*" >&2
        exit 1
        ;;
    esac
    ;;
  "db query")
    # Stage I3B: `db query` can run ANY SQL, including writes — it is
    # not read-only by construction the way the entries above are.
    # Two independent guarantees are required before this guard will
    # run it: (1) the Postgres-enforced --read-only flag (wraps the
    # statement in a read-only transaction; Postgres itself rejects
    # any write inside it, not just the CLI), and (2) this guard's own
    # SQL-text lint on the --file content, requiring it to be a single
    # SELECT/WITH statement with no write-shaped keyword present
    # anywhere. Neither guarantee alone was trusted as sufficient.
    has_read_only_flag=0
    sql_file=""
    for arg in "$@"; do
      case "$arg" in
        --read-only) has_read_only_flag=1 ;;
        --file=*) sql_file="${arg#--file=}" ;;
      esac
    done

    if [ "$has_read_only_flag" -ne 1 ]; then
      echo "[readonly-prod-guard] REFUSED: 'db query' against production requires --read-only (a Postgres-enforced read-only transaction, not just a CLI convention). Command: $*" >&2
      exit 1
    fi

    if [ -z "$sql_file" ] || [ ! -f "$sql_file" ]; then
      echo "[readonly-prod-guard] REFUSED: 'db query' against production requires --file=<path> pointing at a real, reviewable .sql file — no inline SQL accepted for this guard. Command: $*" >&2
      exit 1
    fi

    sql_content="$(cat "$sql_file")"
    # Strip SQL line comments and blank lines, then lowercase a copy
    # for keyword matching. Flattened to a single line (tr '\n' ' ')
    # BEFORE extracting the first word — multi-line SQL otherwise made
    # `awk '{print $1}'` print the first word of every line, not just
    # the statement's actual first word (found and fixed before this
    # guard was used for a real multi-line query).
    sql_stripped="$(echo "$sql_content" | sed -E 's/--.*$//' | grep -v '^[[:space:]]*$' || true)"
    sql_lower="$(echo "$sql_stripped" | tr '[:upper:]' '[:lower:]')"
    sql_flat="$(echo "$sql_lower" | tr '\n' ' ')"
    first_word="$(echo "$sql_flat" | sed -E 's/^[[:space:]]+//' | awk '{print $1}')"

    if [ "$first_word" != "select" ] && [ "$first_word" != "with" ]; then
      echo "[readonly-prod-guard] REFUSED: $sql_file does not start with SELECT/WITH (starts with '$first_word'). Command: $*" >&2
      exit 1
    fi

    semicolon_count="$(echo "$sql_stripped" | tr -cd ';' | wc -c | tr -d ' ')"
    if [ "$semicolon_count" -gt 1 ]; then
      echo "[readonly-prod-guard] REFUSED: $sql_file contains more than one statement (multiple ';'). Only a single SELECT/WITH statement is allowed. Command: $*" >&2
      exit 1
    fi

    for kw in insert update delete drop alter create truncate grant revoke call copy vacuum reindex 'lock ' execute 'do ' merge; do
      if echo "$sql_lower" | grep -qw "${kw% }"; then
        echo "[readonly-prod-guard] REFUSED: $sql_file contains the write-shaped keyword '$kw'. Command: $*" >&2
        exit 1
      fi
    done
    ;;
  *)
    echo "[readonly-prod-guard] REFUSED: '$verb $subcommand' is not on the read-only allowlist (projects list, migration list, config diff, inspect db, storage ls, storage cp [download direction only], backups list, db query). Command: $*" >&2
    exit 1
    ;;
esac

# Belt-and-suspenders: refuse outright if any write-shaped flag or
# subcommand word appears anywhere in the command, even though the
# verb/subcommand above already matched the allowlist — defends
# against a future edit accidentally widening the case statement
# incorrectly, or an allowed verb somehow being called with a
# write-shaped flag it doesn't normally take.
for arg in "$@"; do
  case "$arg" in
    push|up|deploy|set|reset|link|--yes|apply)
      echo "[readonly-prod-guard] REFUSED: write-shaped token '$arg' present. Command: $*" >&2
      exit 1
      ;;
  esac
done

echo "[readonly-prod-guard] target verified: --remote=$target_ref, '$verb $subcommand' is on the read-only allowlist. Proceeding: $*" >&2
exec "$@"
