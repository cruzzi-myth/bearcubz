import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { validateSupabaseEnv } from './viteEnvValidation.js';

// Deployed at https://bearcubz.com/portal/ — same subdirectory
// pattern as every other app in this repo. Build output goes
// straight to ../portal (the repo root's `portal/` folder GitHub
// Pages serves); no separate "commit the dist folder" step to
// remember.

// Stage I3A: fail-closed environment validation. A production build
// run from this exact checkout previously embedded the DEVELOPMENT
// project's credentials, because portal-app/.env.local (created for
// local dev work) is loaded by Vite for every mode, including
// production, and there was no check that the wrong env had leaked
// in. This runs in Node at build time (unlike anything in src/,
// which only ever executes in the browser, too late for the build
// command itself to fail) — so a misconfigured production build now
// fails immediately with a clear message, exit code non-zero, before
// a single byte is written to portal/. The actual check logic lives
// in viteEnvValidation.ts so it can be unit-tested directly.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  validateSupabaseEnv(mode, env);

  return {
    plugins: [react()],
    base: mode === 'production' ? '/portal/' : '/',
    build: {
      outDir: '../portal',
      emptyOutDir: true,
    },
  };
});
