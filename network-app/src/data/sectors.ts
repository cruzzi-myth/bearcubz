import type { Sector } from '../types';

// The fixed galaxy hierarchy. Do not rename or reorder these —
// they are canon, not placeholders.
export const sectors: Sector[] = [
  { id: 'the-core', name: 'The Core', description: '', unlocked: true },
  { id: 'sector-1', name: 'Sector 1', description: '', unlocked: false },
  { id: 'sector-2', name: 'Sector 2', description: '', unlocked: false },
  { id: 'sector-3', name: 'Sector 3', description: '', unlocked: false },
  { id: 'sector-4', name: 'Sector 4', description: '', unlocked: false },
  { id: 'sector-5', name: 'Sector 5', description: '', unlocked: false },
  { id: 'sector-6', name: 'Sector 6', description: '', unlocked: false },
  { id: 'sector-7', name: 'Sector 7', description: '', unlocked: false },
  { id: 'sector-8', name: 'Sector 8', description: '', unlocked: false },
  { id: 'sector-9', name: 'Sector 9', description: '', unlocked: false },
  { id: 'sector-10', name: 'Sector 10', description: '', unlocked: false },
  { id: 'sector-11', name: 'Sector 11', description: '', unlocked: false },
  { id: 'sector-12', name: 'Sector 12', description: '', unlocked: false },
  { id: 'outer-rim', name: 'Outer Rim', description: '', unlocked: false },
  { id: 'deep-signal-zone', name: 'Deep Signal Zone', description: '', unlocked: false },
  { id: 'lost-systems', name: 'Lost Systems', description: '', unlocked: false },
];

export function getSector(id: string): Sector | undefined {
  return sectors.find((s) => s.id === id);
}
