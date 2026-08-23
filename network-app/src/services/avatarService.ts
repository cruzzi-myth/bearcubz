import { supabase } from './supabaseClient';
import { AVATAR_REFERENCE_BASE } from '../data/avatarSpecies';
import { sanitizeCosmeticPatch } from './avatarValidation';
import type { AvatarGeneration, AvatarPreset, PlayerAvatar, PlayerAvatarCosmeticPatch, AvatarModelFormat } from '../types/player';

/** Resolves a species reference image's relative path (e.g.
 * 'human/moon-racer.png') to a real URL under the app's base path —
 * works in both dev ("/") and production ("/bearcubz/network/"). */
export function getAvatarReferenceUrl(relativePath: string): string {
  return `${import.meta.env.BASE_URL}${AVATAR_REFERENCE_BASE}${relativePath}`;
}

// ============================================================
// Centralized avatar data access. Components never touch
// player_avatar / avatar_presets directly — everything about how the
// avatar is stored, previewed, or (eventually) rendered as a real 3D
// model sits behind this layer so a future vendor integration
// (Avaturn or otherwise) is a change here, not a change to every
// screen that shows an avatar.
// ============================================================

/** Public, provider-agnostic base forms (human/mythraxian/ai/alien/
 * glitch/hybrid) — readable by anyone, including guests previewing
 * before they sign in. */
export async function loadAvatarPresets(): Promise<AvatarPreset[]> {
  const { data, error } = await supabase.from('avatar_presets').select('*').order('sort_order');
  if (error) throw error;
  return data as AvatarPreset[];
}

/** The signed-in player's current avatar row, or null if onboarding
 * hasn't reached avatar init yet. */
export async function loadPlayerAvatar(): Promise<PlayerAvatar | null> {
  const { data, error } = await supabase.from('player_avatar').select('*').maybeSingle();
  if (error) throw error;
  return data as PlayerAvatar | null;
}

/** Owner-scoped UPDATE (RLS: user_id = auth.uid()) — only the cosmetic
 * columns are ever passed in, never xp/level/zip, which don't even
 * exist on this table. */
export async function savePlayerAvatar(userId: string, patch: PlayerAvatarCosmeticPatch): Promise<PlayerAvatar> {
  // Runtime defense-in-depth: even though PlayerAvatarCosmeticPatch
  // already excludes permanent-identity fields at compile time, strip
  // them again in case this ever gets called with untyped/spread data.
  // The player_avatar_identity_lock DB trigger is the real boundary —
  // this just keeps a buggy call from even attempting the mutation.
  const safePatch = sanitizeCosmeticPatch(patch);
  const { data, error } = await supabase
    .from('player_avatar')
    .update(safePatch)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw error;
  return data as PlayerAvatar;
}

/** Phase 2 has no real render pipeline or final art yet — this
 * resolves a temporary, clearly-labeled Moon Racer-themed
 * representation per base model rather than a generic avatar. Swap
 * this one function out once real preview art/renders exist. */
export function getAvatarPreview(avatar: Pick<PlayerAvatar, 'base_model' | 'preview_image_url'> | null): {
  kind: 'image' | 'placeholder';
  src?: string;
  label: string;
} {
  if (!avatar) return { kind: 'placeholder', label: 'NO SIGNAL' };
  if (avatar.preview_image_url) return { kind: 'image', src: avatar.preview_image_url, label: avatar.base_model };
  return { kind: 'placeholder', label: avatar.base_model.toUpperCase() };
}

/** The signed-in player's generated-image candidate history, newest
 * first. Always empty as of Avatar Phase 1 (nothing writes to
 * avatar_generations yet) — this exists so Phase 2+ UI has a ready
 * read path the day generation rows start appearing. RLS restricts
 * this to the caller's own rows; there is no client write path. */
export async function loadAvatarGenerations(): Promise<AvatarGeneration[]> {
  const { data, error } = await supabase.from('avatar_generations').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data as AvatarGeneration[];
}

/** Provider-agnostic pass-through for the future 3D pipeline. Nothing
 * calls this yet for real rendering — it exists so the data shape
 * (GLB/glTF/VRM, external provider + id) is already threaded through
 * the service layer instead of bolted on later. */
export function getAvatarModelReference(avatar: PlayerAvatar | null): {
  provider: string;
  externalId: string | null;
  modelUrl: string | null;
  modelFormat: AvatarModelFormat | null;
} | null {
  if (!avatar) return null;
  return {
    provider: avatar.avatar_provider,
    externalId: avatar.avatar_external_id,
    modelUrl: avatar.model_url,
    modelFormat: avatar.model_format,
  };
}
