import { describe, expect, it } from 'vitest';
import { AVATAR_ROUTE, DASHBOARD_ROUTE, ONBOARDING_ROUTE, hasCompletedInitialAvatar, resolveOnboardingDestination } from './onboarding';
import type { PlayerOnboardingStage, PlayerState } from '../types/player';

function stateWithStage(stage: PlayerOnboardingStage | undefined, hasProfile = true): Pick<PlayerState, 'profile' | 'progress' | 'avatar'> {
  return {
    profile: hasProfile ? ({ user_id: 'u1', username: 'x', display_name: 'X', created_at: '', updated_at: '' } as PlayerState['profile']) : null,
    progress: stage
      ? ({
          user_id: 'u1',
          xp: 0,
          level: 0,
          rank: 'Visitor / Initiate',
          zip_balance: 0,
          onboarding_stage: stage,
          onboarding_completed_at: null,
          updated_at: '',
        } as PlayerState['progress'])
      : null,
    avatar: null,
  };
}

describe('resolveOnboardingDestination', () => {
  it('sends a player with no profile to onboarding', () => {
    expect(resolveOnboardingDestination(stateWithStage(undefined, false))).toBe(ONBOARDING_ROUTE);
  });

  it('sends a profile with no progress row yet to the avatar route (defaults to passport_created)', () => {
    expect(resolveOnboardingDestination(stateWithStage(undefined, true))).toBe(AVATAR_ROUTE);
  });

  it.each<PlayerOnboardingStage>(['passport_created', 'species_selection', 'avatar_customization'])(
    'sends stage "%s" to the avatar route',
    (stage) => {
      expect(resolveOnboardingDestination(stateWithStage(stage))).toBe(AVATAR_ROUTE);
    },
  );

  it.each<PlayerOnboardingStage>(['avatar_complete', 'core_arrival', 'active_player'])('sends stage "%s" to the dashboard route', (stage) => {
    expect(resolveOnboardingDestination(stateWithStage(stage))).toBe(DASHBOARD_ROUTE);
  });
});

describe('hasCompletedInitialAvatar', () => {
  it('is false before avatar_complete', () => {
    expect(hasCompletedInitialAvatar(stateWithStage('avatar_customization'))).toBe(false);
    expect(hasCompletedInitialAvatar(stateWithStage(undefined))).toBe(false);
  });

  it('is true from avatar_complete onward', () => {
    expect(hasCompletedInitialAvatar(stateWithStage('avatar_complete'))).toBe(true);
    expect(hasCompletedInitialAvatar(stateWithStage('core_arrival'))).toBe(true);
    expect(hasCompletedInitialAvatar(stateWithStage('active_player'))).toBe(true);
  });
});
