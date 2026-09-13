# Moon Racer album vote — Supabase backend

This is the backend for `/vote/`: a migration (`migrations/`) and one Edge
Function (`functions/moon-racer-vote/`). Nothing here is deployed automatically —
GitHub Pages only serves static files, so these need to be pushed to Supabase
separately, once, by whoever owns the project.

The rest of this site's Supabase-backed features (`network-app`, `passport/`)
already talk to project `drsidtagxezznqviupsr` (see
`network-app/src/services/supabaseClient.ts`). Deploying this migration and
function to that **same** project is the natural choice — one Supabase
project for the whole site — but nothing here hardcodes that assumption.

## One-time setup (owner's machine/account)

```bash
npm install -g supabase   # if you don't already have the CLI
supabase login
supabase link --project-ref drsidtagxezznqviupsr   # or your project's ref
```

## Deploy the migration

```bash
supabase db push
```

This creates `public.moon_racer_votes` (RLS enabled, no direct anon/authenticated
grants — the table is only reachable through the function below) and the
`moon_racer_vote_results()` RPC used to compute standings.

## Set the function secret

Generate a long random value and store it as a function secret — **never** in
frontend source, `.env` files, or anything committed to git:

```bash
supabase secrets set MOON_RACER_DEVICE_PEPPER="$(openssl rand -hex 32)"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically to
every Edge Function by Supabase — you don't set those yourself.

## Deploy the function

```bash
supabase functions deploy moon-racer-vote
```

Supabase will print the function's URL, of the form:

```
https://<project-ref>.supabase.co/functions/v1/moon-racer-vote
```

## Wire the frontend

In `vote-app/.env.local` (never commit this file):

```env
VITE_MOON_RACER_VOTE_URL=https://<project-ref>.supabase.co/functions/v1/moon-racer-vote
VITE_SUPABASE_ANON_KEY=<the project's public anon/publishable key>
```

Both of these are public values (the anon key is meant to ship in the
frontend bundle — it's already public in `passport/passport.js` and
`network-app/src/services/supabaseClient.ts`). Rebuild `vote-app` after
setting them so the production `vote/` bundle picks them up.

## Verifying it works

```bash
# Check status for a fake device (no vote yet):
curl -s -X POST "$VITE_MOON_RACER_VOTE_URL" \
  -H "content-type: application/json" -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -d '{"action":"status","deviceId":"test-device-1"}'

# Cast a vote:
curl -s -X POST "$VITE_MOON_RACER_VOTE_URL" \
  -H "content-type: application/json" -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -d '{"action":"vote","deviceId":"test-device-1","trackId":4}'

# Vote again with the same device the same day -> HTTP 409 ALREADY_VOTED:
curl -s -i -X POST "$VITE_MOON_RACER_VOTE_URL" \
  -H "content-type: application/json" -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -d '{"action":"vote","deviceId":"test-device-1","trackId":9}'
```

The first `vote` call should return `{"ok":true, "trackId":4, "results":[...22 rows...], "resetAt": "..."}`.
The repeat should come back as HTTP 409 with `"error":"ALREADY_VOTED"`.
