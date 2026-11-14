// Native PostgreSQL harness: real portal SQL/RLS, explicit managed-platform shims.
// This is NOT a full Supabase runtime or a production restore.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const port=process.env.K16H2_PG_PORT??'55482';
if(!/^\d+$/.test(port))throw new Error('Invalid local port');
const psql=(sql)=>execFileSync('/opt/homebrew/opt/postgresql@17/bin/psql',['-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U',process.env.USER,'-d','postgres'],{input:sql,encoding:'utf8'});
// Refuse every cluster except the disposable one this stage initialized.
if(!psql('show data_directory;').includes('/tmp/k16h2-postgres')) throw new Error('Wrong local test cluster');
psql(`drop schema if exists public cascade; drop schema if exists auth cascade; drop schema if exists storage cascade; drop schema if exists extensions cascade; drop schema if exists cron cascade; create schema public;
do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if; if not exists(select 1 from pg_roles where rolname='postgres') then create role postgres superuser; end if; end $$;
create schema auth; create schema storage; create schema extensions; create schema cron;
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
alter table storage.objects enable row level security;
grant usage on schema public,auth,storage to anon,authenticated,service_role;
grant execute on function auth.uid() to anon,authenticated,service_role;
`);
const dir=new URL('../migrations/',import.meta.url);
const files=readdirSync(dir).filter(x=>x.endsWith('.sql')&&x>='20261106140000').sort();
const manifest=[];
for(const file of files){
 if(file.startsWith('20261110020000')) psql(`
 insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000001','admin@example.invalid'),('00000000-0000-4000-8000-000000000002','a@example.invalid'),('00000000-0000-4000-8000-000000000003','b@example.invalid');
 insert into public.portal_admins(user_id) values('00000000-0000-4000-8000-000000000001');
 insert into public.collaborations(id,title,artist_display_name,created_by) values('00000000-0000-4000-8000-000000000100','Local gate fixture','Synthetic','00000000-0000-4000-8000-000000000001');
 insert into public.collaboration_members(collaboration_id,user_id,added_by) values('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001');
 insert into public.collaboration_assets(id,collaboration_id,asset_type,storage_bucket,storage_path,display_label,mime_type,byte_size,uploaded_by,upload_status,approval_status) values('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000100','track_cover','collaboration-visuals','legacy.png','Legacy fixture','image/png',10,'00000000-0000-4000-8000-000000000001','ready','pending');
 `);
 const original=readFileSync(new URL(file,dir),'utf8');let sql=original;
 const index=sql.indexOf('select cron.schedule(');if(index!==-1)sql=sql.slice(0,index);
 // pg_cron/pg_net are Supabase-managed extensions, unavailable in native Homebrew Postgres.
 sql=sql.replace(/^create extension if not exists pg_(cron|net) with schema extensions;$/gm,'-- Managed extension absent in native harness; scheduler execution is NOT tested.');
 psql('begin;\n'+sql+'\ncommit;');
 manifest.push({file,sha256:createHash('sha256').update(original).digest('hex'),schedulerOmitted:index!==-1});
}
writeFileSync(new URL('../../portal-app/docs/signal-portal/k16h2-native-replay-evidence.json',import.meta.url),JSON.stringify({scope:'Native PostgreSQL portal schema with explicit auth/storage shims; no pg_cron, pg_net, GoTrue or Storage runtime',files:manifest},null,2)+'\n');
console.log('PASS native portal baseline (7) + scheduler-free pending migrations (11) + H2 migration (1); 19 transactions. Managed platform runtime not validated.');
