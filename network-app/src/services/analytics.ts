// ============================================================
// Analytics abstraction — no provider is installed yet (the site
// currently has none). Every call point in the app should go
// through trackEvent() so wiring in a real provider later (GA4,
// Plausible, PostHog, whatever gets chosen) is a one-file change.
//
// For now this just logs in dev and no-ops in production so it is
// safe to call from anywhere without side effects.
// ============================================================

export type AnalyticsEvent =
  | 'classic_to_network'
  | 'network_to_classic'
  | 'guest_entered'
  | 'passport_signup'
  | 'world_visit'
  | 'mission_start'
  | 'mission_complete'
  | 'transmission_play'
  | 'artifact_found'
  | 'visualizer_start'
  // Phase 2 — player identity layer
  | 'network_login_started'
  | 'network_login_success'
  | 'passport_existing_linked'
  | 'passport_new_started'
  | 'passport_new_created'
  | 'avatar_onboarding_started'
  | 'avatar_onboarding_completed'
  | 'dashboard_loaded';

export function trackEvent(event: AnalyticsEvent, payload: Record<string, unknown> = {}): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info('[analytics]', event, payload);
  }
  // Intentionally no-op beyond this in production until a provider
  // is chosen — see Phase 1 deliverable notes.
}
