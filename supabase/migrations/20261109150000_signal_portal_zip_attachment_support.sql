-- ============================================================
-- SIGNAL PORTAL — K1.6E.1 section 5: ZIP archive attachment support.
--
-- No ZIP addendum document or ZIP-handling code existed anywhere in
-- this repository before this migration (confirmed by searching the
-- whole tree) — this is a genuinely new capability, not a fix to an
-- existing one.
--
-- 'application/zip' joins the existing 'document' category's limit
-- (25MB, unchanged) rather than getting a new, larger allowance —
-- "subject to existing storage limits," per the brief. The real
-- malware-clearance distinction for ZIP lives entirely in
-- malwareScan.ts, which routes this MIME type to Cloudmersive's
-- ADVANCED scan endpoint (recursive archive unpacking, with
-- allowUnsafeArchives/allowExecutables/allowScripts/allowMacros/
-- allowPasswordProtectedFiles all explicitly false) instead of the
-- basic endpoint this system otherwise uses — the basic endpoint's
-- own documentation makes no archive-safety claims at all, so using
-- it for ZIP would risk exactly what the brief warns against:
-- claiming a ZIP is malware-cleared without the scanning service
-- actually having evaluated its contents.
-- ============================================================

alter table public.collaboration_feedback_attachments
  drop constraint collaboration_feedback_attachments_mime_type_check;

alter table public.collaboration_feedback_attachments
  add constraint collaboration_feedback_attachments_mime_type_check
  check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'audio/x-wav', 'audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a',
    'image/png', 'image/jpeg', 'image/webp',
    'application/zip'
  ));
