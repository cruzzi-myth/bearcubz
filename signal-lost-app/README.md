# Moon Racer — Signal Lost

Source for the standalone Black Signal error/interruption page deployed at `/bearcubz/signal-lost/`.

Renders `<BlackSignal mode="page" reason={...} />` full-page, reading `reason`
from a safe query-parameter whitelist:

```
/signal-lost/?reason=unmapped
/signal-lost/?reason=erased
/signal-lost/?reason=offline
/signal-lost/?reason=error
/signal-lost/?reason=not-found
```

Anything missing, misspelled, or not on that list falls back to `not-found` —
see `src/App.tsx`. Use this page as the destination for placeholder links that
genuinely have no destination yet; never for a link that should work.

## Local development

```bash
cd signal-lost-app
npm install
npm run dev
```

## Production build

```bash
npm run build
```

Writes directly to the repository's `signal-lost/` directory. Commit both
`signal-lost-app/` and the generated `signal-lost/` output.

## The Black Signal component

`src/components/BlackSignal.tsx` + `BlackSignal.css` here are a verbatim copy
of the same files in `../vote-app/src/components/` (that's where `/vote/`'s
overlay use of the same component lives). Keep both copies in sync by hand.
