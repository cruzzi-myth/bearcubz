-- ============================================================
-- SIGNAL PORTAL — Phase 02: administrator passkeys (WebAuthn).
--
-- Public-key credentials only. Nothing biometric is ever stored or sent —
-- the authenticator verifies the person locally and only a signature
-- reaches the server. All three tables are reachable ONLY through the
-- service-role Edge Functions (portal-admin-passkeys, portal-passkey-auth):
-- RLS is enabled with no policies and every client grant is revoked.
-- ============================================================

create table public.portal_admin_passkeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credential_id text not null unique,          -- base64url credential ID
  public_key text not null,                    -- base64url COSE public key
  counter bigint not null default 0,           -- signature counter (replay/clone signal)
  transports text[] not null default '{}',
  device_type text null,                       -- 'singleDevice' | 'multiDevice'
  backed_up boolean not null default false,
  name text not null default 'Passkey' check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now(),
  last_used_at timestamptz null,
  revoked_at timestamptz null,
  revoked_by uuid null
);
create index portal_admin_passkeys_user_idx on public.portal_admin_passkeys (user_id) where revoked_at is null;

-- Single-use, short-lived challenges. Consumed by DELETE ... RETURNING so a
-- challenge can never be used twice, even by concurrent requests.
create table public.portal_webauthn_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge text not null,
  purpose text not null check (purpose in ('register', 'authenticate')),
  user_id uuid null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index portal_webauthn_challenges_expiry_idx on public.portal_webauthn_challenges (expires_at);

-- Attempt log used for rate limiting the unauthenticated passkey endpoint.
create table public.portal_passkey_attempts (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  kind text not null check (kind in ('options', 'verify')),
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index portal_passkey_attempts_recent_idx on public.portal_passkey_attempts (ip, created_at desc);

alter table public.portal_admin_passkeys enable row level security;
alter table public.portal_webauthn_challenges enable row level security;
alter table public.portal_passkey_attempts enable row level security;
revoke all on table public.portal_admin_passkeys from anon, authenticated;
revoke all on table public.portal_webauthn_challenges from anon, authenticated;
revoke all on table public.portal_passkey_attempts from anon, authenticated;
