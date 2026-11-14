-- ============================================================
-- SIGNAL PORTAL — K1.6C: secure feedback attachments.
--
-- Revision 3 (K1.6C development implementation). Revision 2's content
-- (the two defect fixes from the architecture-review pass) is
-- preserved below; this revision adds what the approved
-- implementation round specifically required:
--
--   - A single, explicit 8-state `status` column (pending_upload /
--     uploaded / awaiting_scan / rejected / clean / promoting /
--     available / failed) replacing the earlier two-column
--     (upload_status + scan_status) split. Promotion is inherently
--     ONE linear sequence (you cannot be "promoting" before "clean",
--     "clean" before "awaiting_scan", etc.) — a single column is both
--     what was explicitly asked for and a better fit for the
--     "recoverable state transition" / "reconcile partial failures"
--     requirement: one column to re-derive from real-world state
--     after an interruption, not two that could drift apart.
--   - A BEFORE INSERT trigger enforcing collaboration_id really does
--     match the referenced feedback_id's own collaboration — a real
--     database-level backstop, not just Edge Function discipline
--     (the K1.6C security review explicitly asked for this: "Cross-
--     project associations are prevented by database constraints
--     where practical, not only Edge Function code").
--   - An AFTER INSERT trigger enforcing the 5-attachments-per-message
--     limit atomically (a check-then-insert count in application code
--     has a real race between two concurrent uploads; a trigger that
--     counts and rolls back INSIDE the same transaction as the insert
--     does not).
--   - promotion_attempted_at / promotion_error, for reconciling an
--     interrupted quarantine-to-final move (section 6's "idempotent
--     processing and reconcile partial failures").
--
-- Still NOT YET APPLIED anywhere until this file's own review passes
-- — see the K1.6C implementation report for the applied-to-dev result.
-- ============================================================

create table public.collaboration_feedback_attachments (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.collaboration_feedback(id) on delete cascade,
  -- Denormalized from feedback_id, enforced to match it by the
  -- trigger below (DB-level backstop) in addition to the Edge
  -- Function never accepting it as a client-supplied parameter in the
  -- first place (architectural primary defense — see Revision 2's
  -- notes, preserved in the K1.6C report).
  collaboration_id uuid not null references public.collaborations(id) on delete cascade,
  storage_bucket text not null check (storage_bucket in ('collaboration-attachments-quarantine', 'collaboration-attachments')),
  -- Always "{collaboration_id}/{attachment_id}.{ext}" — server-generated,
  -- same non-negotiable pattern as collaboration_assets.storage_path.
  storage_path text not null,
  -- Display only, sanitized before rendering — never used to
  -- construct storage_path or any other server-side path.
  original_filename text not null,
  mime_type text not null check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'audio/x-wav', 'audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a',
    'image/png', 'image/jpeg', 'image/webp'
  )),
  byte_size bigint not null check (byte_size > 0),
  -- The single linear lifecycle state. 'available' is the ONLY state
  -- a non-admin may ever see a row in (enforced by the SELECT policy
  -- below, not just by convention). 'rejected' and 'failed' are
  -- terminal for the object that reached them (a retry uploads a NEW
  -- attachment row, it never resurrects a rejected/failed one).
  status text not null default 'pending_upload' check (status in (
    'pending_upload',  -- signed upload URL issued; object not yet confirmed to exist
    'uploaded',        -- object confirmed present in quarantine, size verified
    'awaiting_scan',   -- queued for malware scanning (or manual admin review)
    'rejected',        -- scan/review found it unsafe -- terminal, never promoted
    'clean',           -- scan/review passed -- eligible for promotion
    'promoting',       -- cross-bucket move in progress -- transient, recoverable
    'available',       -- confirmed present in the FINAL bucket -- the only member-visible state
    'failed'           -- verification failed, or scan infra failed -- terminal unless re-uploaded
  )),
  scan_provider text null,
  scanned_at timestamptz null,
  -- For reconciling an interrupted 'promoting' state (section 6) --
  -- a scheduled reconciliation pass can find any row stuck in
  -- 'promoting' past a reasonable window and safely re-check whether
  -- the move actually completed, rather than guessing.
  promotion_attempted_at timestamptz null,
  promotion_error text null,
  -- Soft-delete, matching collaboration_assets.is_active -- an
  -- artist retracting their own attachment, or an admin removing a
  -- rejected one, never hard-deletes the Storage object or this row
  -- (audit trail survives); it just stops being selectable. Real
  -- object deletion is a separate, scheduled retention process (see
  -- the K1.6C report) that runs well after is_active is set false,
  -- never as the same operation.
  is_active boolean not null default true,
  uploaded_by uuid not null references auth.users(id),
  uploaded_at timestamptz not null default now(),
  verified_at timestamptz null,
  unique (collaboration_id, storage_bucket, storage_path)
);

