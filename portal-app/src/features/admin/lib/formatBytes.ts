// Stage K1.6L follow-up — extracted from AssetsTab.tsx for testability.
// Math.round(bytes / 1024) alone reads "0 KB" for anything under
// ~512 bytes, indistinguishable from a genuinely empty file (found
// via the real 209-byte K1.6K/K1.6L synthetic test fixture — a
// display rounding artifact only; the real Storage object was
// confirmed intact at the time).
export function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return '<1 KB';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
