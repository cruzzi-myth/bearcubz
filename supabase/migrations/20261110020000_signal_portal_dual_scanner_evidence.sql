-- K1.6H.2. No scheduler, secret value or project endpoint. Preserve all legacy assets.
alter table public.collaboration_feedback_attachments
  add column file_sha256 text check (file_sha256 is null or file_sha256 ~ '^[a-f0-9]{64}$'),
  add column scan_evidence jsonb;

alter table public.collaboration_assets
  add column security_required boolean not null default false,
  add column security_status text not null default 'legacy_unverified' check (security_status in ('legacy_unverified','pending','scanning','clean','infected','error')),
  add column file_sha256 text check (file_sha256 is null or file_sha256 ~ '^[a-f0-9]{64}$'),
  add column scan_evidence jsonb,
  add column thumbnail_scan_evidence jsonb,
  add column scan_request_id uuid,
  add column scan_attempt_count integer not null default 0,
  add column scan_lease_expires_at timestamptz,
  add column security_review_status text not null default 'pending' check (security_review_status in ('pending','approved','rejected')),
  add column security_reviewed_by uuid references auth.users(id),
  add column security_reviewed_at timestamptz;
-- Existing rows are explicitly legacy, not declared clean. Future inserts require evidence.
alter table public.collaboration_assets alter column security_required set default true;
alter table public.collaboration_assets alter column security_status set default 'pending';

create function public.valid_portal_scan_evidence(e jsonb, expected_sha text, expected_size bigint, attempt uuid)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(
    e->>'verdict' = 'clean' and e->>'complete' = 'true' and e->>'withinLimits' = 'true'
    and e->>'provider' in ('cloudmersive','cloudmersive-advanced','clamav')
    and e->>'fileSha256' = expected_sha and expected_sha ~ '^[a-f0-9]{64}$'
    and e->>'fileSize' = expected_size::text and e->>'attemptId' = attempt::text
    and e->>'policyVersion' = 'signal-portal-k16h2-v1'
    and e->>'startedAt' is not null and e->>'completedAt' is not null, false);
$$;
create function public.portal_asset_security_cleared(a public.collaboration_assets)
returns boolean language sql stable set search_path = public as $$
  select not a.security_required or (
    a.security_status = 'clean'
    and public.valid_portal_scan_evidence(a.scan_evidence,a.file_sha256,a.byte_size,a.scan_request_id)
    and (a.thumbnail_storage_path is null or (
      a.thumbnail_scan_evidence->>'verdict' = 'clean'
      and a.thumbnail_scan_evidence->>'complete' = 'true'
      and a.thumbnail_scan_evidence->>'withinLimits' = 'true'
      and a.thumbnail_scan_evidence->>'provider' in ('cloudmersive','cloudmersive-advanced','clamav')
      and a.thumbnail_scan_evidence->>'fileSha256' ~ '^[a-f0-9]{64}$'
      and a.thumbnail_scan_evidence->>'attemptId' = a.scan_request_id::text
      and a.thumbnail_scan_evidence->>'policyVersion' = 'signal-portal-k16h2-v1'))
    and a.security_review_status = 'approved' and a.security_reviewed_by is not null and a.security_reviewed_at is not null);
$$;

create function public.enforce_portal_asset_security()
returns trigger language plpgsql set search_path = public as $$
begin
  if TG_OP = 'INSERT' and not new.security_required then raise exception 'NEW_ASSET_REQUIRES_SECURITY'; end if;
  if TG_OP = 'UPDATE' and old.security_required and not new.security_required then raise exception 'SECURITY_DOWNGRADE_DENIED'; end if;
  if new.security_required and new.upload_status = 'ready' and not coalesce(public.portal_asset_security_cleared(new),false) then raise exception 'ASSET_SECURITY_NOT_CLEARED'; end if;
  if TG_OP = 'UPDATE' and old.security_required and old.upload_status = 'ready'
    and (new.storage_path is distinct from old.storage_path or new.storage_bucket is distinct from old.storage_bucket or new.byte_size is distinct from old.byte_size or new.thumbnail_storage_path is distinct from old.thumbnail_storage_path or new.file_sha256 is distinct from old.file_sha256)
    then raise exception 'RELEASED_ASSET_BYTES_IMMUTABLE'; end if;
  return new;
