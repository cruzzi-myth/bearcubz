// Stage K1.6L — isArtistVisibleAsset is the one gate deciding
// whether an artist-facing view (Listening Chamber backdrop, Visual
// Gallery) may render a visual asset at all. Found during this
// stage's audit: useAuthorizedCollaboration previously returned
// every active, ready asset regardless of approval_status, so a
// member would see their own pending (or even rejected) cover art
// and gallery images, with a visible status pill admitting as much.
// This has a real runtime import (VISUAL_ASSET_TYPES), so it needs
// bundling, not the zero-import importCompiled other pure-logic
// tests here use.
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

const { isArtistVisibleAsset } = await importBundled(new URL('../../src/lib/assetVisibility.ts', import.meta.url).pathname);

for (const type of ['track_cover', 'alternate_cover', 'visual_image', 'visual_concept']) {
  assert(`${type}, approved -> visible`, isArtistVisibleAsset({ assetType: type, approvalStatus: 'approved' }) === true);
  assert(`${type}, pending -> NOT visible`, isArtistVisibleAsset({ assetType: type, approvalStatus: 'pending' }) === false);
  assert(`${type}, rejected -> NOT visible`, isArtistVisibleAsset({ assetType: type, approvalStatus: 'rejected' }) === false);
  assert(`${type}, null approvalStatus -> NOT visible (fail closed, never treated as approved)`, isArtistVisibleAsset({ assetType: type, approvalStatus: null }) === false);
}

assert('audio_short (no approval concept) is always visible regardless of approvalStatus', isArtistVisibleAsset({ assetType: 'audio_short', approvalStatus: null }) === true);
assert('audio_full (no approval concept) is always visible', isArtistVisibleAsset({ assetType: 'audio_full', approvalStatus: null }) === true);
assert('proposal_pdf (no approval concept) is always visible', isArtistVisibleAsset({ assetType: 'proposal_pdf', approvalStatus: null }) === true);

report('assetVisibility (Stage K1.6L — unapproved artwork must never reach an artist-facing view)');
