-- REVOKE ... FROM PUBLIC does not remove the separate default-privilege
-- grants Supabase applies to anon/authenticated at function-creation time
-- (same lesson already captured by this project's earlier
-- tighten_link_my_passport_grant migration). confirm_avatar_species and
-- complete_initial_avatar are permanent-identity-mutating operations that
-- must require a real authenticated session — anon must not be able to
-- call them at all.

revoke execute on function public.confirm_avatar_species(text, text, text, smallint, smallint, smallint, smallint) from anon;
revoke execute on function public.complete_initial_avatar() from anon;
revoke execute on function public.is_hybrid_pair_allowed(text, text) from anon;
