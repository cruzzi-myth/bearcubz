// Single source of truth for the album. Audio lives in public/audio,
// artwork in public/images/tracks — both named "<NN>-<slug>.*" so a
// replacement is just: drop in a new file with the same name.
//
// Titles and running order come from the final numbered delivery
// (22 tracks). Credits, producers, and lore are intentionally left
// blank rather than invented — fill them in here once supplied.

const BASE = import.meta.env.BASE_URL;

export type MoonRacerTrack = {
  id: number;
  slug: string;
  title: string;
  artist: string;
  featuredArtist?: string;
  producer?: string;
  durationLabel?: string;
  lore?: string;
  audioSrc: string;
  artworkSrc?: string;
};

type TrackSeed = { slug: string; title: string };

const seeds: TrackSeed[] = [
  { slug: 'life', title: 'L.I.F.E.' },
  { slug: 'the-anthem', title: 'The Anthem' },
  { slug: 'autonomous-ghost', title: 'Autonomous Ghost' },
  { slug: 'moon-racer', title: 'Moon Racer' },
  { slug: 'the-galactic-drip', title: 'The Galactic Drip' },
  { slug: 'trap-gang', title: 'Trap Gang' },
  { slug: 'get-in-the-whip', title: 'Get In The Whip' },
  { slug: 'lake-house', title: 'Lake House' },
  { slug: 'putting-girls-on-digital', title: 'Putting Girls On Digital' },
  { slug: 'galactic-static', title: 'Galactic Static' },
  { slug: 'binary-heartbeat', title: 'Binary Heartbeat' },
  { slug: 'neon-leather', title: 'Neon Leather' },
  { slug: 'top-gun', title: 'Top Gun' },
  { slug: 'bitter-velvet', title: 'Bitter Velvet' },
  { slug: 'penthouse-purgatory', title: 'Penthouse Purgatory' },
  { slug: 'glass-fortress', title: 'Glass Fortress (Operation Icy Wrist)' },
  { slug: '4am-perspective', title: '4AM Perspective' },
  { slug: 'chrome-hearts', title: 'Chrome Hearts' },
  { slug: 'elevate', title: 'Elevate' },
  { slug: 'arctic-glacier', title: 'Arctic Glacier' },
  { slug: 'mercury-circuit', title: 'Mercury Circuit' },
  { slug: '760-sahara-mix', title: '760 (Sahara Mix)' },
];

export const tracks: MoonRacerTrack[] = seeds.map((seed, index) => {
  const id = index + 1;
  const number = String(id).padStart(2, '0');
  return {
    id,
    slug: seed.slug,
    title: seed.title,
    artist: 'BEλR CUBZ',
    audioSrc: `${BASE}audio/${number}-${seed.slug}.m4a`,
    artworkSrc: `${BASE}images/tracks/${number}-${seed.slug}.webp`,
  };
});

export const ALBUM_TRACK_COUNT = tracks.length;

export function getTrackById(id: number): MoonRacerTrack | undefined {
  return tracks.find((track) => track.id === id);
}

export function getTrackBySlug(slug: string): MoonRacerTrack | undefined {
  return tracks.find((track) => track.slug === slug);
}
