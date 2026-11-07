-- Supabase's default privileges auto-grant EXECUTE on new public-schema
-- functions to anon as well as authenticated. link_my_passport() is
-- authenticated-only by design (it's a no-op for anon since auth.uid()
-- is null and it just raises NOT_AUTHENTICATED, but least-privilege
-- says don't leave the grant sitting there).
revoke execute on function public.link_my_passport() from anon;
