// Stage K1.6G section 7 — local ZIP archive-safety validation,
// supplementing (never replacing) the genuine Cloudmersive Advanced
// scan. Deliberately dependency-free: this only ever reads the ZIP's
// own End-Of-Central-Directory and Central-Directory-File-Header
// metadata (a well-defined, small binary format) to validate
// structure, entry count, declared sizes, and paths — it NEVER
// decompresses or extracts a single byte of any entry's actual
// content, anywhere, which is itself a structural guarantee that this
// validator cannot be the thing that "extracts archive contents into
// public storage" (it extracts nothing, full stop). A maintained
// third-party ZIP library was considered and deliberately not used:
// everything required here is metadata-only inspection, and adding a
// decompression-capable dependency for a validator that must never
// decompress anything would be the larger, less-justified risk.
//
// Declared sizes in ZIP metadata are advisory — nothing here is
// cryptographically guaranteed, and an adversarial archive could lie.
// That is exactly why this is a SUPPLEMENT: Cloudmersive's own
// Advanced-endpoint scan actually unpacks the archive, which this
// code deliberately never does.

export interface ZipLimits {
  maxEntries: number;
  maxDeclaredUncompressedBytes: number;
  maxExpansionRatio: number;
}

// Stage K1.6G section 7's own proposed starting values — explicitly
// policy choices for review, not previously-verified product
// requirements (per the brief's own framing).
export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxEntries: 100,
  maxDeclaredUncompressedBytes: 100 * 1024 * 1024,
  maxExpansionRatio: 20,
};

const EXECUTABLE_SCRIPT_EXTENSIONS = new Set([
  'exe', 'dll', 'com', 'scr', 'msi', 'bat', 'cmd', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'sh', 'bash', 'app', 'command', 'jar',
]);
const ARCHIVE_EXTENSIONS = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz']);

export interface ZipValidationResult {
  ok: boolean;
  /** Short, stable reason code for a rejection — never a raw parser exception message. */
  reason?: string;
  entryCount?: number;
  totalDeclaredUncompressedBytes?: number;
  expansionRatio?: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const MIN_EOCD_SIZE = 22;
const MAX_COMMENT_SIZE = 65535;

function readUint32LE(bytes: Uint8Array, offset: number): number {
  // The final `>>> 0` must wrap the WHOLE combined expression, not
  // just the last term: `|` always produces a signed int32 in JS, so
  // a value with bit 31 set (>= 2^31, a real possibility for a
  // declared size field) would otherwise come back negative and fail
  // an `=== 0xffffffff`-style comparison even though the underlying
  // bits are identical.
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}
function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function findEndOfCentralDirectory(bytes: Uint8Array): number | null {
  const searchStart = Math.max(0, bytes.length - MIN_EOCD_SIZE - MAX_COMMENT_SIZE);
  for (let i = bytes.length - MIN_EOCD_SIZE; i >= searchStart; i--) {
    if (readUint32LE(bytes, i) === EOCD_SIGNATURE) return i;
  }
  return null;
}

function hasUnsafePath(filename: string): boolean {
  if (filename.startsWith('/') || filename.startsWith('\\')) return true; // absolute (unix/windows-style)
  if (/^[a-zA-Z]:[\\/]/.test(filename)) return true; // absolute (drive letter)
  if (filename.split(/[\\/]/).some((segment) => segment === '..')) return true; // parent-directory traversal
  // Intentional: detecting control characters/embedded nulls in a
  // filename IS the check.
  // deno-lint-ignore no-control-regex
  if (/[\u0000-\u001f]/.test(filename)) return true;
  return false;
}

function extensionOf(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf('.');
  return dot === -1 ? '' : base.slice(dot + 1).toLowerCase();
}

/**
 * Validates a ZIP's own central-directory metadata. Returns ok:false
 * with a specific reason on the FIRST disqualifying condition found —
 * every reason code is intentionally distinct so a caller (and an
 * administrator reading security_scan_detail) can tell exactly which
 * policy was violated, not just "invalid archive."
 */
export function validateZipArchive(bytes: Uint8Array, limits: ZipLimits = DEFAULT_ZIP_LIMITS): ZipValidationResult {
  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset === null) return { ok: false, reason: 'ZIP_MALFORMED_NO_EOCD' };

  const totalEntries = readUint16LE(bytes, eocdOffset + 10);
  const centralDirSize = readUint32LE(bytes, eocdOffset + 12);
  const centralDirOffset = readUint32LE(bytes, eocdOffset + 16);

