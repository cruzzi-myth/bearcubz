import { supabase } from './supabaseClient';
import type { Passport, PlayerState } from '../types/player';

// ============================================================
// Thin wrappers around the trusted RPCs that make up the player
// identity layer. Components never call supabase.rpc(...) directly —
// everything protected (Passport linking/creation, profile init)
// goes through here so there's exactly one place that knows the
// backend's function names and argument shapes.
// ============================================================

/** Reads the full player state for the current session in one round
 * trip. SECURITY INVOKER — RLS scopes every sub-select to auth.uid(),
 * so this can never return another player's data. */
export async function loadPlayerState(): Promise<PlayerState> {
  const { data, error } = await supabase.rpc('get_my_player_state');
  if (error) throw error;
  return (data as PlayerState) ?? { passport: null, profile: null, progress: null, abilities: null, avatar: null, settings: null };
}

/** Attempts to attach an existing (unlinked) Passport matching the
 * caller's verified auth email. Throws NO_PASSPORT_FOUND,
 * ALREADY_LINKED, or NOT_AUTHENTICATED (see services/errors.ts) —
 * callers should catch and translate, never show the raw message. */
export async function linkExistingPassport(): Promise<Passport> {
  const { data, error } = await supabase.rpc('link_my_passport');
  if (error) throw error;
  const record = Array.isArray(data) ? data[0] : data;
  if (!record) throw new Error('NO_PASSPORT_FOUND');
  return record as Passport;
}

/** New-player Passport creation. Reuses the same claim_passport RPC
 * that backs the standalone /passport/ registration page — no second,
 * incompatible Passport-creation path. `email` MUST be the caller's
 * own verified session email (never a user-editable field) so the
 * follow-up link_my_passport() call can find and attach it. */
export async function createNewPassport(email: string, racerName: string): Promise<Passport> {
  const { data, error } = await supabase.rpc('claim_passport', {
    p_email: email,
    p_racer_name: racerName,
  });
  if (error) throw error;
  const record = Array.isArray(data) ? data[0] : data;
  if (!record) throw new Error('UNKNOWN');
  return linkExistingPassport();
}

/** One-time, idempotent RPG profile bootstrap — creates profile,
 * progress (Level 0 / 0 XP), all six abilities at 0, default settings,
 * and the player_avatar row in a single SECURITY DEFINER transaction.
 * Safe to call again; the backend just returns current state if a
 * profile already exists. */
export async function initializePlayerProfile(
  username: string,
  displayName: string,
  avatarBaseModel: string,
): Promise<PlayerState> {
  const { data, error } = await supabase.rpc('initialize_player_profile', {
    p_username: username,
    p_display_name: displayName,
    p_avatar_base_model: avatarBaseModel,
  });
  if (error) throw error;
  return data as PlayerState;
}

/** Mirrors the DB's xp_for_level() so "XP until next level" never
 * hard-codes the curve on the client — same source of truth, one
 * extra cheap round trip, called once per level change. */
export async function xpRequiredForLevel(level: number): Promise<number> {
  const { data, error } = await supabase.rpc('xp_for_level', { p_level: level });
  if (error) throw error;
  return data as number;
}
