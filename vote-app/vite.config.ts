import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deployed at https://cruzzi-myth.github.io/bearcubz/vote/ — same
// subdirectory-of-a-subdirectory pattern as events-app and
// network-app. Build output goes straight to ../vote (the repo
// root's `vote/` folder GitHub Pages serves); no separate "commit
// the dist folder" step to remember.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/bearcubz/vote/' : '/',
  build: {
    outDir: '../vote',
    emptyOutDir: true,
  },
}));