alter table public.collaboration_feedback_attachments enable row level security;
revoke all on table public.collaboration_feedback_attachments from anon, authenticated;
grant select on table public.collaboration_feedback_attachments to authenticated;

-- DB-level backstop (K1.6C security review item 5): even though the
-- Edge Function never accepts collaboration_id as client input, this
-- makes "collaboration_id must match feedback_id's real collaboration"
-- a database-enforced fact, not just a promise about how the one
-- function that can write this table happens to be written today.
create function public.check_attachment_collaboration_matches_feedback()
returns trigger
language plpgsql
as $$
declare
  v_real_collaboration_id uuid;
begin
  select collaboration_id into v_real_collaboration_id
    from public.collaboration_feedback
    where id = new.feedback_id;

  if v_real_collaboration_id is null then
    raise exception 'FEEDBACK_NOT_FOUND';
  end if;
  if v_real_collaboration_id <> new.collaboration_id then
    raise exception 'COLLABORATION_MISMATCH';
  end if;

  return new;
end;
$$;

create trigger attachment_collaboration_matches_feedback
  before insert or update of feedback_id, collaboration_id
  on public.collaboration_feedback_attachments
  for each row execute function public.check_attachment_collaboration_matches_feedback();

-- Atomic 5-attachments-per-message limit (K1.6C: "enforce atomically,
-- using an appropriate database constraint, transaction, or locked
-- server-side operation"). Runs AFTER INSERT inside the SAME
-- transaction as the insert -- if two concurrent uploads for the same
-- message both pass an application-level "count < 5" check before
-- either commits, this still catches it: whichever transaction
-- commits second re-counts against the now-committed first row and
-- rolls itself back. is_active-scoped so a retracted attachment frees
-- up its slot.
create function public.check_attachment_count_limit()
returns trigger
language plpgsql
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from public.collaboration_feedback_attachments
    where feedback_id = new.feedback_id
      and is_active;

  if v_count > 5 then
    raise exception 'TOO_MANY_ATTACHMENTS';
  end if;

  return new;
end;
$$;

create trigger attachment_count_limit
  after insert on public.collaboration_feedback_attachments
  for each row execute function public.check_attachment_count_limit();

-- member visibility: the SAME author_id/is_admin_reply privacy
-- condition collaboration_feedback itself enforces (K1.6C security
-- review item 1), AND status = 'available' specifically -- every
-- other status (including 'clean', which has passed scanning but not
-- yet been physically moved) stays invisible to anyone but the
-- uploader... except there is no "uploader can see their own
-- not-yet-available upload" grant below either, deliberately: an
-- artist tracking their own upload's progress reads it through the
-- SAME admin-free, status-aware view the member policy already
-- allows once things resolve, keeping exactly one SELECT policy
-- shape for ordinary members rather than a second "but also see your
-- own pending ones" carve-out that would need its own review. Upload
-- PROGRESS (pending/uploading/scanning/etc.) is relayed to the
-- uploader's own browser directly from the Edge Function responses
-- that drive each step, not by letting them SELECT their own
-- in-flight row.
create policy "member select available attachments on messages they can see" on public.collaboration_feedback_attachments
  for select using (
    is_active
    and status = 'available'
    and exists (
      select 1
      from public.collaboration_feedback cf
      join public.collaboration_members cm
        on cm.collaboration_id = cf.collaboration_id
       and cm.user_id = auth.uid()
       and cm.status = 'active'
      where cf.id = collaboration_feedback_attachments.feedback_id
        and (cf.author_id = auth.uid() or cf.is_admin_reply)
    )
  );

-- Admins see every status (they're the ones reviewing
-- quarantined/rejected/failed rows) -- matches the existing
-- "admin select all X" pattern with no status filter.
create policy "admin select all attachments" on public.collaboration_feedback_attachments
  for select using (public.is_portal_admin());

-- Two private buckets. QUARANTINE: every attachment's upload
-- destination, always -- nothing reads from here except the scan step
-- and an admin's manual-review signed URL. FINAL: an object only ever
-- exists here once status has passed through 'clean' and the
-- quarantine-to-final move has completed -- the member-facing
-- retrieval path reads ONLY from this bucket, so there is no code
-- path that can serve an unscanned object even if the RLS check above
-- were ever bypassed by a future bug. Proposed limits approved in the
-- K1.6C brief: documents 25MB, images 15MB, audio 100MB, 5 max
-- attachments/message (enforced above, atomically, by trigger).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'collaboration-attachments-quarantine', 'collaboration-attachments-quarantine', false,
    104857600,
    array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'audio/x-wav', 'audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a',
      'image/png', 'image/jpeg', 'image/webp'
    ]
  ),
  (
    'collaboration-attachments', 'collaboration-attachments', false,
    104857600,
    array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'audio/x-wav', 'audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a',
      'image/png', 'image/jpeg', 'image/webp'
    ]
  )
on conflict (id) do nothing;
