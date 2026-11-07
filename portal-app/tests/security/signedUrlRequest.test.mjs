import { assert, importCompiled, report } from './runner.mjs';

const mod = await importCompiled(
  new URL('../../../supabase/functions/_shared/signedUrlRequest.ts', import.meta.url).pathname,
);
const { resolveSignedUrlPath } = mod;

const base = { storagePath: 'full/path.png', thumbnailStoragePath: 'thumb/path.png' };

assert('variant "full" -> full path', resolveSignedUrlPath({ ...base, variant: 'full' }) === 'full/path.png');
assert('variant "thumbnail" with a thumbnail on record -> thumbnail path', resolveSignedUrlPath({ ...base, variant: 'thumbnail' }) === 'thumb/path.png');
assert('variant "thumbnail" with NO thumbnail on record -> falls back to full path, not empty', resolveSignedUrlPath({ ...base, variant: 'thumbnail', thumbnailStoragePath: null }) === 'full/path.png');
assert('missing variant -> full path', resolveSignedUrlPath({ ...base, variant: undefined }) === 'full/path.png');
assert('thumbnail requested, thumbnailStoragePath is an empty string -> full path (falsy, treated as absent)', resolveSignedUrlPath({ ...base, variant: 'thumbnail', thumbnailStoragePath: '' }) === 'full/path.png');

report('signedUrlRequest (path resolution)');
