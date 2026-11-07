-- Sequence that guarantees atomic, gap-free-enough, strictly unique member numbers
-- even under concurrent registrations (e.g. many phones at the event scanning at once).
create sequence if not exists public.passport_member_seq start 1;

create table if not exists public.passport_members (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique,
  racer_name     text not null,
  passport_id    text not null unique,
  member_number  integer not null unique,
  issue_date     text not null default 'AUGUST 21, 2026',
  founder_status text not null default 'FOUNDING MEMBER',
  tribe          text not null default 'ORIGINAL TRIBE',
  sector         text not null default '00 — THE CORE',
  access_level   text not null default '01 — ORIGINAL TRIBE',
  created_at     timestamptz not null default now()
);

-- Case-insensitive uniqueness on racer name (soft "no obvious duplicate usernames" rule).
create unique index if not exists passport_members_racer_name_lower_idx
  on public.passport_members (lower(racer_name));

-- Lock the table down completely by default. No anon/authenticated INSERT/UPDATE/DELETE
-- policy exists at all, so those are always denied. The only way to write a row is through
-- the SECURITY DEFINER function below (owned by postgres, which is exempt from RLS on a
-- table it owns, since FORCE ROW LEVEL SECURITY is not set).
alter table public.passport_members enable row level security;

-- A verified, logged-in member (via Supabase Auth email OTP / magic link) may read ONLY
-- their own row, matched against the verified email in their JWT. Nobody can read anyone
-- else's row, and anon (unauthenticated) users cannot read the table at all.
create policy "members can read their own passport"
  on public.passport_members
  for select
  to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = email);

revoke all on public.passport_members from anon, authenticated;
grant select on public.passport_members to authenticated;

revoke all on public.passport_member_seq from anon, authenticated;

-- claim_passport: the only entry point for creating a passport.
-- - Validates racer name length/characters and basic email shape.
-- - If the email is new: atomically issues the next MR-###### id and inserts the row.
-- - If the email already has a passport, it does NOT return any stored data (name, ID,
--   etc.) here — it raises EMAIL_EXISTS so the client can send them through Supabase Auth
--   email verification (OTP/magic link) before ever showing previously-stored information.
--   This avoids leaking a member's Racer Name / Passport ID to anyone who merely knows
--   (or guesses) their email address.
create or replace function public.claim_passport(p_email text, p_racer_name text)
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
  v_email text := lower(trim(p_email));
  v_name  text := trim(p_racer_name);
  v_next_num integer;
  v_passport_id text;
begin
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(v_email) > 254 then
    raise exception 'INVALID_EMAIL';
  end if;

  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 24
     or v_name !~ '^[[:alnum:] ._''\-]+$' then
    raise exception 'INVALID_NAME';
  end if;

  if exists (select 1 from public.passport_members pm where pm.email = v_email) then
    raise exception 'EMAIL_EXISTS';
  end if;

  v_next_num := nextval('public.passport_member_seq');
  v_passport_id := 'MR-' || lpad(v_next_num::text, 6, '0');

  begin
    insert into public.passport_members (email, racer_name, passport_id, member_number)
    values (v_email, v_name, v_passport_id, v_next_num);
  exception
    when unique_violation then
      -- Concurrent request won the race on email (rare) or racer_name collided.
      if exists (select 1 from public.passport_members pm where pm.email = v_email) then
        raise exception 'EMAIL_EXISTS';
      else
        raise exception 'NAME_TAKEN';
      end if;
  end;

  return query
    select v_passport_id, v_name, 'FOUNDING MEMBER'::text, 'ORIGINAL TRIBE'::text,
           '00 — THE CORE'::text, '01 — ORIGINAL TRIBE'::text, 'AUGUST 21, 2026'::text;
end;
$$;

revoke all on function public.claim_passport(text, text) from public;
grant execute on function public.claim_passport(text, text) to anon, authenticated;
