// Where the oracle's images and audio live inside your project's `public` folder.
// This site is served from a GitHub Pages sub-path (/bearcubz/oracle/ in
// production, see oracle-app/vite.config.js), so ASSET_BASE is derived from
// Vite's own configured base — same pattern as vote-app/src/data/tracks.ts —
// rather than a hardcoded root-absolute path. Resolves to:
//   dev:  /moon-racer-oracle
//   prod: /bearcubz/oracle/moon-racer-oracle
export const ASSET_BASE = `${import.meta.env.BASE_URL}moon-racer-oracle`;

export const asset = (file) => `${ASSET_BASE}/${file}`;
