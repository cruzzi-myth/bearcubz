create extension if not exists pgcrypto;

create table if not exists public.moon_racer_votes (
  id uuid primary key default gen_random_uuid(),
  track_id smallint not null check (track_id between 1 and 22),
  device_hash text not null check (char_length(device_hash) = 64),
  vote_day date not null default ((now() at time zone 'America/Los_Angeles')::date),
  created_at timestamptz not null default now(),
  unique (device_hash, vote_day)
);

create index if not exists moon_racer_votes_track_day_idx
  on public.moon_racer_votes (vote_day, track_id);

alter table public.moon_racer_votes enable row level security;

revoke all on table public.moon_racer_votes from anon, authenticated;

-- service_role has BYPASSRLS, but bypassing RLS doesn't imply the base
-- table-level ACL grant — this project's public schema doesn't hand that
-- out by default, so it must be explicit or the Edge Function's
-- service-role client gets a permission-denied error on every query.
grant select, insert on table public.moon_racer_votes to service_role;

create or replace function public.moon_racer_vote_results()
returns table (track_id smallint, votes bigint, percentage numeric)
language sql
security definer
set search_path = public
as $$
  with counts as (
    select series.track_id,
           count(v.id)::bigint as votes
    from generate_series(1, 22) as series(track_id)
    left join public.moon_racer_votes v
      on v.track_id = series.track_id
    group by series.track_id
  ), totals as (
    select sum(votes)::numeric as total from counts
  )
  select counts.track_id::smallint,
         counts.votes,
         case
           when totals.total = 0 then 0
           else round((counts.votes::numeric / totals.total) * 100, 1)
         end as percentage
  from counts cross join totals
  order by counts.votes desc, counts.track_id asc;
$$;

revoke all on function public.moon_racer_vote_results() from public;
grant execute on function public.moon_racer_vote_results() to service_role;
