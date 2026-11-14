# SIGNAL PORTAL — K1.6H.4 Database Security Verification

Verified 2026-11-12, against the freshly-replayed rehearsal schema (`k16h4-migration-replay.md`) — not the already-running dev project, so this proves the schema is secure **as deployed from scratch**, not merely as it currently sits after weeks of incremental dev changes.

## Attack-oriented tests (brief section 7, all 10 performed for real)

Synthetic fixtures: 2 collaborations, 2 active artist members (one per collaboration), 1 revoked member, 1 unassigned user, 1 admin. Impersonation via real `SET ROLE`/`SET LOCAL request.jwt.claim.sub` session variables against the real RLS policies — not a mocked authorization layer.

| # | Attack | Result |
|---|---|---|
| 1 | Anonymous access to private collaborations | **Denied at the GRANT level** — `permission denied for table collaborations` (stronger than an RLS row-filter; `anon` has no SELECT grant on this table at all) |
| 2 | Artist A accessing Artist B's collaboration | **Denied** — 0 rows visible |
| 3 | Artist A reading Artist B's feedback | **Denied** — 0 rows visible |
| 4 | Artist A requesting Artist B's membership/asset rows | **Denied** — 0 rows visible |
| 5 | Artist A directly modifying scan evidence | **Denied at the GRANT level** — `permission denied for table collaboration_feedback_attachments` |
| 6 | Artist A directly approving an attachment (`review_status`) | **Denied at the GRANT level** — same table, same denial |
| 7 | Artist A changing collaboration membership (adding themself to Collab B) | **Denied at the GRANT level** — `permission denied for table collaboration_members` |
| 8 | Unassigned user accessing private materials | **Denied** — 0 collaborations visible |
| 9 | Revoked user requesting access | **Denied** — 0 rows visible, consistent with the existing revoked-membership check |
| 10 | Direct database UPDATE bypassing security review (`collaboration_assets.security_status`) | **Denied at the GRANT level** — `permission denied for table collaboration_assets`, confirmed even for the admin identity acting outside the service-role claim path |

Every unauthorized operation failed. Four of the ten (5, 6, 7, 10) failed at the **table-grant level**, not merely an RLS policy miss — the same defense-in-depth property documented throughout this entire engagement, now re-confirmed on a from-scratch schema rather than assumed to still hold.

## Asset activation gate — full positive and negative suite (brief section 12)

Performed against a real synthetic asset row, using the real `claim_asset_for_scan`/`enforce_portal_asset_security` functions — not mocked:

| Case | Result |
|---|---|
| New asset defaults (`security_required=true`, `security_status='pending'`) | Confirmed |
| Activation attempt with **no scan evidence** | **Blocked** — `ASSET_SECURITY_NOT_CLEARED` |
| Real atomic claim (`claim_asset_for_scan`) | Succeeded, returned a fresh `scan_request_id` |
| Activation attempt with evidence whose **checksum does not match** the row's `file_sha256` | **Blocked** — same error, evidence correctly rejected |
| Activation attempt with **complete, matching evidence but no admin security approval** | **Blocked** |
| Activation attempt with **matching evidence + admin approval** | **Succeeded** — `upload_status='ready'` |
| Artistic approval (`approval_status`) after the above | **Unchanged, still `pending`** — confirms the security release never touches it |
| Activation attempt with verdict **`infected`**, even with admin approval forced | **Blocked** |
| Activation attempt with verdict **`clean` but `complete:false`** (an incomplete scan dishonestly marked clean at the status-column level) | **Blocked** — the JSONB evidence's own internal consistency is checked, not just the top-level status column |

Byte-size and attempt-ID mismatch were not run as separate cases — they are checked by the exact same `valid_portal_scan_evidence` code path already proven to reject a checksum mismatch, so a separate test would exercise no new logic; noted here rather than silently assumed.

## Scan-lease mechanics (brief section 15, database level)

| Case | Result |
|---|---|
| Normal claim | Succeeded, `attempt_count=1` |
| Concurrent re-claim while still `scanning` | **Blocked** — 0 rows returned |
| Automatic reclaim at the attempt cap (3) | **Blocked** — 0 rows returned |
| Manual admin retry at/past the cap | **Succeeded** — bypasses the cap as designed, `attempt_count=4` |
| Attempt to mark `status='available'` without `security_status='clean' AND review_status='approved'` | **Blocked** — `attachment_available_requires_clearance` CHECK constraint fired |

## What this does not re-test

RLS/authorization logic itself was not modified by any stage since K1.6H.2 — this is a **fresh-schema re-confirmation**, not a claim that something was broken and fixed. No new vulnerability was found.
