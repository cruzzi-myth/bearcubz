import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { TravelTransition } from '../features/transitions/TravelTransition';
import { useSettings } from '../features/settings/SettingsContext';
import { useAudio } from '../features/audio/AudioProvider';
import { trackEvent } from '../services/analytics';
import './moon-racer-layout.css';

const CLASSIC_URL = 'https://cruzzi-myth.github.io/bearcubz/';

/**
 * The RPG shell. Deliberately sparse in Phase 1 — a HUD frame with
 * placeholders for the systems future phases will fill in (radio,
 * map, passport, missions), not a dashboard full of empty cards.
 */
export function MoonRacerLayout() {
  const { cinematicTravel, setCinematicTravel, reducedMotion, setReducedMotionOverride } = useSettings();
  const { isPlaying, trackTitle, toggle } = useAudio();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="mr-shell">
      <TravelTransition />

      <a href="#mr-main" className="mr-skip-link">
        Skip to content
      </a>

      <header className="mr-hud">
        <NavLink to="/" className="mr-hud__brand" end>
          MOON RACER <span>NETWORK</span>
        </NavLink>

        <nav className="mr-hud__nav" aria-label="Moon Racer Network">
          <NavLink to="/galaxy">Galaxy</NavLink>
          <NavLink to="/passport">Passport</NavLink>
          <NavLink to="/missions">Missions</NavLink>
        </nav>

        <div className="mr-hud__actions">
          <button
            type="button"
            className="mr-hud__icon-btn"
            aria-pressed={isPlaying}
            aria-label={isPlaying ? `Pause Moon Racer Radio — playing ${trackTitle ?? ''}` : 'Moon Racer Radio (no signal yet)'}
            onClick={toggle}
            disabled={!trackTitle}
            title="Moon Racer Radio — coming soon"
          >
            {isPlaying ? '⏸' : '📻'}
          </button>
          <button
            type="button"
            className="mr-hud__icon-btn"
            aria-expanded={settingsOpen}
            aria-controls="mr-settings-panel"
            aria-label="Settings"
            onClick={() => setSettingsOpen((v) => !v)}
          >
            ⚙
          </button>
          <a
            href={CLASSIC_URL}
            className="mr-hud__classic-link"
            onClick={() => trackEvent('network_to_classic')}
          >
            Return to Classic Site
          </a>
        </div>
      </header>

      {settingsOpen && (
        <div id="mr-settings-panel" className="mr-settings-panel" role="dialog" aria-label="Settings">
          <label className="mr-settings-row">
            <span>Cinematic Travel</span>
            <input
              type="checkbox"
              checked={cinematicTravel}
              onChange={(e) => setCinematicTravel(e.target.checked)}
            />
          </label>
          <label className="mr-settings-row">
            <span>Reduced Motion</span>
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(e) => setReducedMotionOverride(e.target.checked)}
            />
          </label>
        </div>
      )}

      <main id="mr-main" className="mr-main">
        <Outlet />
      </main>
    </div>
  );
}
