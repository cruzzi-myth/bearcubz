-- ============================================================
-- SIGNAL PORTAL — K1.6E.1 section 5 fix: ZIP support also required
-- updating Supabase Storage's OWN bucket-level allowed_mime_types
-- list, independent of this app's `mime_type` CHECK constraint
-- (already updated in 20261109150000). Storage itself rejected the
-- real test upload with a 415 before the Edge Function layer ever
-- saw it — found via this stage's own real end-to-end verification,
-- not a simulated/assumed gap.
-- ============================================================

update storage.buckets
set allowed_mime_types = array_append(allowed_mime_types, 'application/zip')
where id in ('collaboration-attachments-quarantine', 'collaboration-attachments')
  and not ('application/zip' = any(allowed_mime_types));
