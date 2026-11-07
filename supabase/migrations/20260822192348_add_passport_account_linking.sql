-- ============================================================
-- Phase 2 step 1: link an authenticated Supabase Auth identity to a
-- pre-existing passport_members row. Purely additive:
--   - claim_passport() is not modified.
--   - No existing row's email/racer_name/passport_id/member_number/
--     founder_status/tribe/sector/access_level/issue_date/created_at
--     is touched by anything below.
--   - The deployed /passport/ frontend calls claim_passport() only,
--     so its behavior is unchanged.
-- ============================================================

-- 1. Nullable link column. Existing rows: user_id starts NULL.
alter table public.passport_members
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- 2. Hardening: enforce case-insensitive email uniqueness at the
--    schema level (claim_passport already lowercases before insert,
--    this makes it structurally guaranteed rather than just
--    convention). Coexists with the existing plain unique(email).
create unique index if not exists passport_members_email_lower_key
  on public.passport_members (lower(email));

-- 3. One auth account can link at most one passport.
create unique index if not exists passport_members_user_id_key
  on public.passport_members (user_id) where user_id is not null;

-- 4. link_my_passport(): the ONLY place user_id is ever written.
--    Never inserts a row -- only attaches auth.uid() to a row
--    claim_passport already created. Uses an atomic
--    UPDATE ... RETURNING for the actual linking write (no
--    read-then-write race on the happy path), and only falls back
--    to a plain SELECT to explain *why* the update matched zero
--    rows (no such passport / already linked to this same account /
--    already linked to a different account).
create or replace function public.link_my_passport()
returns table (
  passport_id text,
  racer_name text,
  founder_status text,
  tribe text,
  sector text,
  access_level text,
  issue_date text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_uid uuid := auth.uid();
  v_updated public.passport_members;
  v_existing public.passport_members;
begin
  if v_uid is null or v_email = '' then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  update public.passport_members
     set user_id = v_uid
   where lower(email) = v_email
     and user_id is null
  returning * into v_updated;

  if found then
    return query
      select v_updated.passport_id, v_updated.racer_name, v_updated.founder_status,
             v_updated.tribe, v_updated.sector, v_updated.access_level, v_updated.issue_date;
    return;
  end if;

  select * into v_existing from public.passport_members where lower(email) = v_email;

  if not found then
    raise exception 'NO_PASSPORT_FOUND';
  elsif v_existing.user_id = v_uid then
    -- Idempotent: already linked to this same account, not an error.
    return query
      select v_existing.passport_id, v_existing.racer_name, v_existing.founder_status,
             v_existing.tribe, v_existing.sector, v_existing.access_level, v_existing.issue_date;
    return;
  else
    raise exception 'ALREADY_LINKED';
  end if;
end;
$$;

revoke all on function public.link_my_passport() from public;
grant execute on function public.link_my_passport() to authenticated;

-- 5. Widen (never narrow) the existing read policy: a linked account
--    matches by the stable user_id; an unlinked row still matches by
--    verified email exactly as it did before this migration, so any
--    not-yet-linked member's existing read path is unaffected. Both
--    sides of the email comparison are now explicitly lower()'d.
drop policy if exists "members can read their own passport" on public.passport_members;
create policy "members can read their own passport"
  on public.passport_members
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or (user_id is null and lower(coalesce(auth.jwt() ->> 'email', '')) = lower(email))
  );
