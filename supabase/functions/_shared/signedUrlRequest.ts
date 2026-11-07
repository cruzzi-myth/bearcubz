// Pure request-shape logic extracted from portal-signed-url — no
// Deno/Supabase APIs. The actual authorization decision for this
// endpoint is deliberately NOT made here: it's made by Postgres/RLS
// against the calling user's own session (see the comment in
// portal-signed-url/index.ts), which is exactly why that part has no
// pure function to extract or unit-test — it belongs to the RLS
// verification matrix (SIGNAL_PORTAL_SECURITY_AUDIT.md) instead. This
// module only covers the one piece of logic that IS pure: which
// storage path a given request should resolve to.
export interface SignedUrlPathInput {
  variant: 'full' | 'thumbnail' | undefined;
  storagePath: string;
  thumbnailStoragePath: string | null | undefined;
}

/** A thumbnail request with no thumbnail on record falls back to the
 * full asset path — never treated as "nothing to sign." Any other
 * variant value (including 'full', missing, or unrecognized) always
 * resolves to the full path. */
export function resolveSignedUrlPath(input: SignedUrlPathInput): string {
  if (input.variant === 'thumbnail' && input.thumbnailStoragePath) {
    return input.thumbnailStoragePath;
  }
  return input.storagePath;
}
