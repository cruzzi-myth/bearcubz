// ============================================================
// Translates backend error codes (raised via `raise exception 'CODE'`
// in the SECURITY DEFINER functions, or Supabase Auth error messages)
// into the Moon Racer UI copy from the Phase 2 brief. Nothing that
// reaches a screen should ever be a raw Postgres/PostgREST message.
// ============================================================

export type BackendErrorCode =
  | 'NO_PASSPORT_FOUND'
  | 'ALREADY_LINKED'
  | 'NOT_AUTHENTICATED'
  | 'EMAIL_EXISTS'
  | 'NAME_TAKEN'
  | 'INVALID_EMAIL'
  | 'INVALID_NAME'
  | 'USERNAME_TAKEN'
  | 'INVALID_USERNAME'
  | 'INVALID_DISPLAY_NAME'
  | 'UNKNOWN';

const KNOWN_CODES: BackendErrorCode[] = [
  'NO_PASSPORT_FOUND',
  'ALREADY_LINKED',
  'NOT_AUTHENTICATED',
  'EMAIL_EXISTS',
  'NAME_TAKEN',
  'INVALID_EMAIL',
  'INVALID_NAME',
  'USERNAME_TAKEN',
  'INVALID_USERNAME',
  'INVALID_DISPLAY_NAME',
];

/** Supabase wraps a `raise exception 'CODE'` as an error whose
 * `message` contains the code (sometimes with extra Postgres detail
 * appended) — this pulls the known code out of that text. */
export function parseBackendError(error: unknown): BackendErrorCode {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const found = KNOWN_CODES.find((code) => message.includes(code));
  return found ?? 'UNKNOWN';
}

export interface UiError {
  title: string;
  body: string;
}

const COPY: Record<BackendErrorCode, UiError> = {
  NO_PASSPORT_FOUND: {
    title: 'NO EXISTING PASSPORT DETECTED',
    body: 'Your identity has been verified, but no Moon Racer Passport is associated with this signal.',
  },
  ALREADY_LINKED: {
    title: 'PASSPORT ACCESS DENIED',
    body: 'This Passport is already bound to another authenticated identity. If this is your Passport, contact support to recover it.',
  },
  NOT_AUTHENTICATED: {
    title: 'SIGNAL VERIFICATION REQUIRED',
    body: 'Please authenticate before accessing Passport systems.',
  },
  EMAIL_EXISTS: {
    title: 'PASSPORT ALREADY CLAIMED',
    body: 'A Passport already exists for that email. Sign in to link it instead of creating a new one.',
  },
  NAME_TAKEN: {
    title: 'RACER NAME TAKEN',
    body: 'That Racer Name is already claimed. Try another.',
  },
  INVALID_EMAIL: {
    title: 'SIGNAL REJECTED',
    body: 'Enter a valid email address.',
  },
  INVALID_NAME: {
    title: 'RACER NAME REJECTED',
    body: "Racer Name must be 2–24 characters (letters, numbers, spaces, - _ . ' only).",
  },
  USERNAME_TAKEN: {
    title: 'CALLSIGN TAKEN',
    body: 'That username is already in use. Try another.',
  },
  INVALID_USERNAME: {
    title: 'CALLSIGN REJECTED',
    body: "Username must be 2–24 characters (letters, numbers, spaces, - _ . ' only).",
  },
  INVALID_DISPLAY_NAME: {
    title: 'DISPLAY NAME REJECTED',
    body: 'Display name must be 2–32 characters.',
  },
  UNKNOWN: {
    title: 'SIGNAL LOST',
    body: 'Something went wrong. Please try again in a moment.',
  },
};

export function describeBackendError(error: unknown): UiError {
  return COPY[parseBackendError(error)];
}
