// Exact supported patch releases. Do not admit prereleases or arbitrary version prefixes.
// ClamAV support matrix verified 2026-11-09; Docker stays pinned to 1.4.6 LTS.
export const SUPPORTED_CLAMAV_VERSIONS: readonly string[] = ['1.4.6', '1.5.4'];
export function isSupportedClamavVersion(version: unknown): version is string {
  return typeof version === 'string' && SUPPORTED_CLAMAV_VERSIONS.includes(version);
}

export const CLAMAV_VERIFICATION_VERSION = 'clamav-bounded-entries-v2';
