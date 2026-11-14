export type ScannerConfig = {
  mode: 'cloudmersive' | 'dual'; cloudmersiveMaxBytes: number; clamavMaxBytes: number;
  artistMaxBytes: number; fallbackEnabled: false; workerUrl: string | null; workerToken: string | null;
};
export function scannerConfig(get: (name: string) => string | undefined = n => Deno.env.get(n)): ScannerConfig {
  function integer(name: string, fallback: number) {
    const raw = get(name); const n = raw === undefined ? fallback : Number(raw);
    if (!Number.isSafeInteger(n) || n < 1) throw new Error('INVALID_SCANNER_CONFIG');
    return n;
  }
  const mode = get('PORTAL_SCANNER_PROVIDER_MODE') ?? 'cloudmersive';
  if (mode !== 'cloudmersive' && mode !== 'dual') throw new Error('INVALID_SCANNER_CONFIG');
  if ((get('PORTAL_SCANNER_FALLBACK_ENABLED') ?? 'false') !== 'false') throw new Error('FALLBACK_NOT_SUPPORTED');
  const cloudmersiveMaxBytes = integer('PORTAL_CLOUDMERSIVE_MAX_BYTES', integer('CLOUDMERSIVE_MAX_FILE_SIZE_BYTES', 2_900_000));
  const clamavMaxBytes = integer('PORTAL_CLAMAV_MAX_BYTES', 100 * 1024 * 1024);
  const artistMaxBytes = integer('PORTAL_ARTIST_UPLOAD_MAX_BYTES', 2_900_000);
  if (cloudmersiveMaxBytes > 2_900_000 || clamavMaxBytes > 100 * 1024 * 1024 || (mode === 'cloudmersive' && artistMaxBytes > cloudmersiveMaxBytes) || artistMaxBytes > Math.max(cloudmersiveMaxBytes, clamavMaxBytes)) throw new Error('INVALID_SCANNER_CONFIG');
  const workerUrl = get('PORTAL_CLAMAV_WORKER_URL') ?? null;
  const workerToken = get('PORTAL_SCANNER_WORKER_TOKEN') ?? null;
  if (mode === 'dual' && (!workerUrl || !workerToken || workerToken.length < 32)) throw new Error('WORKER_NOT_CONFIGURED');
  if (workerUrl) {
    const url = new URL(workerUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('INVALID_WORKER_URL');
  }
  return { mode, cloudmersiveMaxBytes, clamavMaxBytes, artistMaxBytes, fallbackEnabled: false, workerUrl, workerToken };
}
export function routeScanner(size: number, config: ScannerConfig): 'cloudmersive' | 'clamav' | 'unsupported' {
  if (!Number.isSafeInteger(size) || size < 1) return 'unsupported';
  if (size <= config.cloudmersiveMaxBytes) return 'cloudmersive';
  if (config.mode === 'dual' && size <= config.clamavMaxBytes) return 'clamav';
  return 'unsupported';
}
