import { assert, importCompiled, report } from './runner.mjs';

const { formatBytes } = await importCompiled(new URL('../../src/features/admin/lib/formatBytes.ts', import.meta.url).pathname);

assert('null is an em dash, not a size', formatBytes(null) === '—');
assert('a real 209-byte file (the K1.6K/K1.6L fixture) reads <1 KB, never 0 KB', formatBytes(209) === '<1 KB');
assert('0 bytes also reads <1 KB, not literally 0 KB', formatBytes(0) === '<1 KB');
assert('1023 bytes still reads <1 KB', formatBytes(1023) === '<1 KB');
assert('exactly 1024 bytes reads 1 KB', formatBytes(1024) === '1 KB');
assert('a few KB rounds normally', formatBytes(2048) === '2 KB');
assert('just under 1 MB still reads in KB', formatBytes(1024 * 1024 - 1) === '1024 KB');
assert('1 MB reads in MB with one decimal', formatBytes(1024 * 1024) === '1.0 MB');
assert('a few MB rounds to one decimal', formatBytes(3 * 1024 * 1024) === '3.0 MB');

report('formatBytes (Stage K1.6L follow-up — sub-1KB files must never display as 0 KB)');
