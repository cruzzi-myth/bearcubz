import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deployed at https://cruzzi-myth.github.io/bearcubz/signal-lost/ —
// same pattern as events-app/network-app/vote-app. Build output goes
// straight to ../signal-lost (the repo root folder GitHub Pages serves).
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/bearcubz/signal-lost/' : '/',
  build: {
    outDir: '../signal-lost',
    emptyOutDir: true,
  },
}));
