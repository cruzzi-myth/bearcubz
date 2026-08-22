import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { TravelTransition } from '../features/transitions/TravelTransition';
import { useSettings } from '../features/settings/SettingsContext';
import { useAudio } from '../features/audio/AudioProvider';
import { useAuth } from '../features/auth/AuthContext';
import { usePlayerState } from '../features/player/PlayerStateContext';
import { getAvatarPreview } from '../services/avatarService';
import { trackEvent } from '../services/analytics';
import { MobileNav } from './MobileNav';
import './moon-racer-layout.css';

const CLASSIC_URL = 'https://cruzzi-myth.github.io/bearcubz/';

/**
 * The RPG shell. HUD reads real player state once signed in (Passport
 * ID, level, rank, ZIP, avatar) — guests and loading sessions get
 * honest placeholder states, never fabricated numbers.
 */
export function MoonRacerLayout() {
  const { cinematicTravel, setCinematicTravel, reducedMotion, setReducedMotionOverride } = useSettings();
  const { isPlaying, trackTitle, toggle } = useAudio();
  const { status: authStatus, signOut } = useAuth();
  const playerState = usePlayerState();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function handleLogout() {
    await signOut();
    navigate('/');
  }

  const settingsToggles = (
    <>
      <label className="mr-settings-row">
        <span>Cinematic Travel</span>
        <input type="checkbox" checked={cinematicTravel} onChange={(e) => setCinematicTravel(e.target.checked)} />
      </label>
      <label className="mr-settings-row">
        <span>Reduced Motion</span>
        <input type="checkbox" checked={reducedMotion} onChange={(e) => setReducedMotionOverride(e.target.checked)} />
      </label>
      {authStatus === 'signed-in' && (
        <button type="button" className="mr-hud__logout" onClick={handleLogout}>
          Log Out
        </button>
      )}
    </>
  );

  const passport = playerState.passport;
  const progress = playerState.progress;
  const preview = getAvatarPreview(playerState.avatar);

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

        {authStatus === 'signed-in' && progress && passport && (
          <div className="mr-hud__player">
            <span className="mr-hud__player-avatar" aria-hidden="true">
              {preview.kind === 'image' ? <img src={preview.src} alt="" /> : preview.label.slice(0, 2)}
            </span>
            <span>{passport.passport_id}</span>
            <span>
              LV{progress.level} · {progress.rank}
            </span>
            <span className="mr-hud__zip">ZIP {progress.zip_balance.toLocaleString()}</span>
          </div>
        )}
        {authStatus === 'signed-in' && (!progress || !passport) && (
          <div className="mr-hud__player" aria-live="polite">
            SYNCHRONIZING…
          </div>
        )}

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
          {authStatus === 'signed-in' ? (
            <button type="button" className="mr-hud__classic-link" onClick={handleLogout} style={{ cursor: 'pointer', background: 'transparent' }}>
              Log Out
            </button>
          ) : (
            <NavLink to="/login" className="mr-hud__classic-link">
              Sign In
            </NavLink>
          )}
          <a href={CLASSIC_URL} className="mr-hud__classic-link" onClick={() => trackEvent('network_to_classic')}>
            Return to Classic Site
          </a>
        </div>
      </header>

      {settingsOpen && (
        <div id="mr-settings-panel" className="mr-settings-panel" role="dialog" aria-label="Settings">
          {settingsToggles}
        </div>
      )}

      <main id="mr-main" className="mr-main">
        <Outlet />
      </main>

      <MobileNav settingsSlot={settingsToggles} />
    </div>
  );
}
