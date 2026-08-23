import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RouteShell } from '../../components/RouteShell';
import { RequireAuth } from '../../components/RequireAuth';
import { LoadingState } from '../../components/LoadingState';
import { useAuth } from '../auth/AuthContext';
import { usePlayerState } from '../player/PlayerStateContext';
import { usePrefersReducedMotion } from '../../hooks/useReducedMotion';
import { savePlayerAvatar } from '../../services/avatarService';
import { confirmAvatarSpecies, completeInitialAvatar } from '../../services/playerState';
import { describeBackendError } from '../../services/errors';
import { trackEvent } from '../../services/analytics';
import { hasCompletedInitialAvatar, DASHBOARD_ROUTE } from '../../services/onboarding';
import { computeAvatarPreviewParams, resolveSpeciesAvatarRenderState } from '../../services/avatarPreview';
import {
  AVATAR_SPECIES,
  AVATAR_SPECIES_DEFINITIONS,
  getActiveReferenceImages,
  getGroupsForStep,
  getOptionsForFoundation,
  listEnabledAvatarSpecies,
  type AvatarCustomizationGroup,
  type AvatarWizardStep,
} from '../../data/avatarSpecies';
import type { AvatarSpeciesId, PlayerAvatarCosmeticPatch } from '../../types/player';
import {
  deserializeAvatarConfiguration,
  emptySpeciesDraft,
  serializeAvatarConfiguration,
  validateActiveDraft,
  validateSpeciesConfirmation,
  type AvatarConfigurationDraft,
  type AvatarSpeciesDraft,
} from '../../services/avatarValidation';
import { ChoiceGrid } from './components/ChoiceGrid';
import { ColorChoice } from './components/ColorChoice';
import { SliderControl } from './components/SliderControl';
import { ToggleControl } from './components/ToggleControl';
import { SpeciesCard } from './components/SpeciesCard';
import { FoundationCard } from './components/FoundationCard';
import { AvatarReferencePanel } from './components/AvatarReferencePanel';
import { HybridCompositionControl } from './components/HybridCompositionControl';
import { GlitchCompositionControl } from './components/GlitchCompositionControl';
import { SpeciesConfirmationModal } from './components/SpeciesConfirmationModal';
import './avatar-creator.css';

type WizardStepId = 'species' | 'foundation' | AvatarWizardStep | 'review';

const WIZARD_STEPS: { id: WizardStepId; label: string }[] = [
  { id: 'species', label: 'Species' },
  { id: 'foundation', label: 'Foundation' },
  { id: 'form', label: 'Form' },
  { id: 'features', label: 'Features' },
  { id: 'augmentation', label: 'Augmentation' },
  { id: 'style', label: 'Style' },
  { id: 'signal', label: 'Signal' },
  { id: 'review', label: 'Review' },
];

/**
 * Avatar Phase 2B/2C — the full six-species character creator, now
 * with a permanent species lock. Entirely data-driven from
 * avatarSpecies.ts: no per-species JSX branching beyond the two
 * identity-level composition controls (Hybrid ancestry, Glitch
 * consciousness composition).
 *
 * Before confirmation: free browsing/switching between all six species
 * (unchanged Phase 2B behavior). CONFIRM SPECIES on the Foundation step
 * calls confirmAvatarSpecies() — the only path that ever sets
 * player_avatar.species_confirmed_at. After that, this same route
 * becomes an appearance editor: species/ancestry render read-only, and
 * Review's action becomes either COMPLETE AVATAR (first time,
 * advances onboarding_stage to avatar_complete) or SAVE APPEARANCE
 * (a returning player editing cosmetics — no onboarding-state change).
 */
export function AvatarCreationPage() {
  return (
    <RequireAuth>
      <AvatarWizard />
    </RequireAuth>
  );
}