end $$;
create trigger enforce_portal_asset_security before insert or update on public.collaboration_assets
  for each row execute function public.enforce_portal_asset_security();

create function public.claim_asset_for_scan(p_asset_id uuid,p_request_id uuid,p_manual boolean default false)
returns setof public.collaboration_assets language sql security definer set search_path = public as $$
  update public.collaboration_assets
  set security_status='scanning',scan_request_id=p_request_id,scan_attempt_count=scan_attempt_count+1,
      scan_lease_expires_at=now()+interval '180 seconds',security_review_status='pending',security_reviewed_by=null,security_reviewed_at=null
  where id=p_asset_id and (security_status in ('pending','error','legacy_unverified') or (security_status='scanning' and scan_lease_expires_at<now()))
    and (not security_required or upload_status <> 'ready') and (p_manual or scan_attempt_count<3)
  returning *;
$$;
revoke all on function public.claim_asset_for_scan(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_asset_for_scan(uuid,uuid,boolean) to service_role;

-- Atomic cap at the claim itself; close the former read/check-then-claim race.
create or replace function public.claim_attachment_for_scan(p_attachment_id uuid,p_request_id uuid,p_lease_seconds integer)
returns table(id uuid,attempt_count integer,mime_type text,storage_bucket text,storage_path text)
language sql security definer set search_path=public as $$
  update public.collaboration_feedback_attachments
  set security_status='scanning',scan_request_id=p_request_id,scan_started_at=now(),scan_lease_expires_at=now()+make_interval(secs=>least(greatest(p_lease_seconds,30),180)),scan_attempt_count=scan_attempt_count+1,scan_last_error=null
  where collaboration_feedback_attachments.id=p_attachment_id and security_status in ('pending','error')
    and (scan_attempt_count<3 or current_setting('signal_portal.manual_scan_retry',true)='yes')
  returning collaboration_feedback_attachments.id,collaboration_feedback_attachments.scan_attempt_count,collaboration_feedback_attachments.mime_type,collaboration_feedback_attachments.storage_bucket,collaboration_feedback_attachments.storage_path;
$$;
-- Separate service-role-only wrapper for the already audited manual exception.
create function public.claim_attachment_for_manual_scan(p_attachment_id uuid,p_request_id uuid,p_lease_seconds integer)
returns table(id uuid,attempt_count integer,mime_type text,storage_bucket text,storage_path text)
language plpgsql security definer set search_path=public as $$
begin
 perform set_config('signal_portal.manual_scan_retry','yes',true);
 return query select * from public.claim_attachment_for_scan(p_attachment_id,p_request_id,p_lease_seconds);
end $$;
revoke all on function public.claim_attachment_for_manual_scan(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_attachment_for_manual_scan(uuid,uuid,integer) to service_role;

create index collaboration_assets_scan_lease_idx on public.collaboration_assets(scan_lease_expires_at) where security_status='scanning';
create table public.portal_scanner_usage (
  id uuid primary key default gen_random_uuid(), attempt_id uuid not null, provider text not null,
  completed_at timestamptz not null default now(), verdict text not null, file_size bigint not null,
  unique(attempt_id,provider)
);
alter table public.portal_scanner_usage enable row level security;
revoke all on public.portal_scanner_usage from anon,authenticated;
grant select on public.portal_scanner_usage to authenticated;
create policy "admin scanner usage" on public.portal_scanner_usage for select to authenticated using(public.is_portal_admin());
-- Counts are app-observed outcomes, not the provider account's actual monthly usage.

alter table public.collaboration_feedback_attachments add column scan_evidence_required boolean not null default false;
alter table public.collaboration_feedback_attachments alter column scan_evidence_required set default true;
alter table public.collaboration_feedback_attachments add constraint attachment_exact_byte_clearance
  check (not scan_evidence_required or status <> 'available' or public.valid_portal_scan_evidence(scan_evidence,file_sha256,byte_size,scan_request_id));
