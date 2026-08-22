import { supabase } from './supabaseClient';
import type { PlayerSettings } from '../types/player';

/** Owner-scoped UPDATE (RLS: user_id = auth.uid()) for the small set
 * of preferences the Phase 2 UI actually exposes. Other columns on
 * player_settings (voice_enabled, vr_enabled, avatar_quality, …) are
 * already seeded with sane defaults by initialize_player_profile and
 * simply aren't editable from any screen yet. */
export async function updatePlayerSettings(
  userId: string,
  patch: Partial<Pick<PlayerSettings, 'cinematic_travel' | 'reduced_motion'>>,
): Promise<void> {
  const { error } = await supabase.from('player_settings').update(patch).eq('user_id', userId);
  if (error) throw error;
}
