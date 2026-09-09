# Moon Racer Events

Source for the standalone React experience deployed at `/bearcubz/events/`.

## Local development

```bash
cd events-app
npm install
npm run dev
```

## Production build

```bash
npm run build
```

The production build writes directly to the repository's `events/` directory. Commit both `events-app/` and the generated `events/` output for GitHub Pages.

Shared source images live in `assets/events/`. Do not hand-edit hashed files in `events/assets/`; rebuild the application instead.
