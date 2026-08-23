import type { Location } from '../types';

// Sample data only — proves /universe/location/:locationId works.
export const locations: Location[] = [
  {
    id: 'the-core-plaza',
    worldId: 'the-core',
    name: 'The Core Plaza',
    tagline: 'The gathering point for the Original Tribe.',
    description: 'A central signal hub, always visible from anywhere in The Core.',
  },
  {
    id: 'castle-gate',
    worldId: 'romeos-castle',
    name: 'Castle Gate',
    tagline: "The entrance to Romeo's Castle.",
    description: 'Circuit-etched doors that only open for those the Signal recognizes.',
  },
];

export function getLocation(id: string): Location | undefined {
  return locations.find((l) => l.id === id);
}
