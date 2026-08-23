import type { World } from '../types';

// Sample data only — just enough to prove /universe/world/:worldId
// is genuinely data-driven. Future phases add worlds here (or from
// a real content source) without touching WorldPage.
export const worlds: World[] = [
  {
    id: 'the-core',
    sectorId: 'the-core',
    name: 'The Core',
    tagline: 'Where the Signal began.',
    description:
      'The heart of the Moon Racer galaxy. Every transmission, every tribe member, every story traces back here.',
    locationIds: ['the-core-plaza'],
  },
  {
    id: 'romeos-castle',
    sectorId: 'the-core',
    name: "Romeo's Castle",
    tagline: 'The Digital Architect’s domain.',
    description:
      'A fortress of code and light built by Romeo, the Digital Architect — one of the three figures at the center of Moon Racer I.',
    locationIds: ['castle-gate'],
  },
];

export function getWorld(id: string): World | undefined {
  return worlds.find((w) => w.id === id);
}
