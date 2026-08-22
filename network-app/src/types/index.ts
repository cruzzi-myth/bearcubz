// ============================================================
// Moon Racer Network — core content types.
//
// These describe the *shape* of the eventual galaxy so future
// phases can add real worlds, missions, and lore by adding data,
// not by writing new components. Phase 1 ships only enough sample
// data (see src/data/) to prove each template renders correctly.
// ============================================================

/** The 15 top-level regions of the galaxy map. Names are fixed —
 * do not invent alternate sector names in future phases. */
export type SectorId =
  | 'the-core'
  | 'sector-1'
  | 'sector-2'
  | 'sector-3'
  | 'sector-4'
  | 'sector-5'
  | 'sector-6'
  | 'sector-7'
  | 'sector-8'
  | 'sector-9'
  | 'sector-10'
  | 'sector-11'
  | 'sector-12'
  | 'outer-rim'
  | 'deep-signal-zone'
  | 'lost-systems';

export interface Sector {
  id: SectorId;
  name: string;
  /** Short HUD-style description; empty until a future phase writes lore. */
  description: string;
  /** Sector is visitable in the current build (has at least one World). */
  unlocked: boolean;
}

export interface World {
  id: string;
  sectorId: SectorId;
  name: string;
  tagline: string;
  description: string;
  /** Path to a hero image once art exists; placeholder-safe when omitted. */
  heroImage?: string;
  locationIds: string[];
}

export interface Location {
  id: string;
  worldId: string;
  name: string;
  tagline: string;
  description: string;
  heroImage?: string;
}

export interface Character {
  id: string;
  name: string;
  role: string;
  bio: string;
  portrait?: string;
}

export type MissionStatus = 'locked' | 'available' | 'active' | 'complete';

export interface Mission {
  id: string;
  title: string;
  summary: string;
  status: MissionStatus;
  worldId?: string;
}

export interface Artifact {
  id: string;
  name: string;
  description: string;
  locationId?: string;
}

export interface CanonEntry {
  id: string;
  title: string;
  category: string;
  body: string;
}

export interface Transmission {
  id: string;
  title: string;
  description: string;
  /** Audio/video source, once media pipeline exists. */
  mediaSrc?: string;
}
