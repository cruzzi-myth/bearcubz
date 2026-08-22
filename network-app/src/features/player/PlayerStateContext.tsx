import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { loadPlayerState, xpRequiredForLevel } from '../../services/playerState';
import type { PlayerState } from '../../types/player';

export type PlayerStateStatus = 'idle' | 'loading' | 'ready' | 'error';

interface PlayerStateValue {
  status: PlayerStateStatus;
  error: unknown;
  passport: PlayerState['passport'];
  profile: PlayerState['profile'];
  progress: PlayerState['progress'];
  abilities: PlayerState['abilities'];
  avatar: PlayerState['avatar'];
  settings: PlayerState['settings'];
  /** XP threshold for the player's CURRENT level, from the DB's
   * xp_for_level() — the floor of the progress bar. */
  xpForCurrentLevel: number | null;
  /** XP needed to reach the NEXT level, from the DB's xp_for_level() —
   * null while unknown/at max level. Never hard-coded on the client. */
  xpForNextLevel: number | null;
  /** True once a Passport is linked but initialize_player_profile()
   * hasn't run yet — the signal to route into onboarding. */
  needsOnboarding: boolean;
  refresh: () => Promise<void>;
}

const PlayerStateContext = createContext<PlayerStateValue | null>(null);

export function PlayerStateProvider({ children }: { children: ReactNode }) {
  const { status: authStatus } = useAuth();
  const [state, setState] = useState<PlayerState>({
    passport: null,
    profile: null,
    progress: null,
    abilities: null,
    avatar: null,
    settings: null,
  });
  const [status, setStatus] = useState<PlayerStateStatus>('idle');
  const [error, setError] = useState<unknown>(null);
  const [xpForCurrentLevel, setXpForCurrentLevel] = useState<number | null>(null);
  const [xpForNextLevel, setXpForNextLevel] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const next = await loadPlayerState();
      setState(next);
      setStatus('ready');
      if (next.progress) {
        xpRequiredForLevel(next.progress.level)
          .then(setXpForCurrentLevel)
          .catch(() => setXpForCurrentLevel(null));
        if (next.progress.level < 30) {
          xpRequiredForLevel(next.progress.level + 1)
            .then(setXpForNextLevel)
            .catch(() => setXpForNextLevel(null));
        } else {
          setXpForNextLevel(null);
        }
      } else {
        setXpForCurrentLevel(null);
        setXpForNextLevel(null);
      }
    } catch (err) {
      setError(err);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (authStatus === 'signed-in') {
      refresh();
    } else if (authStatus === 'signed-out') {
      setState({ passport: null, profile: null, progress: null, abilities: null, avatar: null, settings: null });
      setXpForNextLevel(null);
      setStatus('idle');
    }
  }, [authStatus, refresh]);

  const value = useMemo<PlayerStateValue>(
    () => ({
      status,
      error,
      ...state,
      xpForCurrentLevel,
      xpForNextLevel,
      needsOnboarding: status === 'ready' && state.passport !== null && state.profile === null,
      refresh,
    }),
    [status, error, state, xpForCurrentLevel, xpForNextLevel, refresh],
  );

  return <PlayerStateContext.Provider value={value}>{children}</PlayerStateContext.Provider>;
}

export function usePlayerState(): PlayerStateValue {
  const ctx = useContext(PlayerStateContext);
  if (!ctx) throw new Error('usePlayerState must be used within PlayerStateProvider');
  return ctx;
}
