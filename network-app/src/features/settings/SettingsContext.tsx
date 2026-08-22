import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePrefersReducedMotion } from '../../hooks/useReducedMotion';
import { useAuth } from '../auth/AuthContext';
import { usePlayerState } from '../player/PlayerStateContext';
import { updatePlayerSettings } from '../../services/settingsService';

interface SettingsState {
  /** User-facing toggle: play cinematic TravelTransitions between destinations. */
  cinematicTravel: boolean;
  setCinematicTravel: (value: boolean) => void;
  /** True if motion should be minimized — either the OS asked for it,
   * or the player asked for it explicitly. Always respect this. */
  reducedMotion: boolean;
  setReducedMotionOverride: (value: boolean) => void;
}

const STORAGE_KEY = 'mrn.settings.v1';

const SettingsContext = createContext<SettingsState | null>(null);

function readStored(): { cinematicTravel: boolean; reducedMotionOverride: boolean | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { cinematicTravel: true, reducedMotionOverride: null };
    const parsed = JSON.parse(raw);
    return {
      cinematicTravel: parsed.cinematicTravel ?? true,
      reducedMotionOverride: parsed.reducedMotionOverride ?? null,
    };
  } catch {
    return { cinematicTravel: true, reducedMotionOverride: null };
  }
}

/**
 * Guests keep the original localStorage-only behavior untouched. Once
 * signed in with a loaded player_settings row, this becomes the
 * source of truth: local state is seeded from it once, and further
 * changes are pushed back (debounced) via its owner-scoped UPDATE
 * policy. The "Classic/RPG preference" (preferred_mode) begins local
 * — this UI doesn't yet expose it, so it isn't overwritten here.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const osReducedMotion = usePrefersReducedMotion();
  const { status: authStatus } = useAuth();
  const playerState = usePlayerState();

  const [cinematicTravel, setCinematicTravelState] = useState(() => readStored().cinematicTravel);
  const [reducedMotionOverride, setReducedMotionOverrideState] = useState(() => readStored().reducedMotionOverride);

  const seededFromRemote = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ cinematicTravel, reducedMotionOverride }));
    } catch {
      // localStorage unavailable (private mode etc.) — settings just won't persist.
    }
  }, [cinematicTravel, reducedMotionOverride]);

  // Seed from the remote row exactly once per sign-in.
  useEffect(() => {
    if (authStatus !== 'signed-in') {
      seededFromRemote.current = false;
      return;
    }
    if (seededFromRemote.current || !playerState.settings) return;
    seededFromRemote.current = true;
    setCinematicTravelState(playerState.settings.cinematic_travel);
    setReducedMotionOverrideState(playerState.settings.reduced_motion);
  }, [authStatus, playerState.settings]);

  const userId = playerState.settings?.user_id ?? null;

  function setCinematicTravel(value: boolean) {
    setCinematicTravelState(value);
    if (userId) updatePlayerSettings(userId, { cinematic_travel: value }).catch(() => {});
  }

  function setReducedMotionOverride(value: boolean) {
    setReducedMotionOverrideState(value);
    if (userId) updatePlayerSettings(userId, { reduced_motion: value }).catch(() => {});
  }

  const reducedMotion = reducedMotionOverride ?? osReducedMotion;

  const value = useMemo<SettingsState>(
    () => ({
      cinematicTravel,
      setCinematicTravel,
      reducedMotion,
      setReducedMotionOverride,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cinematicTravel, reducedMotion, userId],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsState {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
