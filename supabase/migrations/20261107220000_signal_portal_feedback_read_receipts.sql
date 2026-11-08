-- ============================================================
-- SIGNAL PORTAL — Stage K1.1: per-viewer read receipts for the
-- global SIGNAL INBOX's unread indicator.
--
-- NOT YET APPLIED to production. Prepared and tested locally only,
-- pending separate approval (Stage K1.1 brief, Tasks 6/7/10) --
-- the frontend reads this table defensively (same
-- isBackendUnavailableError pattern used everywhere else in this
-- app) so the inbox already works correctly without it, simply with
-- the unread badge disabled until this is approved and applied.
--
-- Purely additive: a brand-new, independent table. Nothing about
-- collaboration_feedback itself changes. "Read" is inherently a
-- per-VIEWER property -- a collaboration can have more than one
-- active member (see Collab 1: Artist A + Artist C in the test
-- fixtures), so one message can be read by one member and unread by
-- another at the same time. A join table is the correct shape for
-- that; a column on collaboration_feedback itself could not express
-- it.
-- ============================================================

create table public.collaboration_feedback_reads (
  feedback_id uuid not null references public.collaboration_feedback(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (feedback_id, user_id)
);

alter table public.collaboration_feedback_reads enable row level security;
revoke all on table public.collaboration_feedback_reads from anon, authenticated;

-- Deliberately NOT an "admin select all" table like every other
-- admin-visible table in this project: whether a specific person has
-- opened a specific message is private to them, not an
-- administrative concern. An admin marking their OWN read status uses
-- this exact same policy, not a separate one.
create policy "own read receipts only" on public.collaboration_feedback_reads
  for select using (user_id = (select auth.uid()));

-- A read receipt can only ever be recorded for a message the viewer
-- is already allowed to see -- mirrors collaboration_feedback's own
-- "member select own thread" / "admin select all feedback" policies
-- exactly, so this table can never be used to probe which messages
-- exist beyond what the viewer could already read directly.
create policy "mark own messages read" on public.collaboration_feedback_reads
  for insert with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.collaboration_feedback cf
      where cf.id = feedback_id
        and (
          public.is_portal_admin()
          or exists (
            select 1 from public.collaboration_members cm
            where cm.collaboration_id = cf.collaboration_id
              and cm.user_id = (select auth.uid())
              and cm.status = 'active'
          )
        )
    )
  );

grant select, insert on public.collaboration_feedback_reads to authenticated;
-- No update/delete grant -- a read receipt, once recorded, never
-- needs to change; re-marking an already-read message is a harmless
-- no-op the client handles via onConflict: ignore, not something
-- this table's RLS needs to special-case.
