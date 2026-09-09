# Moon Racer Events Page — VS Code Handoff

## Outcome

The former ticketed event area is now an evergreen **Transmission 003 recap and future-events portal**. The page also presents **Neon Nexus** as an incoming cyberpunk event campaign. The homepage links to the standalone React page at `/bearcubz/events/`.

## File map

- `events-app/` — editable React + TypeScript + Vite source
- `events/` — production build deployed by GitHub Pages
- `assets/events/` — clean source photography and optimized WebP assets
- `index.html` — updated homepage event teaser and footer links

## Local development

```bash
cd events-app
npm install
npm run dev
```

## Production build

```bash
cd events-app
npm run build
```

The build writes directly to `../events/`. Commit both `events-app/` and `events/`; GitHub Pages serves the compiled page from the latter.

## VS Code agent prompt

> Integrate the supplied Moon Racer events update into the current `bearcubz` repository. Preserve any newer unrelated work. Treat `events-app/` as the React source and `events/` as generated output. Confirm `vite.config.ts` keeps the production base `/bearcubz/events/`. Merge the homepage changes in `index.html`: remove the expired Eventbrite/countdown presentation, retain the new evergreen events teaser, and keep its `events/` link. Preserve the new Neon Nexus section between the Transmission 003 archive and the unidentified-delivery section. Use the wide Neon Nexus art as the immersive campaign panel and the portrait art as the clickable dossier. Keep the campaign labeled `Upcoming` and do not present its fictional Chrome District location as a confirmed real-world booking. Run `npm install` and `npm run build` from `events-app`, then run `git diff --check`. Verify the homepage link resolves to `/bearcubz/events/`, all five event images load, the mobile menu works, all three modal experiences open and close with Escape, and the music, gallery, merch, passport, Instagram, Spotify, YouTube, and TikTok links resolve correctly. Do not rewrite unrelated homepage sections.

## Interaction checklist

- Responsive desktop and mobile navigation
- `Follow the signal` scrolls to the next-transmission panel
- `View transmission` and the poster open the archive lightbox
- `Cyberpunk visuals` opens a two-image gallery
- The Neon Nexus wide campaign and portrait dossier load responsively
- `Explore transmission` opens both Neon Nexus campaign images
- Neon Nexus stays labeled as upcoming, with final details still to be announced
- Album, merch, passport, Instagram, Spotify, YouTube, and TikTok CTAs are real links
- Escape, close button, and backdrop click close the modal
- Reduced-motion preferences are respected

## Deployment note

The Vite base assumes the repository remains published at `https://cruzzi-myth.github.io/bearcubz/`. If the repository path changes, update `base` in `events-app/vite.config.ts` and rebuild.
