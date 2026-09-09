import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/bearcubz/events/' : '/',
  build: {
    outDir: '../events',
    emptyOutDir: true,
  },
}));
