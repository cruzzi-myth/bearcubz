-- ============================================================
-- SIGNAL PORTAL — core schema, RLS, and the two SECURITY DEFINER
-- functions the invitation flow and admin checks depend on.
--
-- NOT YET APPLIED to any environment. Reviewable migration only —
-- see Stage D completion report for what has and hasn't run.
--
-- Mirrors this project's existing security posture (moon_racer_votes):
-- every table is RLS-enabled, nothing is granted to anon/authenticated
-- unless a specific, narrow policy says so, and every SECURITY
-- DEFINER function is created with `revoke ... from public` followed
-- by an explicit `grant ... to authenticated` — Supabase's default
-- grants to anon/authenticated on new functions don't go away just
-- because the table-level grant was revoked (the same gotcha the
-- vote_results_tighten_grants migration exists to fix).
-- ============================================================

-- ---------- artist_profiles ----------
create table public.artist_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text not null,
  bio text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.artist_profiles enable row level security;
revoke all on table public.artist_profiles from anon, authenticated;
grant select on table public.artist_profiles to authenticated;

create policy "self select" on public.artist_profiles
  for select using (user_id = auth.uid());

-- ---------- collaborations ----------
create table public.collaborations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  -- Internal label only. A 'draft' collaboration (the default) is
  -- never visible to any artist — see collaborations RLS below —
  -- precisely so recording a working project name here never implies
  -- the named artist has agreed to anything.
  artist_display_name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'invited', 'active', 'completed', 'archived')),
  bpm numeric null,
  musical_key text null,
  genre_tags text[] null,
  notes text null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.collaborations enable row level security;
revoke all on table public.collaborations from anon, authenticated;
grant select on table public.collaborations to authenticated;

