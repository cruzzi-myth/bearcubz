import type { AbilityStat, PlayerAbilities } from '../types/player';
import { ABILITY_STATS } from '../types/player';

export { ABILITY_STATS };
export type { AbilityStat };

/** Reusable primitive for future skill checks ("SIGNAL >= 12", etc.).
 * No skill-check UI/game system yet — this just exists so later
 * phases don't reinvent it. Missing abilities (not yet initialized)
 * always fail the check rather than silently passing. */
export function meetsAbility(abilities: PlayerAbilities | null, stat: AbilityStat, minimum: number): boolean {
  if (!abilities) return false;
  return abilities[stat] >= minimum;
}

/** Convenience for checking several requirements at once, e.g. a
 * future mission gate needing SIGNAL >= 12 AND MEMORY >= 17. */
export function meetsAllAbilities(
  abilities: PlayerAbilities | null,
  requirements: Partial<Record<AbilityStat, number>>,
): boolean {
  return (Object.entries(requirements) as [AbilityStat, number][]).every(([stat, minimum]) =>
    meetsAbility(abilities, stat, minimum),
  );
}
