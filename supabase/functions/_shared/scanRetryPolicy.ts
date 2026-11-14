// Stage K1.6G section 2 — classifies a scan error detail string
// (from malwareScan.ts's ScanResult.detail) into "genuinely
// recoverable, worth an automatic retry" vs. not, and computes the
// bounded, exponential-backoff-with-jitter retry schedule. This is
// the ONE place that decision is made, so the automatic scheduler
// (portal-scan-recovery) and the manual admin retry path can't drift
// out of sync about what counts as retryable.

export const MAX_AUTOMATIC_SCAN_ATTEMPTS = 3;

// Lease duration: must exceed the maximum time a genuinely in-flight
// scan could legitimately still be running. The scan call itself has
// its own internal 20s AbortController timeout (malwareScan.ts); the
// OUTER Edge Function invocation (download + signature check + scan
// call) is bounded by Supabase's own wall-clock limit (150s on the
// Free plan, 400s on paid — see the K1.6F scanner-operations report).
// 180s comfortably exceeds the scan call's own ceiling and the
// Free-plan wall-clock ceiling, so a genuinely in-flight scan is never
// prematurely reclaimed, while a truly stuck row still recovers
// within a few scheduler ticks rather than being stuck forever.
export const SCAN_LEASE_SECONDS = 180;

export type ErrorCategory =
  | 'network_failure'
  | 'vendor_timeout'
  | 'vendor_rate_limited'
  | 'invalid_vendor_response'
  | 'unsupported_file_size'
  | 'permanent_config_error'
  | 'vendor_error'
  | 'lease_expired'
  | 'unknown';

export function categorizeScanError(detail: string | null): ErrorCategory {
  if (!detail) return 'unknown';
  if (detail.startsWith('EXCEEDS_SCANNER_SIZE_LIMIT')) return 'unsupported_file_size';
  if (detail === 'SCANNER_NOT_CONFIGURED') return 'permanent_config_error';
  if (detail.startsWith('HTTP_429_RATE_LIMITED')) return 'vendor_rate_limited';
  if (detail.startsWith('INVALID_RESPONSE')) return 'invalid_vendor_response';
  if (detail.startsWith('HTTP_')) return 'vendor_error';
  if (detail === 'SCAN_TIMEOUT') return 'vendor_timeout';
  if (detail === 'SCAN_NETWORK_ERROR') return 'network_failure';
  if (detail === 'LEASE_EXPIRED') return 'lease_expired';
  return 'unknown';
}

/** Genuinely malware-confirmed or structurally-unsafe-archive
 * verdicts are never auto-retried (section 2: "Do not automatically
 * retry confirmed unsafe content") — those are 'infected' verdicts,
 * not errors, and never reach this function at all (claimAndRunScan
 * only calls this for the 'error' branch). This function only ever
 * decides among already-erred attempts. */
export function isAutoRetryable(detail: string | null): boolean {
  const category = categorizeScanError(detail);
  return (
    category === 'network_failure' ||
    category === 'vendor_timeout' ||
    category === 'vendor_rate_limited' ||
    category === 'invalid_vendor_response' ||
    category === 'vendor_error' ||
    category === 'lease_expired'
  );
}

/** Exponential backoff with jitter, in seconds, keyed off the attempt
 * number that JUST failed (1-indexed). A rate-limited response gets a
 * longer base delay than an ordinary transient error, since Cloudmersive's
 * advertised free-tier rate is ~1 request/second — retrying it fast
 * would just trip the same limit again. */
export function computeBackoffSeconds(attemptNumber: number, category: ErrorCategory): number {
  const base = category === 'vendor_rate_limited' ? 60 : 20;
  const exponential = base * 2 ** Math.max(0, attemptNumber - 1);
  const capped = Math.min(exponential, 900); // never wait more than 15 minutes between automatic attempts
  const jitterFraction = 0.2; // ±20%
  const jitter = capped * jitterFraction * (Math.random() * 2 - 1);
  return Math.max(5, Math.round(capped + jitter));
}
