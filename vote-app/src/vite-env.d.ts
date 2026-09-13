/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MOON_RACER_VOTE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
