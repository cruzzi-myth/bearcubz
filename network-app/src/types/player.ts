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

/** level and rank are DB-generated columns (level_for_xp / rank_for_level)
 * — never computed or overridden on the client. */
export interface PlayerProgress {
  user_id: string;
  xp: number;
  level: number;
  rank: string;
  zip_balance: number;
  updated_at: string;
}

export const ABILITY_STATS = ['signal', 'speed', 'vision', 'energy', 'memory', 'style'] as const;
export type AbilityStat = (typeof ABILITY_STATS)[number];

export type PlayerAbilities = { user_id: string; updated_at: string } & Record<AbilityStat, number>;

export type AvatarModelFormat = 'glb' | 'gltf' | 'vrm';

/** Provider-agnostic — nothing here assumes Avaturn or any specific
 * vendor. model_url/model_format stay null until a real 3D pipeline
 * exists; base_model + the cosmetic slots drive the Phase 2 preview. */
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
}

/** Only the fields a player is allowed to edit via savePlayerAvatar(). */
export type PlayerAvatarCosmeticPatch = Partial<
  Pick<
    PlayerAvatar,
    | 'base_model'
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
