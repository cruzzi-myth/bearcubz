import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

// Next America/Los_Angeles midnight, expressed as an absolute instant —
// computed via Intl so it's correct across both PST/PDT offsets without
// hardcoding a fixed UTC offset.
function nextPacificMidnightIso(): string {
  const timeZone = 'America/Los_Angeles';
  const partsFor = (date: Date) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    return {
      year: value('year'), month: value('month'), day: value('day'),
      hour: value('hour'), minute: value('minute'), second: value('second'),
    };
  };

  const offsetAt = (date: Date) => {
    const p = partsFor(date);
    const representedAsUtc = Date.UTC(
      p.year, p.month - 1, p.day, p.hour, p.minute, p.second,
    );
    return representedAsUtc - date.getTime();
  };

  const today = partsFor(new Date());
  const midnightWallClock = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  let result = new Date(midnightWallClock.getTime() - offsetAt(midnightWallClock));
  result = new Date(midnightWallClock.getTime() - offsetAt(result));
  return result.toISOString();
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const pepper = Deno.env.get('MOON_RACER_DEVICE_PEPPER');
  if (!supabaseUrl || !serviceKey || !pepper) return json({ error: 'SERVER_CONFIG' }, 500);

  let body: { action?: string; deviceId?: string; trackId?: number };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }

  if (!body.deviceId || body.deviceId.length > 128) {
    return json({ error: 'INVALID_DEVICE' }, 400);
  }

  const deviceHash = await sha256(`${pepper}:${body.deviceId}`);
  const client = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const existing = await client
    .from('moon_racer_votes')
    .select('track_id')
    .eq('device_hash', deviceHash)
    .eq('vote_day', today)
    .maybeSingle();

  if (existing.error) return json({ error: 'STATUS_FAILED' }, 500);

  const results = async () => {
    const response = await client.rpc('moon_racer_vote_results');
    if (response.error) throw response.error;
    return response.data;
  };

  if (body.action === 'status') {
    if (!existing.data) return json({ votedToday: false, resetAt: nextPacificMidnightIso() });
    return json({
      votedToday: true,
      trackId: existing.data.track_id,
      results: await results(),
      resetAt: nextPacificMidnightIso(),
    });
  }

  if (body.action !== 'vote' || !Number.isInteger(body.trackId) || body.trackId! < 1 || body.trackId! > 22) {
    return json({ error: 'INVALID_VOTE' }, 400);
  }

  if (existing.data) {
    return json({
      error: 'ALREADY_VOTED',
      votedToday: true,
      trackId: existing.data.track_id,
      results: await results(),
      resetAt: nextPacificMidnightIso(),
    }, 409);
  }

  const inserted = await client.from('moon_racer_votes').insert({
    track_id: body.trackId,
    device_hash: deviceHash,
    vote_day: today,
  });

  if (inserted.error?.code === '23505') {
    // Lost a race against another request from the same device — the
    // unique (device_hash, vote_day) constraint caught it first.
    const raced = await client
      .from('moon_racer_votes')
      .select('track_id')
      .eq('device_hash', deviceHash)
      .eq('vote_day', today)
      .single();
    return json({
      error: 'ALREADY_VOTED',
      votedToday: true,
      trackId: raced.data?.track_id,
      results: await results(),
      resetAt: nextPacificMidnightIso(),
    }, 409);
  }

  if (inserted.error) return json({ error: 'VOTE_FAILED' }, 500);

  return json({
    ok: true,
    trackId: body.trackId,
    results: await results(),
    resetAt: nextPacificMidnightIso(),
  });
});
