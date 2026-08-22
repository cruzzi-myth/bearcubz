import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RouteShell } from '../../components/RouteShell';
import { RequireAuth } from '../../components/RequireAuth';
import { LoadingState } from '../../components/LoadingState';
import { useAuth } from '../auth/AuthContext';
import { usePlayerState } from '../player/PlayerStateContext';
import { savePlayerAvatar, loadAvatarPresets, getAvatarPreview } from '../../services/avatarService';
import { HAIR_OPTIONS, EYE_OPTIONS, OUTFIT_OPTIONS, ACCENT_OPTIONS } from '../../data/avatarOptions';
import type { AvatarPreset } from '../../types/player';
import { trackEvent } from '../../services/analytics';
import '../onboarding/onboarding.css';

/**
 * Avatar V1 — post-onboarding refinement of the same avatar record
 * created during onboarding (one avatar identity, not a second one).
 * Full 3D creator/vendor integration is Phase 3+; this only edits the
 * cosmetic text columns already on player_avatar.
 */
export function AvatarCreationPage() {
  return (
    <RequireAuth>
      <AvatarEditor />
    </RequireAuth>
  );
}

function AvatarEditor() {
  const { session } = useAuth();
  const playerState = usePlayerState();
  const navigate = useNavigate();
  const [presets, setPresets] = useState<AvatarPreset[]>([]);

  useEffect(() => {
    if (playerState.status === 'ready' && !playerState.profile) {
      navigate('/onboarding', { replace: true });
    }
  }, [playerState.status, playerState.profile, navigate]);

  useEffect(() => {
    loadAvatarPresets().then(setPresets).catch(() => setPresets([]));
  }, []);

  const avatar = playerState.avatar;
  const [baseModel, setBaseModel] = useState(avatar?.base_model ?? 'human');
  const [hair, setHair] = useState(avatar?.hair ?? HAIR_OPTIONS[0].id);
  const [eyes, setEyes] = useState(avatar?.eyes ?? EYE_OPTIONS[0].id);
  const [outfit, setOutfit] = useState(avatar?.outfit ?? OUTFIT_OPTIONS[0].id);
  const [accent, setAccent] = useState(avatar?.accent ?? ACCENT_OPTIONS[0].id);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync local edit state once the real avatar loads (don't clobber
  // in-progress edits on unrelated re-renders).
  useEffect(() => {
    if (!avatar) return;
    setBaseModel(avatar.base_model);
    setHair(avatar.hair ?? HAIR_OPTIONS[0].id);
    setEyes(avatar.eyes ?? EYE_OPTIONS[0].id);
    setOutfit(avatar.outfit ?? OUTFIT_OPTIONS[0].id);
    setAccent(avatar.accent ?? ACCENT_OPTIONS[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatar?.updated_at]);

  if (playerState.status === 'loading' || !playerState.profile) {
    return (
      <RouteShell eyebrow="Identity" title="Avatar" description="" placeholder={false}>
        <LoadingState message="LOADING BIOFORM…" />
      </RouteShell>
    );
  }

  const preview = getAvatarPreview({ base_model: baseModel, preview_image_url: avatar?.preview_image_url ?? null });

  async function handleSave() {
    if (!session) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await savePlayerAvatar(session.user.id, { base_model: baseModel, hair, eyes, outfit, accent });
      trackEvent('avatar_onboarding_completed', { context: 'refinement' });
      await playerState.refresh();
      setSaved(true);
    } catch {
      setSaveError('Could not save your avatar. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <RouteShell
      eyebrow="Identity"
      title="Avatar"
      description="Refine the version of yourself that walks the galaxy. Full 3D customization arrives in a later phase — this is a lightweight, temporary representation."
      placeholder={false}
    >
      <div className="mr-onboard-form">
        <div
          aria-hidden="true"
          style={{
            width: 96,
            height: 96,
            borderRadius: 8,
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: 11,
            letterSpacing: '0.1em',
            color: 'var(--cyan)',
            background: 'rgba(0,229,255,0.05)',
          }}
        >
          {preview.kind === 'image' ? <img src={preview.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} /> : preview.label}
        </div>

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
              <button key={opt.id} type="button" className={`mr-onboard-chip${hair === opt.id ? ' active' : ''}`} onClick={() => setHair(opt.id)}>
                {opt.label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="mr-onboard-fieldset">
          <legend>Eyes</legend>
          <div className="mr-onboard-grid">
            {EYE_OPTIONS.map((opt) => (
              <button key={opt.id} type="button" className={`mr-onboard-chip${eyes === opt.id ? ' active' : ''}`} onClick={() => setEyes(opt.id)}>
                {opt.label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="mr-onboard-fieldset">
          <legend>Outfit</legend>
          <div className="mr-onboard-grid">
            {OUTFIT_OPTIONS.map((opt) => (
              <button key={opt.id} type="button" className={`mr-onboard-chip${outfit === opt.id ? ' active' : ''}`} onClick={() => setOutfit(opt.id)}>
                {opt.label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="mr-onboard-fieldset">
          <legend>Signal Accent</legend>
          <div className="mr-onboard-grid">
            {ACCENT_OPTIONS.map((opt) => (
              <button key={opt.id} type="button" className={`mr-onboard-chip${accent === opt.id ? ' active' : ''}`} onClick={() => setAccent(opt.id)}>
                {opt.label}
              </button>
            ))}
          </div>
        </fieldset>

        {saveError && (
          <p style={{ color: 'var(--pink)', fontSize: 13 }} role="alert">
            {saveError}
          </p>
        )}
        {saved && (
          <p style={{ color: 'var(--cyan)', fontSize: 13 }} role="status">
            Avatar saved.
          </p>
        )}
        <button type="button" className="network-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Synchronizing Avatar…' : 'Save Avatar'}
        </button>
      </div>
    </RouteShell>
  );
}
