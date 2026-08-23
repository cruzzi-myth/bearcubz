# Moon Racer Universe

The React + Vite + TypeScript RPG shell for the Moon Racer universe.
Deployed at `https://cruzzi-myth.github.io/bearcubz/universe/`.

(This source directory keeps its original `network-app/` name from
Phase 1 — only the deployed route/branding changed from "Network" to
"Universe". Renaming the directory itself wasn't worth the churn.)

This is a **separate app from Classic Mode**. The Classic BEλR CUBZ
site (`../index.html`) and the Passport registration flow
(`../passport/`) are plain static HTML/CSS/JS and are not built or
touched by anything in here — see "Split-site architecture" below.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173/
npm run test     # vitest — pure-logic unit tests (species/avatar/onboarding)
npm run lint     # oxlint
```

## Build & deploy

There is no CI/build step yet — this repo has none for the rest of
the site either. To publish a change:

```bash
npm run build     # type-checks, then writes straight to ../universe
cd ..
git add universe network-app
git commit -m "..."
git push
```

`vite.config.ts` builds directly into the repo root's `universe/`
folder — that IS the deployed output, no separate "copy dist"
step. Both the source (`network-app/`) and the build output
(`universe/`) are committed, since GitHub Pages here serves whatever
is in the repo with no build pipeline of its own.

## Split-site architecture

Classic Mode stays exactly as it always has: a static site at the
repo root, untouched by this app, best for SEO and zero regression
risk. This app owns only `/universe/*`. The two are joined by plain
links:

- Classic → `<a href="https://cruzzi-myth.github.io/bearcubz/universe/">Enter Moon Racer Universe</a>` (nav)
- Universe → "Return to Classic Site" in `MoonRacerLayout`'s HUD

## Routing

`react-router-dom` with `basename="/bearcubz/universe"` in production
(`/` in local dev — see `App.tsx`). Route paths in
`src/routes/index.tsx` are relative to that basename: `path: 'galaxy'`
is `https://cruzzi-myth.github.io/bearcubz/universe/galaxy`.

GitHub Pages has no server-side SPA rewriting, so deep links and
hard refreshes are handled by `../404.html` (only rewrites
`/bearcubz/universe/*` paths — everything else falls through to a
plain "not found") plus a small bootstrap script in `index.html`
that restores the real URL via `history.replaceState` before React
mounts. See the comments in both files before touching either.

**If you ever change the deployed path/base again**, also update the
Supabase Auth "Redirect URLs" allow-list (Dashboard → Authentication →
URL Configuration) to match — `AuthContext.tsx`'s magic-link
`emailRedirectTo` is derived from `import.meta.env.BASE_URL` and will
silently stop matching the allow-list otherwise.

## Folder structure

```
src/
  components/     shared, generic UI (RouteShell, RequireAuth, etc.)
  data/           typed content (sectors, worlds, missions, canon, avatarSpecies…)
  features/       one folder per system (avatar, auth, onboarding, player, worlds…)
  hooks/          useReducedMotion, useDocumentTitle
  layouts/        MoonRacerLayout + MobileNav (the only layout — Classic isn't rendered here)
  pages/          route-level pages that don't belong to a specific feature
  routes/         the route table
  services/       Supabase-backed services (auth, avatar, onboarding, playerState…),
                   analytics.ts (event abstraction, no provider wired yet)
  styles/         tokens.css — copied from Classic's :root, keep in sync
  types/          player.ts (PlayerAvatar, PlayerOnboardingStage, etc.) + sample-content types
```

Some internal identifiers (component names, CSS classes like
`network-btn`/`network-home`, a couple of code comments, the
`preferred_mode` DB enum value) still say "network" — they're
implementation-internal, not user-facing, and weren't renamed when the
route/branding moved to "Universe."

## Status

Supabase Auth, Passport linking, persistent player profile/progression/
abilities/settings, a full six-species avatar creator with a permanent
species lock, and server-backed onboarding-stage routing are all live.
Not yet built: Core Arrival/starting-tavern gameplay, mission engine,
AI avatar image generation, real inventory, multiplayer, VR.
