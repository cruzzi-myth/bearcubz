# SIGNAL PORTAL — K1.6F Architecture Audit

Audit date: 2026-11-09. Scope: everything introduced across K1.6B through K1.6E.1, read directly from the current repository and the live `signal-portal-dev` (`gcbonlvbgyhsgfayvlvz`) Supabase project. Production (`drsidtagxezznqviupsr`) was inspected read-only for comparison only — see `k16f-production-release-plan.md` for the diff.

## 1. React frontend

- `portal-app/src/pages/TransmissionChamberPage.tsx` — the Transmission Chamber: message thread, `AttachmentComposer`, `AttachmentList`. Wires `useAttachmentUpload`, `useMessageAttachments`.
- `portal-app/src/components/AttachmentComposer.tsx` — file picker + drag-and-drop staging area. `ACCEPT` is derived from `ATTACHMENT_RULES` (not hardcoded), so a new category added there automatically updates the file picker's accept list.
- `portal-app/src/components/AttachmentList.tsx` — renders attachments under a message. Branches on `status`: only `'available'` ever requests a signed URL and renders real content (audio/image/PDF via `PdfCanvasViewer`/generic download); every other status renders `StatusOnlyAttachment` (metadata + a status label, for `'rejected'` also the rejection reason) and never calls `useAttachmentSignedUrl` at all.
- `portal-app/src/lib/attachmentRules.ts` — client-side-only MIME/size validation, mirrors (never substitutes for) the server-side rules. Categories: `document` (25MB), `image` (15MB), `audio` (100MB), `zip` (25MB).
- `portal-app/src/hooks/useAttachmentUpload.ts`, `useAttachmentSignedUrl.ts`, `useMessageAttachments.ts` — the upload lifecycle, signed-URL minting, and message-attachment read hooks.
- `portal-app/src/features/admin/components/AttachmentsTab.tsx` — the administrator review queue: Project/Status filters (status options derived from `state.projects`, never hardcoded artist identities), a table with separate **Status** and **Security** columns, Approve/Reject (only rendered when `status==='clean'`), Retry Scan (only when `security_status==='error'`), and `SafePreview` (only ever renders for `status==='available'`).
- `portal-app/src/features/admin/hooks/useAdminAttachments.ts`, `services/adminApi.ts` — the admin-side data join (attachments + their parent feedback + the real collaborations list) and the only place that calls the admin Edge Functions.
- `portal-app/src/components/PdfCanvasViewer.tsx` — shared PDF.js canvas viewer (page nav, zoom, Fit Width/Page), used by both the artist Proposal Chamber and the admin preview.

## 2. Supabase Edge Functions

All functions are `supabase/functions/<name>/index.ts`. Attachment-related functions, in lifecycle order:

| Function | Role |
|---|---|
| `portal-request-attachment-upload-url` | Authorizes the upload (derives `collaboration_id` only from a RLS-gated read of the target `feedback_id`, requires `feedback.author_id === caller`), validates MIME/size against `CATEGORY_RULES`, enforces the 5-attachments-per-message limit (via a DB trigger, not a check-then-insert race), signs a quarantine upload URL. |
| `portal-confirm-attachment-upload` | Verifies the object genuinely exists + exact byte-size match, downloads the real bytes, checks file signature (`attachmentSafety.ts`), then hands off to `claimAndRunScan`. |
| `portal-admin-review-attachment` | Administrator approve/reject. Gate: can only act when `status==='clean' AND security_status==='clean'`. Approve sets `review_status:'approved'` and attempts promotion (non-atomic, tracked via `promotion_error`); reject sets `review_status:'rejected'` + stores the reason. |
| `portal-admin-retry-attachment-scan` | Admin-only retry for a `security_status==='error'` row. Not eligible for `'infected'` (final) or `'scanning'` (see the stuck-state gap in the security audit). |
| `portal-attachment-signed-url` | Mints a short-lived (5 min) signed URL. Explicitly re-checks `status==='available' AND security_status==='clean' AND review_status==='approved' AND storage_bucket===FINAL_BUCKET` in the function body — never relies on RLS alone. |
| `portal-admin-cleanup-quarantine` | Deletes (from Storage only, row kept with `is_active=false`) abandoned (7-day) and rejected (30-day) quarantine objects. Callable by a real admin or the dev `pg_cron` job (see §11 "Scheduled cleanup"). |
| `portal-admin-reconcile-attachment-promotion` | Recovery path for a row stuck in `status==='promoting'` after an interrupted cross-bucket move. |

Shared modules (`supabase/functions/_shared/`): `attachmentSafety.ts` (file-signature checks, EICAR detection), `malwareScan.ts` (the real Cloudmersive integration), `scanOrchestrator.ts` (the atomic claim-and-scan function — the one place `security_status` is ever written), `requireAdminOrSystem.ts` (dual admin-JWT / cron-secret authorization), `requireAdmin.ts`, `clients.ts`, `cors.ts`.

