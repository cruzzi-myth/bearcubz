// This app is served from a GitHub Pages sub-path (/portal/ in
// production, / in dev) — same pattern as the Oracle app's
// config.js. Plain string literals in JSX are never rewritten by
// Vite's `base` config (only `import`ed assets and HTML/CSS are), so
// every reference to a /public asset must go through this helper
// instead of a hardcoded "/assets/..." path, or it will silently
// collide with the Classic site's own /assets/ folder once deployed.
export function portalAsset(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}
