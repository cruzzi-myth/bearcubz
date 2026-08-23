import type { PlayerState } from '../types/player';

// ============================================================
// Single source of truth for "where should this player be right now."
// Every page that needs to redirect a not-yet-onboarded player (or
// avoid redirecting one who's already active) should call this
// instead of re-deriving the logic — see the Avatar Phase 2C brief's
// explicit "do not repeat this logic in every page" requirement.
//
// This operates purely on server-backed state (PlayerState, ultimately
// player_progress.onboarding_stage) — never on URL history or
// localStorage. Routes here are relative to the network router's own
// basename (see App.tsx) — e.g. '/avatar' means
// https://.../bearcubz/universe/avatar, not a second '/universe/' prefix.
// ============================================================

/** Where an authenticated, Passport-linked player with no completed
 * profile yet should go. Distinct from the stages below because
 * player_progress doesn't exist until initialize_player_profile()
 * creates it — this is the pre-profile onboarding step, unrelated to
 * onboarding_stage. */
export const ONBOARDING_ROUTE = '/onboarding';

/** The one route that owns both species selection AND (once
 * confirmed) cosmetic customization/editing — Avatar Phase 2B/2C. */
export const AVATAR_ROUTE = '/avatar';

/** Normal Network home once first-time onboarding no longer needs to
 * intercept the player. Also where 'avatar_complete'/'core_arrival'
 * land for now — the actual Core Arrival scene is a later phase; see
 * DashboardPage's "CORE ACCESS PENDING" state. */
export const DASHBOARD_ROUTE = '/dashboard';

/**
 * Returns the route a player with this state should be on, or null if
 * the caller's current page is already the correct destination (i.e.
 * "no redirect needed"). Callers pass their own route so this stays a
 * pure function of state rather than needing router context.
 */
export function resolveOnboardingDestination(playerState: Pick<PlayerState, 'profile' | 'progress' | 'avatar'>): string {
  if (!playerState.profile) return ONBOARDING_ROUTE;

  const stage = playerState.progress?.onboarding_stage ?? 'passport_created';
  switch (stage) {
    case 'passport_created':
    case 'species_selection':
    case 'avatar_customization':
      return AVATAR_ROUTE;
    case 'avatar_complete':
    case 'core_arrival':
    case 'active_player':
    default:
      return DASHBOARD_ROUTE;
  }
}

/** True once a player has completed the first-time avatar setup —
 * i.e. it's safe to show them normal Network navigation/HUD instead
 * of forcing them through onboarding. */
export function hasCompletedInitialAvatar(playerState: Pick<PlayerState, 'progress'>): boolean {
  const stage = playerState.progress?.onboarding_stage;
  return stage === 'avatar_complete' || stage === 'core_arrival' || stage === 'active_player';
}
