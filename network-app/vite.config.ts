import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// This app is deployed to a SUBDIRECTORY of a subdirectory:
// https://cruzzi-myth.github.io/bearcubz/network/
// so every asset URL must be prefixed with /bearcubz/network/ in
// production. Locally we keep base at "/" so `npm run dev` is a
// normal http://localhost:5173/ experience.
//
// Build output goes straight to ../network (the repo root's
// `network/` folder, which is what GitHub Pages actually serves) —
// there is no separate "commit the dist folder" step to remember.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/bearcubz/network/' : '/',
  build: {
    outDir: '../network',
    emptyOutDir: true,
  },
}));
