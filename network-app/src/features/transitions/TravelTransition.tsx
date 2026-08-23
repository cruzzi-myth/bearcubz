import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSettings } from '../settings/SettingsContext';
import './travel-transition.css';

// Types the future cinematic system will support. Phase 1 renders
// the same simple flash for all of them — see TravelTransition below.
export type TravelTransitionType =
  | 'spaceship'
  | 'car'
  | 'teleport'
  | 'elevator'
  | 'portal'
  | 'pixel-dissolve';

export interface TravelRequest {
  type: TravelTransitionType;
  from: string;
  to: string;
}

/**
 * Proof-of-concept only: fires a brief flash on every /universe/*
 * route change. A later phase can replace the single CSS animation
 * with per-`type` treatments without changing where this is mounted
 * (once, in MoonRacerLayout) or how routes trigger it (automatically,
 * via useLocation — no route needs to know this exists).
 *
 * Always disabled when the player has Cinematic Travel off, or when
 * reduced motion is requested (OS-level or in-app override).
 */
export function TravelTransition() {
  const location = useLocation();
  const { cinematicTravel, reducedMotion } = useSettings();
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!cinematicTravel || reducedMotion) return;
    setActive(false);
    // Re-trigger the CSS animation on every navigation by toggling
    // the class off then on in the next frame.
    const raf = requestAnimationFrame(() => setActive(true));
    const timeout = setTimeout(() => setActive(false), 340);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the path should re-trigger this
  }, [location.pathname]);

  return (
    <div
      className={`travel-transition${active ? ' travel-transition--active' : ''}`}
      aria-hidden="true"
    />
  );
}