  // ZIP64 indicator (0xFFFF entries or 0xFFFFFFFF offsets/sizes) —
  // not supported by this validator at all; rejected conservatively
  // rather than parsed incorrectly. No legitimate attachment in this
  // portal is anywhere near the size ZIP64 exists for.
  if (totalEntries === 0xffff || centralDirSize === 0xffffffff || centralDirOffset === 0xffffffff) {
    return { ok: false, reason: 'ZIP_UNSUPPORTED_ZIP64' };
  }
  if (totalEntries === 0) return { ok: false, reason: 'ZIP_MALFORMED_EMPTY' };
  if (totalEntries > limits.maxEntries) return { ok: false, reason: 'ZIP_TOO_MANY_ENTRIES' };
  if (centralDirOffset + centralDirSize > bytes.length || centralDirOffset >= eocdOffset) {
    return { ok: false, reason: 'ZIP_MALFORMED_CENTRAL_DIRECTORY' };
  }

  const seenNames = new Set<string>();
  let totalDeclaredUncompressed = 0;
  let totalDeclaredCompressed = 0;
  let offset = centralDirOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (offset + 46 > bytes.length) return { ok: false, reason: 'ZIP_MALFORMED_TRUNCATED_HEADER' };
    if (readUint32LE(bytes, offset) !== CENTRAL_DIR_SIGNATURE) return { ok: false, reason: 'ZIP_MALFORMED_BAD_HEADER_SIGNATURE' };

    const generalPurposeFlag = readUint16LE(bytes, offset + 8);
    const compressionMethod = readUint16LE(bytes, offset + 10);
    const compressedSize = readUint32LE(bytes, offset + 20);
    const uncompressedSize = readUint32LE(bytes, offset + 24);
    const filenameLength = readUint16LE(bytes, offset + 28);
    const extraLength = readUint16LE(bytes, offset + 30);
    const commentLength = readUint16LE(bytes, offset + 32);

    const filenameStart = offset + 46;
    if (filenameStart + filenameLength > bytes.length) return { ok: false, reason: 'ZIP_MALFORMED_TRUNCATED_HEADER' };
    const filename = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(filenameStart, filenameStart + filenameLength));

    const isEncrypted = (generalPurposeFlag & 0x1) !== 0;
    if (isEncrypted) return { ok: false, reason: 'ZIP_ENCRYPTED_ENTRY' };

    // Only STORED (0) and DEFLATE (8) are supported — anything else
    // (LZMA, BZIP2, PPMd, AES, etc.) is rejected as an unsupported
    // compression method, conservatively, rather than assumed safe.
    if (compressionMethod !== 0 && compressionMethod !== 8) return { ok: false, reason: 'ZIP_UNSUPPORTED_COMPRESSION_METHOD' };

    if (hasUnsafePath(filename)) return { ok: false, reason: 'ZIP_UNSAFE_PATH' };
    if (seenNames.has(filename)) return { ok: false, reason: 'ZIP_DUPLICATE_ENTRY_NAME' };
    seenNames.add(filename);

    const ext = extensionOf(filename);
    if (EXECUTABLE_SCRIPT_EXTENSIONS.has(ext)) return { ok: false, reason: 'ZIP_CONTAINS_EXECUTABLE_OR_SCRIPT' };
    if (ARCHIVE_EXTENSIONS.has(ext)) return { ok: false, reason: 'ZIP_CONTAINS_NESTED_ARCHIVE' };

    totalDeclaredUncompressed += uncompressedSize;
    totalDeclaredCompressed += compressedSize;

    offset = filenameStart + filenameLength + extraLength + commentLength;
  }

  if (totalDeclaredUncompressed > limits.maxDeclaredUncompressedBytes) {
    return { ok: false, reason: 'ZIP_DECLARED_SIZE_TOO_LARGE', entryCount: totalEntries, totalDeclaredUncompressedBytes: totalDeclaredUncompressed };
  }

  const effectiveCompressedBasis = Math.max(totalDeclaredCompressed, 1);
  const ratio = totalDeclaredUncompressed / effectiveCompressedBasis;
  if (ratio > limits.maxExpansionRatio) {
    return { ok: false, reason: 'ZIP_EXPANSION_RATIO_TOO_HIGH', entryCount: totalEntries, totalDeclaredUncompressedBytes: totalDeclaredUncompressed, expansionRatio: ratio };
  }

  return { ok: true, entryCount: totalEntries, totalDeclaredUncompressedBytes: totalDeclaredUncompressed, expansionRatio: ratio };
}
