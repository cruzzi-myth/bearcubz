# SIGNAL PORTAL — K1.6G ZIP Archive Security Hardening

Implementation date: 2026-11-09.

## Design: local validation supplements, never replaces, the real scanner

`supabase/functions/_shared/zipValidation.ts` is a dependency-free ZIP central-directory metadata validator. It deliberately **never decompresses or extracts anything** — it only reads the End-Of-Central-Directory record (`PK\x05\x06`) and Central-Directory-File-Header entries (`PK\x01\x02`). It runs in `portal-confirm-attachment-upload` **before** the file reaches Cloudmersive's Advanced (ZIP-aware) scanning endpoint — a structurally-unsafe archive is rejected for free, without spending a real scanner call, while anything that passes local validation still goes on to the real scan unchanged. Local validation is a pre-filter, not a substitute for the real scan.

## Limits enforced (`DEFAULT_ZIP_LIMITS`)

| Limit | Value | Rejection reason |
|---|---|---|
| Entry count | 100 | `ZIP_TOO_MANY_ENTRIES` |
| Encrypted entries | none allowed | `ZIP_ENCRYPTED_ENTRY` |
| Compression method | stored (0) or deflate (8) only | `ZIP_UNSUPPORTED_COMPRESSION_METHOD` |
| Declared uncompressed size | 100 MB | `ZIP_DECLARED_SIZE_TOO_LARGE` |
| Expansion ratio | 20:1 | `ZIP_EXPANSION_RATIO_TOO_HIGH` |
| Unsafe paths (absolute, traversal, control chars) | rejected | `ZIP_UNSAFE_PATH` |
| Duplicate entry names | rejected | `ZIP_DUPLICATE_ENTRY_NAME` |
| Executable/script extensions (`.exe`/`.dll`/`.bat`/`.sh`/…) | rejected | `ZIP_CONTAINS_EXECUTABLE_OR_SCRIPT` |
| Nested archives (`.zip`/`.rar`/`.7z`/…) | rejected — "reject unvalidated nested archives" per the brief | `ZIP_CONTAINS_NESTED_ARCHIVE` |
| ZIP64 indicator present | rejected conservatively (unsupported, not parsed) | `ZIP_UNSUPPORTED_ZIP64` |
| Malformed structure | rejected (no EOCD, empty, truncated/bad header) | `ZIP_MALFORMED_*` |

A rejection at this stage sets `status='failed'`, logs an audit entry, and returns `422 VERIFICATION_FAILED` with the specific reason code — never reaching the real scanner call.

## Advanced-endpoint policy (unchanged from K1.6E.1, re-verified this stage)

Cloudmersive's Advanced endpoint (`.../virus/scan/file/advanced`) is still used for any ZIP that passes local validation, with all archive-safety policy headers sent as `false` (`allowUnsafeArchives`, `allowExecutables`, `allowScripts`, `allowPasswordProtectedFiles`, `allowMacros`, etc.), and the response's 10 `Contains*` flags are still checked explicitly as defense in depth — never trusting the policy headers alone to have been honored.

## Bug found and fixed before any test was run

Code review (not a failing test) found a sign bug in `readUint32LE`: `bytes[offset] | ... | (bytes[offset+3] << 24 >>> 0) >>> 0` applied the final `>>> 0` to only the last OR-term, not the whole combined expression, due to operator precedence. Since JavaScript's `|` always returns a signed int32 regardless of operand signedness, a 32-bit field with bit 31 set (e.g. a declared size near 2³¹–2³²) would read back negative. Fixed by wrapping the entire combined expression in one set of parentheses before the single trailing `>>> 0`; two now-redundant per-term `>>> 0` call sites elsewhere in the file (relying on the old, buggy behavior) were cleaned up at the same time.

## Real verification performed

- **Malformed structure**: a genuinely malformed ZIP (truncated central directory) uploaded through the real `portal-confirm-attachment-upload` pipeline was caught locally — `422`, `ZIP_MALFORMED_CENTRAL_DIRECTORY` (or the appropriate specific reason), no scanner call made.
- **Password-protected ZIP**: the real `sample-protected.zip` fixture (created via `zip -e` in K1.6E.1) is now caught locally (`422`, `ZIP_ENCRYPTED_ENTRY`) rather than reaching the real Cloudmersive Advanced endpoint as it did before this stage. This is a genuine improvement (caught for free, zero scanner cost) and the corresponding test (`k16e1.mjs`) was updated to assert the new, correct behavior rather than the stale remote-rejection expectation.
- **Valid ZIP**: the real `sample.zip` fixture still passes local validation and proceeds to a genuine Cloudmersive Advanced scan, which reports clean, confirming local validation does not false-positive on an ordinary small archive.

## Permanent test coverage

- `tests/security/zipValidation.test.mjs` — 23 real assertions, embedded minimal real-ZIP builder (no external zip tool dependency), covering every rejection reason above plus the "exactly 100 entries still passes" boundary case and a declared-expansion-ratio zip-bomb-shape test. All passing.
- `tests/integration/scenarios/k16e1.mjs` / `k16g.mjs` — real end-to-end coverage via the deployed Edge Function (malformed ZIP, password-protected ZIP).
