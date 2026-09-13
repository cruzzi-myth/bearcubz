# Moon Racer Album Vote

Source for the standalone React experience deployed at `/bearcubz/vote/`.

## Local development

```bash
cd vote-app
npm install
cp .env.example .env.local   # fill in the real values once the function is deployed
npm run dev
```

Without a `.env.local`, the app still runs — listening/browsing works,
the vote button just stays disabled with a small notice instead of
calling a real backend.

## Production build

```bash
npm run build
```

The production build writes directly to the repository's `vote/` directory. Commit both `vote-app/` and the generated `vote/` output for GitHub Pages.

## Replacing placeholders

- **Audio**: `public/audio/NN-slug.m4a` — one file per track, named to match `src/data/tracks.ts`.
- **Artwork**: `public/images/tracks/NN-slug.webp` — one cover per track, same naming.
- **Black Signal reference**: `public/images/black-signal-156.svg` — also duplicated at `../signal-lost-app/public/images/black-signal-156.svg`; replace both together. It's an SVG wrapping a real-alpha PNG (genuine transparency, verified — no baked-in checkerboard), presented as a normal image (`object-fit: contain`, drop-shadow glow); the glitch/chromatic-split effect is done externally with hue-rotated, screen-blended ghost copies, never by hiding a background on the base image.
- **Track metadata** (titles, producers, features, lore): edit the `seeds` array in `src/data/tracks.ts`. It's the single source of truth — everything else derives from it.

## Backend

This app talks to a Supabase Edge Function (`supabase/functions/moon-racer-vote`)
over `fetch`, not the `@supabase/supabase-js` client — see `src/lib/voteApi.ts`.
See the repo root `supabase/` directory for the migration and function source,
and the top-level handoff notes for deployment steps and required secrets.

## The Black Signal

`src/components/BlackSignal.tsx` + `BlackSignal.css` are duplicated verbatim
into `signal-lost-app/src/components/` so the two apps can build independently
(the same pattern `network-app` uses for its copy of Classic's `tokens.css`).
Keep both copies in sync by hand when editing either one.
