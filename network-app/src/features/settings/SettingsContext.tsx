import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePrefersReducedMotion } from '../../hooks/useReducedMotion';

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

export function SettingsProvider({ children }: { children: ReactNode }) {
  const osReducedMotion = usePrefersReducedMotion();
  const [cinematicTravel, setCinematicTravel] = useState(() => readStored().cinematicTravel);
  const [reducedMotionOverride, setReducedMotionOverride] = useState(
    () => readStored().reducedMotionOverride,
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ cinematicTravel, reducedMotionOverride }));
    } catch {
      // localStorage unavailable (private mode etc.) — settings just won't persist.
    }
  }, [cinematicTravel, reducedMotionOverride]);

  const reducedMotion = reducedMotionOverride ?? osReducedMotion;

  const value = useMemo<SettingsState>(
    () => ({
      cinematicTravel,
      setCinematicTravel,
      reducedMotion,
      setReducedMotionOverride: (v: boolean) => setReducedMotionOverride(v),
    }),
    [cinematicTravel, reducedMotion],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsState {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