-- ---------- collaboration_members ----------
create table public.collaboration_members (
  collaboration_id uuid not null references public.collaborations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'artist' check (role in ('artist', 'observer')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  added_by uuid not null references auth.users(id),
  added_at timestamptz not null default now(),
  revoked_at timestamptz null,
  primary key (collaboration_id, user_id)
);

alter table public.collaboration_members enable row level security;
revoke all on table public.collaboration_members from anon, authenticated;
grant select on table public.collaboration_members to authenticated;

-- A member sees only their OWN membership row — never the full
-- roster of who else is on a collaboration.
create policy "self select own membership" on public.collaboration_members
  for select using (user_id = auth.uid());

-- Now that collaboration_members exists, the collaborations policy
-- that depends on it can be added.
create policy "member select own collaborations" on public.collaborations
  for select using (
    exists (
      select 1 from public.collaboration_members cm
      where cm.collaboration_id = collaborations.id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );

-- ---------- collaboration_assets (metadata only — never file bytes, never a public URL) ----------
create table public.collaboration_assets (
  id uuid primary key default gen_random_uuid(),
  collaboration_id uuid not null references public.collaborations(id) on delete cascade,
  asset_type text not null
    check (asset_type in ('audio_short', 'audio_full', 'proposal_pdf', 'visual_image')),
  storage_bucket text not null
    check (storage_bucket in ('collaboration-audio', 'collaboration-proposals', 'collaboration-visuals')),
  -- Always "{collaboration_id}/{asset_id}.{ext}", written only by
  -- server-side code with both UUIDs generated server-side — never a
  -- client-supplied filename, so there is nothing for a path-
  -- traversal attempt to act on.
  storage_path text not null,
  display_label text not null,
  mime_type text not null,
  byte_size bigint null,
  version integer not null default 1,
  is_active boolean not null default true,
  uploaded_by uuid not null references auth.users(id),
  uploaded_at timestamptz not null default now(),
  unique (collaboration_id, storage_bucket, storage_path)
);

alter table public.collaboration_assets enable row level security;
revoke all on table public.collaboration_assets from anon, authenticated;
grant select on table public.collaboration_assets to authenticated;

create policy "member select active assets" on public.collaboration_assets
  for select using (
    is_active and exists (
      select 1 from public.collaboration_members cm
      where cm.collaboration_id = collaboration_assets.collaboration_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );

-- ---------- collaboration_feedback ----------
create table public.collaboration_feedback (
  id uuid primary key default gen_random_uuid(),
  collaboration_id uuid not null references public.collaborations(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  asset_id uuid null references public.collaboration_assets(id),
  kind text not null check (kind in ('general', 'track_specific', 'revision_request', 'admin_reply')),
  is_admin_reply boolean not null default false,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

alter table public.collaboration_feedback enable row level security;
revoke all on table public.collaboration_feedback from anon, authenticated;
grant select on table public.collaboration_feedback to authenticated;

-- A member sees their own submissions AND any admin reply posted
-- against their collaboration, but never another artist's entries
-- (relevant once a collaboration can have more than one member).
-- Inserts are intentionally NOT granted here — both the artist-facing
-- and admin-reply paths go through their own Edge Function so input
-- validation, rate limiting, and the author_id/is_admin_reply values
-- are always server-enforced, never client-supplied.
create policy "member select own thread" on public.collaboration_feedback
  for select using (
    exists (
      select 1 from public.collaboration_members cm
      where cm.collaboration_id = collaboration_feedback.collaboration_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
    and (author_id = auth.uid() or is_admin_reply)
  );

-- ---------- artist_invitations ----------
create table public.artist_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  collaboration_id uuid null references public.collaborations(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz null,
  revoked_at timestamptz null,
  revoked_reason text null,
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- One live ("pending") invitation per email at a time.
create unique index artist_invitations_one_pending_per_email
  on public.artist_invitations (lower(email))
  where status = 'pending';

alter table public.artist_invitations enable row level security;
-- Deliberately ZERO grants to anon/authenticated, in either
-- direction. The entire lifecycle — create, check eligibility,
-- accept, revoke — runs through service-role Edge Functions or the
-- SECURITY DEFINER function below. Nothing here is ever readable or
-- writable directly from the browser, matching moon_racer_votes.
revoke all on table public.artist_invitations from anon, authenticated;

-- ---------- portal_admins ----------
create table public.portal_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Null only for the single, manually-inserted bootstrap row — see
  -- supabase/ADMIN_BOOTSTRAP.md. Every admin added after that has a
  -- real granted_by, giving a genuine audit chain from then on.
  granted_by uuid null references auth.users(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz null
);

alter table public.portal_admins enable row level security;
revoke all on table public.portal_admins from anon, authenticated;
-- No direct grants here either — admin status is checked exclusively
-- through is_portal_admin() below, never by selecting this table
-- directly from a policy or from the client.

-- ---------- portal_admin_audit_log ----------
create table public.portal_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id),
  action text not null,
  target_table text null,
  target_id uuid null,
  details jsonb null,
  created_at timestamptz not null default now()
);

alter table public.portal_admin_audit_log enable row level security;
revoke all on table public.portal_admin_audit_log from anon, authenticated;
grant select on table public.portal_admin_audit_log to authenticated;

-- ---------- portal_access_request_log (rate limiting for portal-request-access) ----------
create table public.portal_access_request_log (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  requested_at timestamptz not null default now()
);

alter table public.portal_access_request_log enable row level security;
revoke all on table public.portal_access_request_log from anon, authenticated;

-- ---------- is_portal_admin() ----------
-- SECURITY DEFINER so policies on OTHER tables can check admin status
-- without portal_admins itself ever being readable by `authenticated`.
-- Exact pattern already used by claim_passport / moon_racer_vote_results
-- in this project.
create function public.is_portal_admin(check_uid uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.portal_admins
    where user_id = check_uid and revoked_at is null
  );
$$;

revoke all on function public.is_portal_admin(uuid) from public;
grant execute on function public.is_portal_admin(uuid) to authenticated;

-- Now that is_portal_admin() exists, add the "admins see everything"
-- policies on every member-scoped table above.
create policy "admin select all profiles" on public.artist_profiles
  for select using (public.is_portal_admin());
create policy "admin select all collaborations" on public.collaborations
  for select using (public.is_portal_admin());
create policy "admin select all memberships" on public.collaboration_members
  for select using (public.is_portal_admin());
create policy "admin select all assets" on public.collaboration_assets
  for select using (public.is_portal_admin());
create policy "admin select all feedback" on public.collaboration_feedback
  for select using (public.is_portal_admin());
create policy "admin select audit log" on public.portal_admin_audit_log
  for select using (public.is_portal_admin());

-- ---------- accept_artist_invitation() ----------
-- The atomic invitation-acceptance step. Identity comes ONLY from
-- auth.uid() — there is no email parameter, so there is nothing for a
-- caller to tamper with. A single PL/pgSQL function body runs inside
-- one transaction: if any step raises, every write made earlier in
-- this same call is rolled back automatically. The `for update` lock
-- on the invitation row also closes the race against a concurrent
-- admin revocation of the same invitation.
create function public.accept_artist_invitation()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_invitation record;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select email into v_email from auth.users where id = v_uid;
  if v_email is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_invitation
    from public.artist_invitations
    where lower(email) = lower(v_email)
      and status = 'pending'
      and expires_at > now()
    order by created_at desc
    limit 1
    for update;

  if v_invitation.id is null then
    raise exception 'NOT_ELIGIBLE';
  end if;

  insert into public.artist_profiles (user_id, display_name, email)
  values (v_uid, split_part(v_email, '@', 1), v_email)
  on conflict (user_id) do update set email = excluded.email, updated_at = now();

  update public.artist_invitations
  set status = 'accepted', accepted_at = now()
  where id = v_invitation.id;

  if v_invitation.collaboration_id is not null then
    insert into public.collaboration_members (collaboration_id, user_id, added_by)
    values (v_invitation.collaboration_id, v_uid, v_invitation.invited_by)
    on conflict (collaboration_id, user_id)
      do update set status = 'active', revoked_at = null;
  end if;

  return jsonb_build_object('ok', true, 'collaboration_id', v_invitation.collaboration_id);
end;
$$;

revoke all on function public.accept_artist_invitation() from public;
grant execute on function public.accept_artist_invitation() to authenticated;
