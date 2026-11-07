-- ============================================================
-- SIGNAL PORTAL — private storage buckets.
--
-- NOT YET APPLIED. All three buckets are created non-public and with
-- server-enforced size/type limits as a second layer behind the
-- Edge Function checks in portal-admin-request-upload-url — Supabase
-- itself will reject an upload exceeding these limits or outside the
-- allowed MIME types even if the Edge Function's own check were ever
-- bypassed or had a bug.
--
-- No policy is added here granting anon or authenticated anything on
-- storage.objects for these buckets, and storage.objects already has
-- RLS enabled by default on every Supabase project — the absence of
-- a matching policy is the control. Every read and write goes through
-- a service-role Edge Function (which has bypassrls) minting a short-
-- lived signed URL; there is no direct client path to any object in
-- these three buckets, by construction, not by convention.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'collaboration-audio', 'collaboration-audio', false,
    104857600, -- 100 MB
    array['audio/mp4', 'audio/x-m4a', 'audio/mpeg', 'audio/wav', 'audio/x-wav']
  ),
  (
    'collaboration-proposals', 'collaboration-proposals', false,
    26214400, -- 25 MB
    array['application/pdf']
  ),
  (
    'collaboration-visuals', 'collaboration-visuals', false,
    15728640, -- 15 MB
    array['image/jpeg', 'image/png', 'image/webp']
  )
on conflict (id) do nothing;
