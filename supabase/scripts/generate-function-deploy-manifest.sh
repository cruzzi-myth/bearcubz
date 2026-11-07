#!/usr/bin/env bash
# Stage I3M: (re)generates approved-functions.manifest. Each of the 9
# approved SIGNAL PORTAL functions gets ONE combined SHA-256 computed
# over its own index.ts PLUS every _shared/*.ts file it actually
# imports, concatenated in a fixed, sorted order -- not just a hash of
# the function's own file alone. This is deliberate: a change to a
# shared module (e.g. clients.ts) must invalidate the hash of every
# function that depends on it, not just the file that was literally
# edited, since all nine are bundled together with their shared
# dependencies at deploy time. The dependency list below was
# determined once, by hand, from each function's actual import lines
# (reviewed in Stage I3L/I3M) -- it is NOT re-derived automatically at
# hash-check time, so a tampered import statement alone can't widen or
# narrow what gets hashed without this file also being reviewed.
#
# Run this only after a function or shared module change has been
# reviewed and is ready to be re-approved. It does not deploy anything.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FUNCTIONS_DIR="$REPO_ROOT/supabase/functions"
OUT="$REPO_ROOT/supabase/scripts/approved-functions.manifest"

# function-name:shared-file,shared-file,...  (sorted, comma-separated, no spaces)
DEPENDENCY_MAP="
portal-request-access:clients.ts,cors.ts
portal-signed-url:clients.ts,cors.ts,signedUrlRequest.ts
portal-submit-feedback:clients.ts,cors.ts
portal-admin-create-invitation:clients.ts,cors.ts,invitationValidation.ts,requireAdmin.ts
portal-admin-list-invitations:clients.ts,cors.ts,requireAdmin.ts
portal-admin-manage-collaboration:clients.ts,cors.ts,requireAdmin.ts
portal-admin-reply-feedback:clients.ts,cors.ts,requireAdmin.ts
portal-admin-request-upload-url:clients.ts,cors.ts,requireAdmin.ts
portal-admin-confirm-upload:clients.ts,cors.ts,requireAdmin.ts,uploadLifecycle.ts
"

: > "$OUT"
echo "# SIGNAL PORTAL approved Edge Function deployment manifest (Stage I3M)" >> "$OUT"
echo "# format: <combined-sha256>  <function-name>  <own-file-sha256>  <shared-deps>" >> "$OUT"
echo "# combined hash = sha256(index.ts || each shared dep, in the order listed)" >> "$OUT"

for entry in $DEPENDENCY_MAP; do
  name="${entry%%:*}"
  deps="${entry#*:}"
  own_file="$FUNCTIONS_DIR/$name/index.ts"
  [ -f "$own_file" ] || { echo "generate-function-deploy-manifest: missing $own_file" >&2; exit 1; }

  own_hash="$(shasum -a 256 "$own_file" | awk '{print $1}')"

  files=("$own_file")
  IFS=',' read -ra dep_list <<< "$deps"
  for dep in "${dep_list[@]}"; do
    dep_file="$FUNCTIONS_DIR/_shared/$dep"
    [ -f "$dep_file" ] || { echo "generate-function-deploy-manifest: missing shared dep $dep_file" >&2; exit 1; }
    files+=("$dep_file")
  done

  combined_hash="$(cat "${files[@]}" | shasum -a 256 | awk '{print $1}')"
  printf '%s  %s  %s  %s\n' "$combined_hash" "$name" "$own_hash" "$deps" >> "$OUT"
done

echo "generate-function-deploy-manifest: wrote $(grep -c '^[0-9a-f]' "$OUT") entries to $OUT" >&2
