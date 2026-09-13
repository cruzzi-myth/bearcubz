-- This project grants EXECUTE on new public-schema functions to
-- anon/authenticated directly (not via the PUBLIC pseudo-role) —
-- confirmed via information_schema.role_routine_grants, and the same
-- pattern shows up on this project's other SECURITY DEFINER functions
-- (claim_passport, initialize_player_profile, etc). `revoke ... from
-- public` in the original migration didn't touch those direct grants.
-- Revoke by name so only the Edge Function's service-role client can
-- call this — matches "results must pass through the Edge Function."
revoke execute on function public.moon_racer_vote_results() from anon, authenticated;
