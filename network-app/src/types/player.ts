// ============================================================
// Player identity types — mirror the Supabase schema created by the
// phase2_player_identity_layer migration (see public.* tables in the
// moon-racer-passport project). Hand-written and narrow on purpose:
// only the columns the frontend actually reads/writes.
// ============================================================

/** What claim_passport / link_my_passport / get_my_player_state
 * return for the Passport — deliberately excludes id/user_id/email,
 * which the backend never sends back to the client either. */
export interface Passport {
  passport_id: string;
  racer_name: string;
  founder_status: string;
  tribe: string;
  sector: string;
  access_level: string;
  issue_date: string;
}

export interface PlayerProfile {
  user_id: string;
  username: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

/** Server-authoritative first-time-player progression (Avatar Phase
 * 2C). There is deliberately no client UPDATE grant on player_progress
 * at all — only trusted RPCs (initialize_player_profile,
 * confirm_avatar_species, complete_initial_avatar) ever move this
 * forward. 'core_arrival' / 'active_player' are reserved for the next
 * gameplay phase and are not yet reachable through any RPC. */
export type PlayerOnboardingStage =
  | 'passport_created'
  | 'species_selection'
  | 'avatar_customization'
  | 'avatar_complete'
  | 'core_arrival'
  | 'active_player';

/** level and rank are DB-generated columns (level_for_xp / rank_for_level)
 * — never computed or overridden on the client. */
export interface PlayerProgress {
  user_id: string;
  xp: number;
  level: number;
  rank: string;
  zip_balance: number;
  onboarding_stage: PlayerOnboardingStage;
  onboarding_completed_at: string | null;
  updated_at: string;
}

export const ABILITY_STATS = ['signal', 'speed', 'vision', 'energy', 'memory', 'style'] as const;
export type AbilityStat = (typeof ABILITY_STATS)[number];

export type PlayerAbilities = { user_id: string; updated_at: string } & Record<AbilityStat, number>;

export type AvatarModelFormat = 'glb' | 'gltf' | 'vrm';

/** The six permanent Moon Racer species roots. Stable lowercase
 * internal identifiers — display names are capitalized in the UI
 * only (see data/avatarSpecies.ts). Matches the DB CHECK constraints
 * on player_avatar.species/primary_species/secondary_species and
 * avatar_generations.species (avatar_phase1_species_foundation
 * migration) — do not add a value here without a matching migration. */
export const AVATAR_SPECIES = ['human', 'alien', 'hybrid', 'ai', 'mythraxian', 'glitch'] as const;
export type AvatarSpeciesId = (typeof AVATAR_SPECIES)[number];

/** Lifecycle of a player's avatar imagery. No AI generation exists
 * yet (Avatar Phase 1) — every real avatar today is 'none'. */
export type AvatarGenerationStatus = 'none' | 'draft' | 'generating' | 'candidate' | 'approved' | 'failed';

/** A single generated-image candidate's status (avatar_generations
 * table — a narrower vocabulary than AvatarGenerationStatus since a
 * generation row's mere existence already implies past 'none'). */
export type AvatarGenerationRecordStatus = 'draft' | 'generating' | 'candidate' | 'approved' | 'failed';

/** Provider-agnostic — nothing here assumes Avaturn or any specific
 * vendor. model_url/model_format stay null until a real 3D pipeline
 * exists; base_model + the cosmetic slots drive the Phase 1/2 preview.
 *
 * Root identity fields (species, hybrid/glitch composition, signal,
 * origin/faction, approved-generation reference) are dedicated
 * columns. Everything else species-specific and fast-growing (hair
 * style, chassis material, dermal pattern, …) lives in `configuration`
 * instead of getting a column per trait — see the migration comment
 * on player_avatar.configuration for why. */
export interface PlayerAvatar {
  user_id: string;
  avatar_provider: string;
  avatar_external_id: string | null;
  base_model: string;
  model_url: string | null;
  model_format: AvatarModelFormat | null;
  preview_image_url: string | null;
  face: string | null;
  body_type: string | null;
  skin: string | null;
  hair: string | null;
  hair_color: string | null;
  eyes: string | null;
  eye_style: string | null;
  outfit: string | null;
  mask: string | null;
  eyewear: string | null;
  accessory: string | null;
  accent: string | null;
  crest: string | null;
  cybernetics: string | null;
  background: string | null;
  customization_version: number;
  created_at: string;
  updated_at: string;

