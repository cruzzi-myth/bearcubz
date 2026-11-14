# Signal Portal — administrator bootstrap

This is documentation, not a migration. It cannot be a migration: the
first administrator's `user_id` doesn't exist until that person has
signed in at least once, so no file in this repo can contain it ahead
of time. There is no web-reachable "become admin" endpoint anywhere —
by design, the only way into `portal_admins` is this manual procedure.

## Procedure

1. The site owner signs in through the normal Signal Portal flow once
   (any Supabase Auth session is enough — `auth.users.id` now exists
   for them).
2. Find that UUID — Supabase Dashboard → Authentication → Users, or:
   ```sql
   select id from auth.users where email = '<owner's email>';
   ```
3. Run, once, directly in the Supabase SQL editor — never through
   application code, never through an Edge Function, never committed
   to this repo with a real value filled in:
   ```sql
   insert into portal_admins (user_id, granted_by)
   values ('<owner's uuid>', null);
   ```
4. Every admin added after this one goes through the (not yet built)
   `portal-admin-manage-admins` function, with `granted_by` set to the
   admin performing the grant — a real audit chain from the second
   admin onward. Only the very first row is ever inserted by hand.

## Not done

This procedure has **not** been run against any environment. No
`portal_admins` row exists anywhere yet.