function AvatarWizard() {
  const { session } = useAuth();
  const playerState = usePlayerState();
  const navigate = useNavigate();
  const reducedMotion = usePrefersReducedMotion();

  const [stepIndex, setStepIndex] = useState(0);
  const [activeSpecies, setActiveSpecies] = useState<AvatarSpeciesId | null>(null);
  const [drafts, setDrafts] = useState<AvatarConfigurationDraft['speciesDrafts']>({});
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [completed, setCompleted] = useState(false);

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmErrors, setConfirmErrors] = useState<string[] | null>(null);

  const avatar = playerState.avatar;
  const isLocked = Boolean(avatar?.species_confirmed_at);
  const alreadyCompletedOnboarding = hasCompletedInitialAvatar(playerState);

  // Seed the wizard from the saved avatar exactly once it's loaded.
  // Identity fields for the CURRENTLY ACTIVE species come from the
  // first-class player_avatar columns (source of truth); every
  // species' cosmetic answers (including inactive ones the player was
  // mid-experiment with) come from configuration.speciesDrafts.
  useEffect(() => {
    if (initialized || !avatar) return;
    const config = deserializeAvatarConfiguration(avatar.configuration);
    const seededSpecies: AvatarSpeciesId | null =
      avatar.species ?? config.active.species ?? (AVATAR_SPECIES.includes(avatar.base_model as AvatarSpeciesId) ? (avatar.base_model as AvatarSpeciesId) : null);

    const nextDrafts = { ...config.speciesDrafts };
    if (seededSpecies) {
      const existing = nextDrafts[seededSpecies] ?? emptySpeciesDraft();
      nextDrafts[seededSpecies] = {
        ...existing,
        foundation: avatar.species === seededSpecies ? (avatar.archetype ?? existing.foundation) : existing.foundation,
        primarySpecies: avatar.primary_species ?? existing.primarySpecies ?? null,
        secondarySpecies: avatar.secondary_species ?? existing.secondarySpecies ?? null,
        hybridRatio: avatar.hybrid_ratio ?? existing.hybridRatio ?? 50,
        glitchHumanRatio: avatar.glitch_human_ratio ?? existing.glitchHumanRatio ?? 34,
        glitchAlienRatio: avatar.glitch_alien_ratio ?? existing.glitchAlienRatio ?? 33,
        glitchAiRatio: avatar.glitch_ai_ratio ?? existing.glitchAiRatio ?? 33,
      };
    }

    setDrafts(nextDrafts);
    setActiveSpecies(seededSpecies);
    setStepIndex(seededSpecies ? 1 : 0); // skip straight past species-select if one is already chosen
    setInitialized(true);
  }, [avatar, initialized]);

  const activeDraft = activeSpecies ? drafts[activeSpecies] : undefined;
  const speciesDef = activeSpecies ? AVATAR_SPECIES_DEFINITIONS[activeSpecies] : null;

  const step = WIZARD_STEPS[stepIndex];

  function updateDraft(species: AvatarSpeciesId, patch: Partial<AvatarSpeciesDraft>) {
    if (isLocked) return; // identity fields are immutable post-confirmation; nothing else uses updateDraft
    setDrafts((prev) => {
      const existing = prev[species] ?? emptySpeciesDraft();
      return { ...prev, [species]: { ...existing, ...patch } };
    });
    setSaved(false);
  }

  function updateGroupValue(species: AvatarSpeciesId, groupId: string, value: string | boolean) {
    setDrafts((prev) => {
      const existing = prev[species] ?? emptySpeciesDraft();
      return { ...prev, [species]: { ...existing, values: { ...existing.values, [groupId]: value } } };
    });
    setSaved(false);
  }

  function selectSpecies(id: AvatarSpeciesId) {
    if (isLocked) return; // the species grid isn't even rendered when locked, but guard anyway
    setActiveSpecies(id);
    setDrafts((prev) => {
      if (prev[id]) return prev;
      return { ...prev, [id]: { ...emptySpeciesDraft(), hybridRatio: 50, glitchHumanRatio: 34, glitchAlienRatio: 33, glitchAiRatio: 33 } };
    });
    trackEvent('avatar_onboarding_started', { context: 'creator', species: id });
    setStepIndex(1);
  }

  const foundationValidation = activeSpecies ? validateActiveDraft(activeSpecies, activeDraft) : { valid: false, errors: [] };

  function goNext() {
    if (step.id === 'foundation' && !isLocked) {
      // Pre-confirmation, Foundation's "Continue" is replaced by the
      // permanent confirmation flow — see the nav render below.
      return;
    }
    setStepIndex((i) => Math.min(i + 1, WIZARD_STEPS.length - 1));
  }
  function goBack() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  async function handleConfirmSpecies() {
    if (!activeSpecies || !activeDraft) return;
    const validation = validateSpeciesConfirmation({
      species: activeSpecies,
      primarySpecies: activeDraft.primarySpecies,
      secondarySpecies: activeDraft.secondarySpecies,
      hybridRatio: activeDraft.hybridRatio,
      glitchHumanRatio: activeDraft.glitchHumanRatio,
      glitchAlienRatio: activeDraft.glitchAlienRatio,
      glitchAiRatio: activeDraft.glitchAiRatio,
    });
    if (!validation.valid) {
      setConfirmErrors(validation.errors);
      return;
    }
    setConfirming(true);
    setConfirmErrors(null);
    try {
      await confirmAvatarSpecies({
        species: activeSpecies,
        primary_species: activeDraft.primarySpecies ?? null,
        secondary_species: activeDraft.secondarySpecies ?? null,
        hybrid_ratio: activeDraft.hybridRatio ?? null,
        glitch_human_ratio: activeDraft.glitchHumanRatio ?? null,
        glitch_alien_ratio: activeDraft.glitchAlienRatio ?? null,
        glitch_ai_ratio: activeDraft.glitchAiRatio ?? null,
      });
      await playerState.refresh();
      trackEvent('avatar_onboarding_completed', { context: 'species_confirmed', species: activeSpecies });
      setConfirmModalOpen(false);
      setStepIndex(2); // straight into Form — species is locked, nothing left to decide at Foundation
    } catch (err) {
      // Do NOT visually mark species as locked on failure — the modal
      // stays open with a real error, matching "if RPC fails, keep the
      // player on the confirmation step."
      setConfirmErrors([describeBackendError(err).body]);
    } finally {
      setConfirming(false);
    }
  }

  async function saveCosmetics(): Promise<void> {
    if (!activeSpecies || !activeDraft || !session) return;
    const configuration = serializeAvatarConfiguration({ version: 1, speciesDrafts: drafts, active: { species: activeSpecies } });
    const patch: PlayerAvatarCosmeticPatch = {
      archetype: activeDraft.foundation,
      configuration,
    };
    await savePlayerAvatar(session.user.id, patch);
  }

  async function handleSaveAppearance() {
    if (!activeSpecies || !activeDraft || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveCosmetics();
      await playerState.refresh();
      trackEvent('avatar_onboarding_completed', { context: 'appearance_saved', species: activeSpecies });
      setSaved(true);
    } catch {
      setSaveError(['Could not save your avatar. Please try again.']);
    } finally {
      setSaving(false);
    }
  }

  async function handleCompleteAvatar() {
    if (!activeSpecies || !activeDraft || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveCosmetics();
      await completeInitialAvatar();
      await playerState.refresh();
      trackEvent('avatar_onboarding_completed', { context: 'avatar_complete', species: activeSpecies });
      setCompleted(true);
    } catch (err) {
      setSaveError([describeBackendError(err).body]);
    } finally {
      setSaving(false);
    }
  }

  const referenceImages = useMemo(
    () => (activeSpecies ? getActiveReferenceImages(activeSpecies, activeDraft?.foundation) : []),
    [activeSpecies, activeDraft?.foundation],
  );

  const summaryLines = useMemo(() => buildSummaryLines(activeSpecies, activeDraft), [activeSpecies, activeDraft]);

  // Reactive schematic preview (see services/avatarPreview.ts) — reads
  // every cosmetic choice, so it updates on its own with no extra
  // wiring per group. Cosmetic changes update it instantly; a
  // species/foundation SWITCH gets a brief themed "scan" beat first
  // (skipped entirely under prefers-reduced-motion) so picking a new
  // species reads as loading a new identity rather than an instant
  // cut.
  const previewParams = useMemo(() => (activeSpecies ? computeAvatarPreviewParams(activeSpecies, activeDraft) : null), [activeSpecies, activeDraft]);
  // Real-image render state — same resolver core and AvatarRenderer
  // component /universe/onboarding uses (see resolveSpeciesAvatarRenderState
  // in services/avatarPreview.ts). Currently only resolves to
  // anything visual for Human/Racer's hair_style group; everything
  // else falls through to the schematic glyph above.
  const renderState = useMemo(() => (activeSpecies ? resolveSpeciesAvatarRenderState(activeSpecies, activeDraft) : null), [activeSpecies, activeDraft]);
  const [scanning, setScanning] = useState(false);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!initialized) return; // don't scan-flash on the very first seed from saved data
    if (reducedMotion) return;
    setScanning(true);
    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    scanTimeoutRef.current = setTimeout(() => setScanning(false), 450);
    return () => {
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSpecies, activeDraft?.foundation, reducedMotion]);

  if (playerState.status === 'loading' || !initialized) {
    return (
      <RouteShell eyebrow="Identity" title="Avatar Creator" description="" placeholder={false}>
        <LoadingState message="LOADING BIOFORM…" />
      </RouteShell>
    );
  }

  if (!playerState.profile) {
    return (
      <RouteShell eyebrow="Identity" title="Avatar Creator" description="" placeholder={false}>
        <LoadingState message="RESTORING PLAYER STATE…" />
      </RouteShell>
    );
  }

  return (
    <RouteShell
      eyebrow="Identity"
      title="Avatar Creator"
      description="Build an original Moon Racer character. Reference art shows each species' visual language — you are not recreating an existing character."
      placeholder={false}
    >
      <ol className="mr-avatar-steps" aria-label="Avatar creator progress">
        {WIZARD_STEPS.map((s, i) => (
          <li key={s.id} className={i === stepIndex ? 'active' : i < stepIndex ? 'done' : ''}>
            {s.label}
          </li>
        ))}
      </ol>

      <div className="mr-avatar-layout">
        <div className="mr-avatar-main">
          {step.id === 'species' &&
            (isLocked && speciesDef ? (
              <fieldset className="mr-onboard-fieldset">
                <legend>Species</legend>
                <p className="mr-identity-locked">
                  {speciesDef.displayName} · Permanent Identity
                </p>
                <p className="mr-avatar-help">
                  Your species was permanently confirmed and cannot be changed through normal gameplay. You can still edit
                  your appearance in the steps ahead.
                </p>
              </fieldset>
            ) : (
              <fieldset className="mr-onboard-fieldset">
                <legend>Choose a Species</legend>
                <div className="mr-species-grid">
                  {listEnabledAvatarSpecies().map((s) => (
                    <SpeciesCard key={s.id} species={s} selected={activeSpecies === s.id} onSelect={() => selectSpecies(s.id)} />
                  ))}
                </div>
              </fieldset>
            ))}

          {step.id === 'foundation' && speciesDef && activeSpecies && (
            <>
              <fieldset className="mr-onboard-fieldset">
                <legend>Choose a Foundation</legend>
                <div className="mr-species-grid">
                  {speciesDef.foundations.map((f) => (
                    <FoundationCard
                      key={f.id}
                      foundation={f}
                      selected={activeDraft?.foundation === f.id}
                      onSelect={() => updateDraft(activeSpecies, { foundation: f.id })}
                    />
                  ))}
                </div>
              </fieldset>
              {activeSpecies === 'hybrid' && (
                <HybridCompositionControl
                  primarySpecies={activeDraft?.primarySpecies ?? null}
                  secondarySpecies={activeDraft?.secondarySpecies ?? null}
                  hybridRatio={activeDraft?.hybridRatio ?? 50}
                  onChange={(patch) => updateDraft(activeSpecies, patch)}
                  locked={isLocked}
                />
              )}
              {activeSpecies === 'glitch' && (
                <GlitchCompositionControl
                  human={activeDraft?.glitchHumanRatio ?? 34}
                  alien={activeDraft?.glitchAlienRatio ?? 33}
                  ai={activeDraft?.glitchAiRatio ?? 33}
                  onChange={({ human, alien, ai }) => updateDraft(activeSpecies, { glitchHumanRatio: human, glitchAlienRatio: alien, glitchAiRatio: ai })}
                  locked={isLocked}
                />
              )}
              {!isLocked && !foundationValidation.valid && (
                <ul className="mr-avatar-errors" role="alert">
                  {foundationValidation.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
            </>
          )}

          {(step.id === 'form' || step.id === 'features' || step.id === 'augmentation' || step.id === 'style' || step.id === 'signal') &&
            speciesDef &&
            activeSpecies && (
              <div className="mr-avatar-groups">
                {getGroupsForStep(activeSpecies, step.id).map((group) => (
                  <GroupControl
                    key={group.id}
                    group={group}
                    foundationId={activeDraft?.foundation}
                    value={activeDraft?.values[group.id]}
                    onChange={(value) => updateGroupValue(activeSpecies, group.id, value)}
                  />
                ))}
                {getGroupsForStep(activeSpecies, step.id).length === 0 && <p className="mr-avatar-help">No controls for this step yet.</p>}
              </div>
            )}

          {step.id === 'review' && activeSpecies && speciesDef && (
            <div className="mr-avatar-review">
              <h2 className="mr-avatar-review__heading">{speciesDef.displayName}</h2>
              <ul>
                {summaryLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {saveError && (
                <ul className="mr-avatar-errors" role="alert">
                  {saveError.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
              {saved && !completed && (
                <p className="mr-avatar-saved" role="status">
                  Appearance saved.
                </p>
              )}
              {completed && (
                <div className="mr-avatar-saved" role="status">
                  <p style={{ margin: '0 0 12px' }}>IDENTITY COMPLETE — CORE ACCESS READY</p>
                  <button type="button" className="network-btn" onClick={() => navigate(DASHBOARD_ROUTE)}>
                    Continue →
                  </button>
                </div>
              )}
              {!completed && !alreadyCompletedOnboarding && (
                <button type="button" className="network-btn" onClick={handleCompleteAvatar} disabled={saving}>
                  {saving ? 'Synchronizing Avatar…' : 'Complete Avatar'}
                </button>
              )}
              {!completed && alreadyCompletedOnboarding && (
                <button type="button" className="network-btn" onClick={handleSaveAppearance} disabled={saving}>
                  {saving ? 'Synchronizing Avatar…' : 'Save Appearance'}
                </button>
              )}
            </div>
          )}

          {step.id !== 'species' && (
            <div className="mr-avatar-nav">
              <button type="button" className="network-btn mr-avatar-nav__back" onClick={goBack} disabled={stepIndex === 0}>
                ← Back
              </button>
              {step.id === 'foundation' && !isLocked ? (
                <button
                  type="button"
                  className="network-btn"
                  onClick={() => {
                    setConfirmErrors(null);
                    setConfirmModalOpen(true);
                  }}
                  disabled={!foundationValidation.valid}
                >
                  Confirm Species →
                </button>
              ) : (
                step.id !== 'review' && (
                  <button type="button" className="network-btn" onClick={goNext}>
                    Continue →
                  </button>
                )
              )}
            </div>
          )}
        </div>

        <AvatarReferencePanel
          speciesName={speciesDef?.displayName ?? 'Species'}
          images={referenceImages}
          summaryLines={summaryLines}
          previewParams={previewParams}
          previewScanning={scanning}
          renderState={renderState}
        />
      </div>

      {confirmModalOpen && speciesDef && (
        <SpeciesConfirmationModal
          speciesName={speciesDef.displayName}
          busy={confirming}
          errors={confirmErrors}
          onCancel={() => setConfirmModalOpen(false)}
          onConfirm={handleConfirmSpecies}
        />
      )}
    </RouteShell>
  );
}

function GroupControl({
  group,
  foundationId,
  value,
  onChange,
}: {
  group: AvatarCustomizationGroup;
  foundationId: string | null | undefined;
  value: string | boolean | undefined;
  onChange: (value: string | boolean) => void;
}) {
  if (group.control === 'choice') {
    return (
      <ChoiceGrid
        legend={group.label}
        helpText={group.helpText}
        options={getOptionsForFoundation(group, foundationId)}
        value={typeof value === 'string' ? value : undefined}
        onChange={onChange}
      />
    );
  }
  if (group.control === 'color') {
    return <ColorChoice legend={group.label} options={group.options ?? []} value={typeof value === 'string' ? value : undefined} onChange={onChange} />;
  }
  if (group.control === 'toggle') {
    return <ToggleControl label={group.label} checked={value === true} onChange={onChange} />;
  }
  // 'slider'
  return (
    <SliderControl
      label={group.label}
      value={typeof value === 'number' ? value : (group.min ?? 0)}
      min={group.min ?? 0}
      max={group.max ?? 100}
      step={group.sliderStep}
      unit={group.sliderUnit}
      helpText={group.helpText}
      onChange={(v) => onChange(String(v))}
    />
  );
}

function buildSummaryLines(species: AvatarSpeciesId | null, draft: AvatarSpeciesDraft | undefined): string[] {
  if (!species || !draft) return [];
  const def = AVATAR_SPECIES_DEFINITIONS[species];
  const lines: string[] = [];
  if (draft.foundation) {
    const foundation = def.foundations.find((f) => f.id === draft.foundation);
    lines.push(`Foundation: ${foundation?.label ?? draft.foundation}`);
  }
  if (species === 'hybrid') {
    if (draft.primarySpecies) lines.push(`Primary: ${AVATAR_SPECIES_DEFINITIONS[draft.primarySpecies].displayName}`);
    if (draft.secondarySpecies) lines.push(`Secondary: ${AVATAR_SPECIES_DEFINITIONS[draft.secondarySpecies].displayName}`);
    if (draft.hybridRatio !== null && draft.hybridRatio !== undefined) lines.push(`Secondary Influence: ${draft.hybridRatio}%`);
  }
  if (species === 'glitch') {
    lines.push(`Human ${draft.glitchHumanRatio ?? 0}% · Alien ${draft.glitchAlienRatio ?? 0}% · AI ${draft.glitchAiRatio ?? 0}%`);
  }
  for (const group of def.customizationGroups) {
    const value = draft.values[group.id];
    if (value === undefined || value === '') continue;
    if (typeof value === 'boolean') {
      if (value) lines.push(group.label);
      continue;
    }
    const optionLabel = group.options?.find((o) => o.id === value)?.label ?? String(value);
    lines.push(`${group.label}: ${optionLabel}`);
  }
  return lines;
}
