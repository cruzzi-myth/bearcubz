import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deployed at https://cruzzi-myth.github.io/bearcubz/oracle/ — same
// subdirectory-of-a-subdirectory pattern as vote-app and events-app.
// Build output goes straight to ../oracle (the repo root's `oracle/`
// folder GitHub Pages serves); no separate "commit the dist folder"
// step to remember.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/oracle/' : '/',
  build: {
    outDir: '../oracle',
    emptyOutDir: true,
  },
}));
