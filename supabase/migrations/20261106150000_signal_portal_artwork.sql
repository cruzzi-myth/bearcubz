-- ============================================================
-- SIGNAL PORTAL — track artwork support.
--
-- NOT YET APPLIED. Purely additive to the Stage D schema: new
-- columns + an expanded check constraint on the existing
-- collaboration_assets table. No table is replaced.
--
-- Why not a separate artwork table: a visual asset needs exactly the
-- same identity/ownership/path/version/audit columns every other
-- asset type already has (id, collaboration_id, storage_bucket,
-- storage_path, version, uploaded_by, uploaded_at) — splitting it out
-- would mean either duplicating all of those into a second table or
-- joining back to this one for them, for no isolation benefit: the
-- new columns below (description, approval_status, is_primary_cover,
-- thumbnail_storage_path) are simply null/false for non-visual rows,
-- exactly like `byte_size` already is nullable for rows that don't
-- need it. One table stays the minimal, additive change the brief
-- asked to prefer.
-- ============================================================

alter table public.collaboration_assets
  drop constraint collaboration_assets_asset_type_check;

alter table public.collaboration_assets
  add constraint collaboration_assets_asset_type_check
  check (asset_type in (
    'audio_short', 'audio_full', 'proposal_pdf',
    'visual_image', 'track_cover', 'alternate_cover', 'visual_concept'
  ));

alter table public.collaboration_assets
  add column description text null,
  add column approval_status text null
    check (approval_status in ('pending', 'approved', 'rejected')),
  add column is_primary_cover boolean not null default false,
  -- Same bucket as storage_path, a server-generated sibling object —
  -- never a second asset row, so the primary-cover uniqueness
  -- constraint below only ever has to reason about one row per
  -- artwork.
  add column thumbnail_storage_path text null;

-- At most one ACTIVE primary cover per collaboration — enforced by
-- the database, not just application logic. A partial unique index
-- rather than a plain unique constraint, since only active rows
-- marked as the primary cover need to be mutually exclusive; a
-- retired (is_active = false) former cover doesn't block a new one.
create unique index collaboration_assets_one_primary_cover
  on public.collaboration_assets (collaboration_id)
  where is_primary_cover and is_active;

-- Approval status is never client-settable: RLS on this table still
-- grants `authenticated` select only (unchanged from Stage D), so an
-- artist has no write path to this column at all, regardless of what
-- any future UI might send. Only portal-admin-manage-collaboration's
-- new 'update_asset' op (service-role, admin-checked) can change it.
