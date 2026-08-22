import type { Mission } from '../types';

// Sample data only — the mission engine itself is a later phase.
export const missions: Mission[] = [
  {
    id: 'signal-received',
    title: 'Signal Received',
    summary: 'Claim your Moon Racer Passport to begin.',
    status: 'available',
  },
  {
    id: 'first-transmission',
    title: 'First Transmission',
    summary: 'Locked until the Mission Engine ships.',
    status: 'locked',
    worldId: 'the-core',
  },
];
