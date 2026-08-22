import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RouteShell } from '../../components/RouteShell';
import { RequireAuth } from '../../components/RequireAuth';
import { LoadingState } from '../../components/LoadingState';
import { useAuth } from '../auth/AuthContext';
import { usePlayerState } from '../player/PlayerStateContext';
import { initializePlayerProfile } from '../../services/playerState';
import { savePlayerAvatar, loadAvatarPresets } from '../../services/avatarService';
import { HAIR_OPTIONS, EYE_OPTIONS, OUTFIT_OPTIONS, ACCENT_OPTIONS } from '../../data/avatarOptions';
import { describeBackendError } from '../../services/errors';
import { trackEvent } from '../../services/analytics';
import type { AvatarPreset } from '../../types/player';
import './onboarding.css';

const USERNAME_RE = /^[A-Za-z0-9 ._'-]{2,24}$/;

type Step = 'identity' | 'avatar' | 'confirm';

export function OnboardingPage() {
  return (
    <RequireAuth>
      <OnboardingWizard />
    </RequireAuth>
  );
}

function OnboardingWizard() {
  const { session } = useAuth();
  const playerState = usePlayerState();
  const navigate = useNavigate();

  // Resumable: a profile already existing means onboarding already
  // finished — don't let a refresh/retry create a second one.
  useEffect(() => {
    if (playerState.status === 'ready' && playerState.profile) {
      navigate('/dashboard', { replace: true });
    }
  }, [playerState.status, playerState.profile, navigate]);

  useEffect(() => {
    trackEvent('avatar_onboarding_started');
  }, []);

  const [step, setStep] = useState<Step>('identity');
  const [presets, setPresets] = useState<AvatarPreset[]>([]);
  const [presetsError, setPresetsError] = useState(false);

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [identityError, setIdentityError] = useState<string | null>(null);

  const [baseModel, setBaseModel] = useState('human');
  const [hair, setHair] = useState(HAIR_OPTIONS[0].id);
  const [eyes, setEyes] = useState(EYE_OPTIONS[0].id);
  const [outfit, setOutfit] = useState(OUTFIT_OPTIONS[0].id);
  const [accent, setAccent] = useState(ACCENT_OPTIONS[0].id);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    loadAvatarPresets()
      .then((rows) => {
        setPresets(rows);
        if (rows[0]) setBaseModel(rows[0].base_model);
      })
      .catch(() => setPresetsError(true));
  }, []);

  if (playerState.status === 'loading' || (playerState.status === 'ready' && playerState.profile)) {
    return (
      <RouteShell eyebrow="Onboarding" title="Player Setup" description="" placeholder={false}>
        <LoadingState message="RESTORING PLAYER STATE…" />
      </RouteShell>
    );
  }

  function handleIdentityNext(e: React.FormEvent) {
    e.preventDefault();
    setIdentityError(null);
    if (!USERNAME_RE.test(username.trim())) {
      setIdentityError("Callsign must be 2–24 characters (letters, numbers, spaces, - _ . ' only).");
      return;
    }
    if (displayName.trim().length < 2 || displayName.trim().length > 32) {
      setIdentityError('Display name must be 2–32 characters.');
      return;
    }
    setStep('avatar');
  }

  async function handleConfirm() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await initializePlayerProfile(username.trim(), displayName.trim(), baseModel);
      const uid = session?.user.id ?? result.profile?.user_id;
      if (uid) {
        await savePlayerAvatar(uid, { hair, eyes, outfit, accent });
      }
      trackEvent('avatar_onboarding_completed');
      await playerState.refresh();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setSubmitError(describeBackendError(err).body);
      setSubmitting(false);
    }
  }

  return (
    <RouteShell
      eyebrow="Onboarding"
      title="Player Setup"
      description="Set your callsign and build your first Moon Racer look. You can refine this later."
      placeholder={false}
    >
      <ol className="mr-onboard-steps" aria-label="Onboarding progress">
        <li className={step === 'identity' ? 'active' : ''}>Identity</li>
        <li className={step === 'avatar' ? 'active' : ''}>Avatar</li>
        <li className={step === 'confirm' ? 'active' : ''}>Confirm</li>
      </ol>

      {step === 'identity' && (
        <form onSubmit={handleIdentityNext} className="mr-onboard-form">
          <label className="mr-onboard-label">
            Callsign (username)
            <input
              className="mr-onboard-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={24}
              placeholder="e.g. NightRacer7"
            />
          </label>
          <label className="mr-onboard-label">
            Display Name
            <input
              className="mr-onboard-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={32}
              placeholder="How other players see you"
            />
          </label>
          {identityError && (
            <p style={{ color: 'var(--pink)', fontSize: 13 }} role="alert">
              {identityError}
            </p>
          )}
          <button type="submit" className="network-btn">
            Continue →
          </button>
        </form>
      )}

      {step === 'avatar' && (
        <div className="mr-onboard-form">
          {presetsError && (
            <p style={{ color: 'var(--pink)', fontSize: 13 }} role="alert">
              Could not load base forms. Try refreshing.
            </p>
          )}
          <fieldset className="mr-onboard-fieldset">
            <legend>Base Form</legend>
            <div className="mr-onboard-grid">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`mr-onboard-chip${baseModel === preset.base_model ? ' active' : ''}`}
                  onClick={() => setBaseModel(preset.base_model)}
                >
                  {preset.display_name}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="mr-onboard-fieldset">
            <legend>Hair</legend>
            <div className="mr-onboard-grid">
              {HAIR_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`mr-onboard-chip${hair === opt.id ? ' active' : ''}`}
                  onClick={() => setHair(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="mr-onboard-fieldset">
            <legend>Eyes</legend>
            <div className="mr-onboard-grid">
              {EYE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`mr-onboard-chip${eyes === opt.id ? ' active' : ''}`}
                  onClick={() => setEyes(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="mr-onboard-fieldset">
            <legend>Outfit</legend>
            <div className="mr-onboard-grid">
              {OUTFIT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`mr-onboard-chip${outfit === opt.id ? ' active' : ''}`}
                  onClick={() => setOutfit(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="mr-onboard-fieldset">
            <legend>Signal Accent</legend>
            <div className="mr-onboard-grid">
              {ACCENT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`mr-onboard-chip${accent === opt.id ? ' active' : ''}`}
                  onClick={() => setAccent(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="network-btn" onClick={() => setStep('identity')} style={{ background: 'transparent', color: 'rgba(255,255,255,.7)', boxShadow: 'none', border: '1px solid rgba(255,255,255,.2)' }}>
              ← Back
            </button>
            <button type="button" className="network-btn" onClick={() => setStep('confirm')}>
              Continue →
            </button>
          </div>
        </div>
      )}

      {step === 'confirm' && (
        <div className="mr-onboard-form">
          <p style={{ color: 'rgba(255,255,255,.7)' }}>
            <strong style={{ color: '#fff' }}>{displayName || username}</strong> · @{username}
            <br />
            {presets.find((p) => p.base_model === baseModel)?.display_name ?? baseModel} ·{' '}
            {HAIR_OPTIONS.find((o) => o.id === hair)?.label} ·{' '}
            {EYE_OPTIONS.find((o) => o.id === eyes)?.label} ·{' '}
            {OUTFIT_OPTIONS.find((o) => o.id === outfit)?.label}
          </p>
          {submitError && (
            <p style={{ color: 'var(--pink)', fontSize: 13 }} role="alert">
              {submitError}
            </p>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="network-btn"
              onClick={() => setStep('avatar')}
              disabled={submitting}
              style={{ background: 'transparent', color: 'rgba(255,255,255,.7)', boxShadow: 'none', border: '1px solid rgba(255,255,255,.2)' }}
            >
              ← Back
            </button>
            <button type="button" className="network-btn" onClick={handleConfirm} disabled={submitting}>
              {submitting ? 'Synchronizing Avatar…' : 'Enter the Network →'}
            </button>
          </div>
        </div>
      )}
    </RouteShell>
  );
}
