// Stage K1.6G section 7 — real, local, zero-network tests for the
// dependency-free ZIP central-directory validator. Builds its own
// minimal, real, valid (store-method, unencrypted) ZIP archives byte
// by byte to exercise every rejection reason precisely — including
// unsafe entry names a normal `zip` CLI would refuse to create in the
// first place, which is exactly the point: this test proves the
// validator catches malicious METADATA a well-behaved tool would never
// produce.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assert, report } from './runner.mjs';

function importBundled(absoluteTsPath) {
  const js = execFileSync('npx', ['--yes', 'esbuild', absoluteTsPath, '--bundle', '--platform=neutral', '--format=esm'], { encoding: 'utf8' });
  const dir = mkdtempSync(join(tmpdir(), 'sp-test-'));
  const outFile = join(dir, 'module.mjs');
  writeFileSync(outFile, js);
  return import(pathToFileURL(outFile).href);
}

const { validateZipArchive, DEFAULT_ZIP_LIMITS } = await importBundled(new URL('../../../supabase/functions/_shared/zipValidation.ts', import.meta.url).pathname);

// ---------- minimal real ZIP builder (store method only, no compression) ----------
function u16(n) { return Uint8Array.of(n & 0xff, (n >> 8) & 0xff); }
function u32(n) { return Uint8Array.of(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff); }
function concatAll(arrays) {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

/**
 * entries: [{ name, content: Uint8Array, encrypted?, compressionMethod?, declaredUncompressedSize?, declaredCompressedSize? }]
 * The declared*Size overrides let tests lie about size (e.g. for the
 * expansion-ratio / oversized-declared-size tests) — exactly the kind
 * of adversarial metadata a real attacker could craft, which is
 * precisely what this validator must catch without ever trusting it.
 */
function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const content = entry.content ?? new TextEncoder().encode('x');
    const compressionMethod = entry.compressionMethod ?? 0;
    const flag = entry.encrypted ? 0x1 : 0x0;
    const uncompressedSize = entry.declaredUncompressedSize ?? content.length;
    const compressedSize = entry.declaredCompressedSize ?? content.length;

    const localHeader = concatAll([
      u32(0x04034b50), u16(20), u16(flag), u16(compressionMethod), u16(0), u16(0),
      u32(0), u32(compressedSize), u32(uncompressedSize), u16(nameBytes.length), u16(0),
      nameBytes, content,
    ]);
    localParts.push(localHeader);

    const centralHeader = concatAll([
      u32(0x02014b50), u16(20), u16(20), u16(flag), u16(compressionMethod), u16(0), u16(0),
      u32(0), u32(compressedSize), u32(uncompressedSize), u16(nameBytes.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), nameBytes,
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.length;
  }

  const localSection = concatAll(localParts);
  const centralSection = concatAll(centralParts);
  const eocd = concatAll([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(centralSection.length), u32(localSection.length), u16(0),
  ]);
  return concatAll([localSection, centralSection, eocd]);
}

// ---------- 1. A genuinely valid, simple archive ----------
{
  const zip = buildZip([{ name: 'notes.txt', content: new TextEncoder().encode('hello world') }]);
  const result = validateZipArchive(zip);
  assert('a simple, valid, single-entry ZIP passes validation', result.ok === true && result.entryCount === 1);
}

// ---------- 2. Malformed: no EOCD at all ----------
{
  const result = validateZipArchive(new TextEncoder().encode('not a zip file at all'));
  assert('a non-ZIP file (no EOCD signature) -> ZIP_MALFORMED_NO_EOCD', result.ok === false && result.reason === 'ZIP_MALFORMED_NO_EOCD');
}

// ---------- 3. Empty archive ----------
{
  const zip = buildZip([]);
  const result = validateZipArchive(zip);
  assert('zero entries -> ZIP_MALFORMED_EMPTY', result.ok === false && result.reason === 'ZIP_MALFORMED_EMPTY');
}

// ---------- 4. Too many entries ----------
{
  const entries = Array.from({ length: 101 }, (_, i) => ({ name: `file${i}.txt`, content: new TextEncoder().encode('x') }));
  const zip = buildZip(entries);
  const result = validateZipArchive(zip);
  assert('101 entries (over the 100 limit) -> ZIP_TOO_MANY_ENTRIES', result.ok === false && result.reason === 'ZIP_TOO_MANY_ENTRIES');
}
{
  const entries = Array.from({ length: 100 }, (_, i) => ({ name: `file${i}.txt`, content: new TextEncoder().encode('x') }));
  const zip = buildZip(entries);
  const result = validateZipArchive(zip);
  assert('exactly 100 entries (at the limit) still passes', result.ok === true);
}

// ---------- 5. Encrypted entry ----------
{
  const zip = buildZip([{ name: 'secret.txt', content: new TextEncoder().encode('x'), encrypted: true }]);
  const result = validateZipArchive(zip);
  assert('an encrypted entry -> ZIP_ENCRYPTED_ENTRY, rejected regardless of how many other entries exist', result.ok === false && result.reason === 'ZIP_ENCRYPTED_ENTRY');
}

// ---------- 6. Unsupported compression method ----------
{
  const zip = buildZip([{ name: 'file.bin', content: new TextEncoder().encode('x'), compressionMethod: 14 /* LZMA */ }]);
  const result = validateZipArchive(zip);
  assert('LZMA (method 14, neither stored nor deflate) -> ZIP_UNSUPPORTED_COMPRESSION_METHOD', result.ok === false && result.reason === 'ZIP_UNSUPPORTED_COMPRESSION_METHOD');
}

// ---------- 7. Unsafe paths ----------
for (const badName of ['../../etc/passwd', '/etc/passwd', 'C:\\Windows\\system32\\evil.dll', 'a/../../b.txt']) {
  const zip = buildZip([{ name: badName, content: new TextEncoder().encode('x') }]);
  const result = validateZipArchive(zip);
  assert(`unsafe path "${badName}" -> ZIP_UNSAFE_PATH`, result.ok === false && result.reason === 'ZIP_UNSAFE_PATH');
}
{
  const zip = buildZip([{ name: 'normal/nested/folder/file.txt', content: new TextEncoder().encode('x') }]);
  const result = validateZipArchive(zip);
  assert('a normal nested (non-traversal) relative path is fine', result.ok === true);
}

// ---------- 8. Duplicate entry names ----------
{
  const zip = buildZip([{ name: 'same.txt', content: new TextEncoder().encode('a') }, { name: 'same.txt', content: new TextEncoder().encode('b') }]);
  const result = validateZipArchive(zip);
  assert('two entries with the identical name -> ZIP_DUPLICATE_ENTRY_NAME', result.ok === false && result.reason === 'ZIP_DUPLICATE_ENTRY_NAME');
}

// ---------- 9. Executable / script content by extension ----------
for (const name of ['payload.exe', 'installer.msi', 'script.sh', 'macro.vbs']) {
  const zip = buildZip([{ name, content: new TextEncoder().encode('x') }]);
  const result = validateZipArchive(zip);
  assert(`an executable/script entry "${name}" -> ZIP_CONTAINS_EXECUTABLE_OR_SCRIPT`, result.ok === false && result.reason === 'ZIP_CONTAINS_EXECUTABLE_OR_SCRIPT');
}

// ---------- 10. Nested archive by extension ----------
for (const name of ['inner.zip', 'backup.rar', 'archive.7z']) {
  const zip = buildZip([{ name, content: new TextEncoder().encode('x') }]);
  const result = validateZipArchive(zip);
  assert(`a nested archive entry "${name}" -> ZIP_CONTAINS_NESTED_ARCHIVE`, result.ok === false && result.reason === 'ZIP_CONTAINS_NESTED_ARCHIVE');
}

// ---------- 11. Declared uncompressed size too large ----------
{
  const zip = buildZip([{ name: 'huge.bin', content: new TextEncoder().encode('x'), declaredUncompressedSize: 200 * 1024 * 1024, declaredCompressedSize: 1 }]);
  const result = validateZipArchive(zip);
  assert('a declared 200MB uncompressed entry (over the 100MB limit) -> ZIP_DECLARED_SIZE_TOO_LARGE', result.ok === false && result.reason === 'ZIP_DECLARED_SIZE_TOO_LARGE');
}

// ---------- 12. Expansion ratio too high (a classic zip-bomb metadata shape) ----------
{
  // 1 byte compressed "expands" to 50MB declared uncompressed -- a
  // ~50,000,000:1 ratio, far past the 20:1 limit, while staying under
  // the absolute 100MB size cap on its own.
  const zip = buildZip([{ name: 'bomb.bin', content: new TextEncoder().encode('x'), declaredUncompressedSize: 50 * 1024 * 1024, declaredCompressedSize: 10 }]);
  const result = validateZipArchive(zip);
  assert('a declared expansion ratio far past 20:1 -> ZIP_EXPANSION_RATIO_TOO_HIGH', result.ok === false && result.reason === 'ZIP_EXPANSION_RATIO_TOO_HIGH');
}

// ---------- 13. The validator never decompresses anything -- confirm the exported limits are the documented, reviewable values ----------
assert(
  'the exported default limits match the documented starting policy (100 entries / 100MB / 20:1)',
  DEFAULT_ZIP_LIMITS.maxEntries === 100 && DEFAULT_ZIP_LIMITS.maxDeclaredUncompressedBytes === 100 * 1024 * 1024 && DEFAULT_ZIP_LIMITS.maxExpansionRatio === 20,
);

report('zipValidation (Stage K1.6G section 7 — local archive-safety metadata validation, real ZIP structures)');