  // --- Avatar Phase 1: species foundation (all nullable — a player
  // who has only done the Phase 1 onboarding preset pick has every
  // one of these as null, and that is a valid, fully-supported state) ---
  species: AvatarSpeciesId | null;
  /** Species-specific starter visual foundation (e.g. Racer, Android,
   * Oracle). Visual foundation only — never an RPG occupation. */
  archetype: string | null;
  /** Set only when species === 'hybrid'. */
  primary_species: AvatarSpeciesId | null;
  secondary_species: AvatarSpeciesId | null;
  /** 0–100, primary_species's share. Only meaningful for Hybrid. */
  hybrid_ratio: number | null;
  /** The three Glitch consciousness-composition values. Distinct from
   * Hybrid ancestry — must sum to 100 once all three are set (DB
   * enforced), but may be partially filled while mid-configuration. */
  glitch_human_ratio: number | null;
  glitch_alien_ratio: number | null;
  glitch_ai_ratio: number | null;
  signal_affinity: string | null;
  signal_color: string | null;
  origin: string | null;
  faction: string | null;
  /** Species-specific cosmetic selections that don't warrant a
   * dedicated column. Shape is intentionally loose (Record<string,
   * unknown>) since it varies per species and will grow — species
   * modules (avatarSpecies.ts) document which keys each species uses,
   * but nothing here enforces that shape at the type level yet. */
  configuration: Record<string, unknown>;
  generation_status: AvatarGenerationStatus;
  generation_version: number;
  /** Denormalized copy of the approved generation's image_path. */
  approved_image_path: string | null;
  approved_generation_id: string | null;
  /** Avatar Phase 2C. NULL = species not yet permanently confirmed —
   * Phase 2B-style draft browsing/switching is still safe. Once set,
   * species/primary_species/secondary_species/hybrid_ratio/
   * glitch_*_ratio are immutable for normal authenticated clients,
   * enforced by the player_avatar_identity_lock DB trigger (not just
   * by this field existing) — see services/playerState.ts's
   * confirmAvatarSpecies(). */
  species_confirmed_at: string | null;
}

/** The fields confirmAvatarSpecies() permanently commits. Never part
 * of PlayerAvatarCosmeticPatch — once species_confirmed_at is set,
 * the DB trigger rejects direct client writes to any of these
 * regardless of what a component tries to send. */
export type PlayerAvatarIdentityFields = Pick<
  PlayerAvatar,
  'species' | 'primary_species' | 'secondary_species' | 'hybrid_ratio' | 'glitch_human_ratio' | 'glitch_alien_ratio' | 'glitch_ai_ratio'
>;

/** A generated-image candidate belonging to the player's one avatar
 * identity (player_avatar) — never a second avatar record. Rows are
 * only ever created by a trusted server path (RLS grants SELECT only;
 * no client INSERT/UPDATE exists as of Avatar Phase 1). */
export interface AvatarGeneration {
  id: string;
  user_id: string;
  species: AvatarSpeciesId;
  configuration: Record<string, unknown>;
  prompt_version: number;
  model_version: string | null;
  image_path: string | null;
  thumbnail_path: string | null;
  status: AvatarGenerationRecordStatus;
  error_code: string | null;
  created_at: string;
  approved_at: string | null;
}

/** Only the fields a player is allowed to edit via savePlayerAvatar() —
 * editable appearance, never permanent identity. Deliberately excludes
 * species/primary_species/secondary_species/hybrid_ratio/
 * glitch_*_ratio (Avatar Phase 2C: those are PlayerAvatarIdentityFields,
 * committed once via confirmAvatarSpecies() and DB-trigger-immutable
 * after that). `archetype` (the species "foundation") stays here — it
 * is cosmetic/visual, not part of the permanent-identity lock. This is
 * what makes it structurally impossible for a future barber/wardrobe/
 * customization terminal to accidentally mutate species: the type
 * they'd build against doesn't have the field. */
export type PlayerAvatarCosmeticPatch = Partial<
  Pick<
    PlayerAvatar,
    | 'base_model'
    | 'archetype'
    | 'face'
    | 'body_type'
    | 'skin'
    | 'hair'
    | 'hair_color'
    | 'eyes'
    | 'eye_style'
    | 'outfit'
    | 'mask'
    | 'eyewear'
    | 'accessory'
    | 'accent'
    | 'crest'
    | 'cybernetics'
    | 'background'
    | 'signal_affinity'
    | 'signal_color'
    | 'origin'
    | 'faction'
    | 'configuration'
  >
>;

export interface AvatarPreset {
  id: string;
  display_name: string;
  description: string;
  preview_image_url: string | null;
  base_model: string;
  sort_order: number;
}

export interface PlayerSettings {
  user_id: string;
  preferred_mode: 'classic' | 'network';
  cinematic_travel: boolean;
  reduced_motion: boolean;
  audio_enabled: boolean;
  music_volume: number;
  effects_volume: number;
  subtitles_enabled: boolean;
  voice_enabled: boolean;
  vr_enabled: boolean;
  vr_locomotion: string;
  avatar_quality: string;
  render_quality_3d: string;
  updated_at: string;
}

/** The aggregate shape returned by public.get_my_player_state(). Every
 * field is null until that layer of onboarding is complete — a brand
 * new authenticated user with no linked Passport gets every key null. */
export interface PlayerState {
  passport: Passport | null;
  profile: PlayerProfile | null;
  progress: PlayerProgress | null;
  abilities: PlayerAbilities | null;
  avatar: PlayerAvatar | null;
  settings: PlayerSettings | null;
}
