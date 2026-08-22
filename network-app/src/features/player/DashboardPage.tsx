import { Link, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { RouteShell } from '../../components/RouteShell';
import { RequireAuth } from '../../components/RequireAuth';
import { LoadingState } from '../../components/LoadingState';
import { usePlayerState } from './PlayerStateContext';
import { getAvatarPreview } from '../../services/avatarService';
import { ABILITY_STATS } from '../../services/abilities';
import { trackEvent } from '../../services/analytics';
import './dashboard.css';

export function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}

function DashboardContent() {
  const playerState = usePlayerState();
  const navigate = useNavigate();

  useEffect(() => {
    if (playerState.status === 'ready' && !playerState.profile) {
      navigate('/onboarding', { replace: true });
    }
  }, [playerState.status, playerState.profile, navigate]);

  useEffect(() => {
    if (playerState.status === 'ready' && playerState.profile) {
      trackEvent('dashboard_loaded');
    }
  }, [playerState.status, playerState.profile]);

  if (playerState.status === 'loading' || playerState.status === 'idle') {
    return (
      <RouteShell eyebrow="Player" title="Dashboard" description="" placeholder={false}>
        <LoadingState message="RESTORING PLAYER STATE…" />
      </RouteShell>
    );
  }

  if (playerState.status === 'error' || !playerState.profile || !playerState.progress || !playerState.abilities) {
    return (
      <RouteShell eyebrow="Player" title="Dashboard" description="" placeholder={false}>
        <LoadingState message="SYNCHRONIZING AVATAR…" />
      </RouteShell>
    );
  }

  const { passport, profile, progress, abilities, avatar } = playerState;
  const preview = getAvatarPreview(avatar);

  const floor = playerState.xpForCurrentLevel ?? 0;
  const ceiling = playerState.xpForNextLevel;
  const xpIntoLevel = progress.xp - floor;
  const xpSpan = ceiling !== null ? ceiling - floor : null;
  const pct = xpSpan && xpSpan > 0 ? Math.min(100, Math.max(0, (xpIntoLevel / xpSpan) * 100)) : progress.level >= 30 ? 100 : 0;

  return (
    <RouteShell eyebrow="Player" title="Dashboard" description="" placeholder={false}>
      <div className="mr-dash-header">
        <div className="mr-dash-avatar" aria-hidden="true">
          {preview.kind === 'image' ? <img src={preview.src} alt="" /> : preview.label}
        </div>
        <div>
          <p className="mr-dash-identity__name">{profile.display_name}</p>
          <p className="mr-dash-identity__meta">
            @{profile.username} · {passport?.passport_id ?? 'UNLINKED'}
            {passport && <> · {passport.founder_status}</>}
          </p>
        </div>
      </div>

      <div className="mr-dash-stats">
        <div className="mr-dash-stat">
          <p className="mr-dash-stat__label">Rank</p>
          <p className="mr-dash-stat__value">{progress.rank}</p>
        </div>
        <div className="mr-dash-stat">
          <p className="mr-dash-stat__label">Level</p>
          <p className="mr-dash-stat__value">{progress.level} / 30</p>
        </div>
        <div className="mr-dash-stat" style={{ gridColumn: 'span 2' }}>
          <p className="mr-dash-stat__label">
            XP {progress.xp}
            {ceiling !== null ? ` · ${ceiling - progress.xp} to next level` : ' · MAX LEVEL'}
          </p>
          <div className="mr-dash-xpbar">
            <div className="mr-dash-xpbar__fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="mr-dash-stat">
          <p className="mr-dash-stat__label">ZIP</p>
          <p className="mr-dash-stat__value">{progress.zip_balance.toLocaleString()}</p>
        </div>
      </div>

      <div className="mr-dash-abilities">
        {ABILITY_STATS.map((stat) => (
          <div className="mr-dash-ability" key={stat}>
            <p className="mr-dash-ability__label">{stat.toUpperCase()}</p>
            <p className="mr-dash-ability__value">{abilities[stat]}</p>
          </div>
        ))}
      </div>

      <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
        <Link to="/galaxy" className="network-btn">
          Galaxy Map
        </Link>
        <Link to="/missions" className="network-btn">
          Mission Log
        </Link>
        <Link to="/inventory" className="network-btn">
          Inventory
        </Link>
        <Link to="/avatar" className="network-btn">
          Edit Avatar
        </Link>
      </nav>

      <div className="mr-dash-placeholders">
        <div className="mr-dash-placeholder">
          <strong>Missions</strong>
          No missions discovered yet.
        </div>
        <div className="mr-dash-placeholder">
          <strong>Inventory</strong>
          Empty.
        </div>
        <div className="mr-dash-placeholder">
          <strong>Artifacts</strong>
          None recovered.
        </div>
        <div className="mr-dash-placeholder">
          <strong>Canon Discoveries</strong>
          None yet.
        </div>
        <div className="mr-dash-placeholder">
          <strong>Worlds Discovered</strong>
          None yet.
        </div>
        <div className="mr-dash-placeholder">
          <strong>Achievements</strong>
          None yet.
        </div>
        <div className="mr-dash-placeholder">
          <strong>NPC Relationships</strong>
          None yet.
        </div>
      </div>
    </RouteShell>
  );
}
