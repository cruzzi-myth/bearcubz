import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// This app is deployed to a SUBDIRECTORY of a subdirectory:
// https://cruzzi-myth.github.io/bearcubz/universe/
// so every asset URL must be prefixed with /bearcubz/universe/ in
// production. Locally we keep base at "/" so `npm run dev` is a
// normal http://localhost:5173/ experience.
//
// Build output goes straight to ../universe (the repo root's
// `universe/` folder, which is what GitHub Pages actually serves) —
// there is no separate "commit the dist folder" step to remember.
// (Renamed from `network/` — the source directory here keeps its
// original `network-app/` name; only the deployed path/route changed.)
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/bearcubz/universe/' : '/',
  build: {
    outDir: '../universe',
    emptyOutDir: true,
  },
}));
