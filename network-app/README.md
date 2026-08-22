# Moon Racer Network

The React + Vite + TypeScript RPG shell for the Moon Racer universe.
Deployed at `https://cruzzi-myth.github.io/bearcubz/network/`.

This is a **separate app from Classic Mode**. The Classic BEλR CUBZ
site (`../index.html`) and the Passport registration flow
(`../passport/`) are plain static HTML/CSS/JS and are not built or
touched by anything in here — see "Split-site architecture" below.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173/
```

## Build & deploy

There is no CI/build step yet — this repo has none for the rest of
the site either. To publish a change:

```bash
npm run build     # type-checks, then writes straight to ../network
cd ..
git add network network-app
git commit -m "..."
git push
```

`vite.config.ts` builds directly into the repo root's `network/`
folder — that IS the deployed output, no separate "copy dist"
step. Both the source (`network-app/`) and the build output
(`network/`) are committed, since GitHub Pages here serves whatever
is in the repo with no build pipeline of its own.

## Split-site architecture

Classic Mode stays exactly as it always has: a static site at the
repo root, untouched by this app, best for SEO and zero regression
risk. This app owns only `/network/*`. The two are joined by plain
links:

- Classic → `<a href="https://cruzzi-myth.github.io/bearcubz/network/">Enter Moon Racer Network</a>` (nav)
- Network → "Return to Classic Site" in `MoonRacerLayout`'s HUD

## Routing

`react-router-dom` with `basename="/bearcubz/network"` in production
(`/` in local dev — see `App.tsx`). Route paths in
`src/routes/index.tsx` are relative to that basename: `path: 'galaxy'`
is `https://cruzzi-myth.github.io/bearcubz/network/galaxy`.

GitHub Pages has no server-side SPA rewriting, so deep links and
hard refreshes are handled by `../404.html` (only rewrites
`/bearcubz/network/*` paths — everything else falls through to a
plain "not found") plus a small bootstrap script in `index.html`
that restores the real URL via `history.replaceState` before React
mounts. See the comments in both files before touching either.

## Folder structure

```
src/
  app/            reserved for app-shell composition if it grows
  components/     shared, generic UI (RouteShell, etc.)
  data/           typed sample content (sectors, worlds, missions, canon…)
  features/       one folder per RPG system (galaxy, worlds, auth, audio…)
  hooks/          useReducedMotion, useDocumentTitle
  layouts/        MoonRacerLayout (the only layout — Classic isn't rendered here)
  pages/          route-level pages that don't belong to a specific feature
  routes/         the route table
  services/       analytics.ts (event abstraction, no provider wired yet)
  styles/         tokens.css — copied from Classic's :root, keep in sync
  types/          Sector, World, Location, Character, Mission, Artifact, CanonEntry, Transmission
```

## Not implemented yet (by design — see Phase 1 deliverable notes)

Supabase auth, persistent player data, XP/leveling, BIT economy,
real inventory, the mission engine, AI NPCs, multiplayer, VR, real
Apple/Google Wallet passes, a real Moon Racer Radio track. All the
shells and types these will plug into already exist.
