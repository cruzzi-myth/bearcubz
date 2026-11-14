// K1.6H.4 — native PostgreSQL rehearsal harness. Replays the REAL
// production-baseline migration files (all 17, including the
// unrelated moon-racer-vote/passport migrations that predate Signal
// Portal in this shared project -- not hand-waved with synthetic
// fixtures this time, unlike K1.6H.2's narrower "portal baseline (7)"
// shortcut) followed by the 12 pending migrations, scheduler blocks
// stripped. This is NOT a full Supabase runtime or a production
// restore -- see k16h4-migration-replay.md for exactly what it does
// and does not prove.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const port = process.env.K16H4_PG_PORT ?? '55495';
if (!/^\d+$/.test(port)) throw new Error('Invalid local port');
const psql = (sql) => execFileSync('/opt/homebrew/bin/psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', port, '-U', 'rehearsal', '-d', 'k16h4_rehearsal'], { input: sql, encoding: 'utf8' });

// Refuse every cluster except the disposable one this stage initialized.
const dataDir = psql('show data_directory;');
if (!dataDir.includes('k16h4-rehearsal')) throw new Error('Wrong local test cluster: ' + dataDir);

psql(`
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
  if not exists(select 1 from pg_roles where rolname='postgres') then create role postgres superuser; end if;
end $$;
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;
create schema if not exists cron;
create table if not exists auth.users(id uuid primary key, email text, created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
create table if not exists storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb);
alter table storage.objects enable row level security;
-- Real Supabase Storage helper (standard definition), needed by RLS
-- policies elsewhere in this baseline that key off storage.foldername(name)[1].
create or replace function storage.foldername(name text) returns text[] language plpgsql as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;
`);

const dir = new URL('../migrations/', import.meta.url);
const files = readdirSync(dir).filter((x) => x.endsWith('.sql')).sort();
const manifest = [];
const PENDING_START = '20261109040000';

for (const file of files) {
  const original = readFileSync(new URL(file, dir), 'utf8');
  let sql = original;
  const cronIndex = sql.search(/select cron\.schedule\(/);
  const schedulerOmitted = cronIndex !== -1;
  if (schedulerOmitted) sql = sql.slice(0, cronIndex);
  sql = sql.replace(/^create extension if not exists pg_(cron|net) with schema extensions;$/gm, '-- Managed extension absent in native harness; scheduler execution is NOT tested.');

  let status = 'applied';
  let errorMessage = null;
  try {
    psql('begin;\n' + sql + '\ncommit;');
  } catch (error) {
    status = 'failed';
    errorMessage = String(error.message ?? error).split('\n').slice(0, 5).join(' | ');
    // Roll back any partial transaction state so the next file starts clean.
    try { psql('rollback;'); } catch { /* no transaction open */ }
  }
  manifest.push({
    file,
    sha256: createHash('sha256').update(original).digest('hex'),
    phase: file < PENDING_START ? 'production-baseline (17)' : 'pending (12)',
    schedulerOmitted,
    status,
    errorMessage,
  });
  console.log(`${status === 'applied' ? 'PASS' : 'FAIL'} ${file}${errorMessage ? '  -- ' + errorMessage : ''}`);
}

writeFileSync(
  new URL('../../portal-app/docs/signal-portal/k16h4-native-replay-evidence.json', import.meta.url),
  JSON.stringify({ scope: 'Native PostgreSQL, full real 17-migration production baseline (including unrelated moon-racer-vote/passport migrations) + 12 real pending migrations, scheduler blocks stripped; no pg_cron/pg_net/GoTrue/Storage HTTP runtime', generatedAt: new Date().toISOString(), files: manifest }, null, 2) + '\n',
);
const failed = manifest.filter((m) => m.status === 'failed').length;
console.log(`\n${manifest.length - failed}/${manifest.length} migrations applied cleanly; ${failed} failed.`);