## 3. Database migrations

Eight migrations, all applied to dev only (none to production):

1. `20261109040000_signal_portal_feedback_attachments.sql` — `collaboration_feedback_attachments` table, both storage buckets, the member/admin SELECT policies, the two triggers (collaboration-consistency, 5-attachment limit).
2. `20261109063400_signal_portal_attachment_review.sql` — `rejection_reason` column, the "uploader sees own row" SELECT policy.
3. `20261109071500_signal_portal_attachment_owner_policy_fix.sql` — **security fix**: scoped that policy to require active membership (a real gap found during K1.6D's own work — see the security audit).
4. `20261109090000_signal_portal_attachment_scanning.sql` — `security_status`, `security_scan_detail`, `review_status` columns; the `attachment_available_requires_clearance` DB-level CHECK constraint; `pg_cron`/`pg_net` extensions; the dev-only daily cleanup job.
5. `20261109091500_signal_portal_cron_secret_fix.sql`, `20261109092000_signal_portal_cron_header_fix.sql` — two real fixes to the cron job's own authentication, found during K1.6E's own end-to-end verification (see the security audit).
6. `20261109150000_signal_portal_zip_attachment_support.sql`, `20261109151500_signal_portal_zip_storage_mime_fix.sql` — `application/zip` added to both the app-level `mime_type` CHECK and (a real, separately-discovered gap) Storage's own `allowed_mime_types` bucket config.

## 4. Row-Level Security policies

`collaboration_feedback_attachments`: no INSERT/UPDATE/DELETE grant to `anon`/`authenticated` at all — every write goes through a service-role Edge Function. Three SELECT policies: member-sees-available (scoped through the parent feedback's author/admin-reply relationship, not just collaboration membership), admin-sees-all, uploader-sees-own-row-regardless-of-status (membership-scoped, per the fix above).

## 5. Storage buckets

Two private buckets (`public: false`): `collaboration-attachments-quarantine` (every upload's destination) and `collaboration-attachments` (final, reached only via admin-approved promotion). Both buckets' `allowed_mime_types` now include every category in `CATEGORY_RULES` including `application/zip`.

## 6. Authentication

Unchanged from prior stages — Supabase Auth, `is_portal_admin()` RPC for admin checks, `requireAdmin()`/`requireAdminOrSystem()` shared helpers. One new dev-only identity: `SIGNAL_PORTAL_SYSTEM_UID`, a real `auth.users` row created solely to attribute cron-triggered audit-log entries honestly (never added to `portal_admins`).

## 7. Collaboration membership

Unchanged schema (`collaboration_members`). Reused, not duplicated, by every attachment-authorization check.

## 8. Attachment lifecycle

`status` (physical location): `pending_upload → uploaded → awaiting_scan → clean → promoting → available`, with `rejected`/`failed` as terminal off-ramps. `security_status` (malware clearance, orthogonal): `pending → scanning → clean|infected|error`. `review_status` (administrator decision, orthogonal): `pending → approved|rejected`. A row can only ever reach `status='available'` when `security_status='clean' AND review_status='approved'` — enforced by a DB CHECK constraint, not just application logic.

## 9. Malware scanning

Real integration: Cloudmersive's Virus Scan API (basic endpoint for ordinary files, Advanced endpoint specifically for ZIP — the only one documenting archive-safety policy options). EICAR-fixture detection is a separate, free, local, zero-network check that runs first. See `k16f-scanner-operations.md` for the full operational detail, including the two real architectural gaps found during this audit (stuck-`'scanning'`-state recovery, and oversized-file retention — both in `k16f-security-audit.md`/`k16f-scanner-operations.md`).

## 10. Administrator review

`portal-admin-review-attachment` + `AttachmentsTab.tsx`. Structurally cannot approve an unscanned or infected file — the gate checks `security_status==='clean'` before any decision is even considered, independent of what the administrator clicks.

## 11. Scheduled cleanup

`pg_cron` (job `signal-portal-dev-cleanup-quarantine`, daily 03:00 UTC) + `pg_net`, calling `portal-admin-cleanup-quarantine` with a dedicated, low-privilege `SIGNAL_PORTAL_CRON_SECRET` (never the project's real service-role key — an earlier design that did try to reuse it was found, during live verification, to be using an ambiguous credential and was replaced). Verified firing for real by manually invoking the exact scheduled SQL once. **Dev-only — not enabled for production.**

## 12. Audit logging

`portal_admin_audit_log`, reused (not duplicated) for every attachment action: upload confirmation, scan result, administrator decision, promotion, rejection, cleanup. Cron-triggered cleanup entries are honestly attributed to the dedicated system identity, never to a human admin's uid.

---

No duplicate systems were created at any point across K1.6B–K1.6E.1 or during this audit — every new capability extends the single existing `collaboration_feedback_attachments` table, the single existing audit log, and the single existing admin-authorization pattern.
