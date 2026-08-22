import { useEffect, useMemo, useState } from 'react';
import { RouteShell } from '../../components/RouteShell';
import { RequireAuth } from '../../components/RequireAuth';
import { LoadingState } from '../../components/LoadingState';
import { useAuth } from '../auth/AuthContext';
import { usePlayerState } from '../player/PlayerStateContext';
import { savePlayerAvatar } from '../../services/avatarService';
import { trackEvent } from '../../services/analytics';
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
 * Avatar Phase 2B — the full six-species character creator. Entirely
 * data-driven from avatarSpecies.ts: no per-species JSX branching
 * beyond the two identity-level composition controls (Hybrid
 * ancestry, Glitch consciousness composition), which write to
 * player_avatar's first-class columns rather than the configuration
 * jsonb. No image generation — this only builds and saves the
 * structured configuration that a later phase will read.
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

  const [stepIndex, setStepIndex] = useState(0);
  const [activeSpecies, setActiveSpecies] = useState<AvatarSpeciesId | null>(null);
  const [drafts, setDrafts] = useState<AvatarConfigurationDraft['speciesDrafts']>({});
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);

  const avatar = playerState.avatar;

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
    if (step.id === 'foundation' && !foundationValidation.valid) return;
    setStepIndex((i) => Math.min(i + 1, WIZARD_STEPS.length - 1));
  }
  function goBack() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  async function handleSave() {
    if (!activeSpecies || !activeDraft || !session) return;
    const validation = validateActiveDraft(activeSpecies, activeDraft);
    if (!validation.valid) {
      setSaveError(validation.errors);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const configuration = serializeAvatarConfiguration({ version: 1, speciesDrafts: drafts, active: { species: activeSpecies } });
      const patch: PlayerAvatarCosmeticPatch = {
        species: activeSpecies,
        archetype: activeDraft.foundation,
        primary_species: activeSpecies === 'hybrid' ? (activeDraft.primarySpecies ?? null) : null,
        secondary_species: activeSpecies === 'hybrid' ? (activeDraft.secondarySpecies ?? null) : null,
        hybrid_ratio: activeSpecies === 'hybrid' ? (activeDraft.hybridRatio ?? null) : null,
        glitch_human_ratio: activeSpecies === 'glitch' ? (activeDraft.glitchHumanRatio ?? null) : null,
        glitch_alien_ratio: activeSpecies === 'glitch' ? (activeDraft.glitchAlienRatio ?? null) : null,
        glitch_ai_ratio: activeSpecies === 'glitch' ? (activeDraft.glitchAiRatio ?? null) : null,
        configuration,
      };
      await savePlayerAvatar(session.user.id, patch);
      await playerState.refresh();
      trackEvent('avatar_onboarding_completed', { context: 'creator', species: activeSpecies });
      setSaved(true);
    } catch {
      setSaveError(['Could not save your avatar. Please try again.']);
    } finally {
      setSaving(false);
    }
  }

  const referenceImages = useMemo(
    () => (activeSpecies ? getActiveReferenceImages(activeSpecies, activeDraft?.foundation) : []),
    [activeSpecies, activeDraft?.foundation],
  );

  const summaryLines = useMemo(() => buildSummaryLines(activeSpecies, activeDraft), [activeSpecies, activeDraft]);

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
          {step.id === 'species' && (
            <fieldset className="mr-onboard-fieldset">
              <legend>Choose a Species</legend>
              <div className="mr-species-grid">
                {listEnabledAvatarSpecies().map((s) => (
                  <SpeciesCard key={s.id} species={s} selected={activeSpecies === s.id} onSelect={() => selectSpecies(s.id)} />
                ))}
              </div>
            </fieldset>
          )}

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
                />
              )}
              {activeSpecies === 'glitch' && (
                <GlitchCompositionControl
                  human={activeDraft?.glitchHumanRatio ?? 34}
                  alien={activeDraft?.glitchAlienRatio ?? 33}
                  ai={activeDraft?.glitchAiRatio ?? 33}
                  onChange={({ human, alien, ai }) => updateDraft(activeSpecies, { glitchHumanRatio: human, glitchAlienRatio: alien, glitchAiRatio: ai })}
                />
              )}
              {!foundationValidation.valid && (
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
              {saved && (
                <p className="mr-avatar-saved" role="status">
                  Avatar saved.
                </p>
              )}
              <button type="button" className="network-btn" onClick={handleSave} disabled={saving}>
                {saving ? 'Synchronizing Avatar…' : 'Save Avatar'}
              </button>
            </div>
          )}

          {step.id !== 'species' && (
            <div className="mr-avatar-nav">
              <button type="button" className="network-btn mr-avatar-nav__back" onClick={goBack} disabled={stepIndex === 0}>
                ← Back
              </button>
              {step.id !== 'review' && (
                <button type="button" className="network-btn" onClick={goNext} disabled={step.id === 'foundation' && !foundationValidation.valid}>
                  Continue →
                </button>
              )}
            </div>
          )}
        </div>

        <AvatarReferencePanel speciesName={speciesDef?.displayName ?? 'Species'} images={referenceImages} summaryLines={summaryLines} />
      </div>
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
