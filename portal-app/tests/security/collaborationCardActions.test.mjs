import { assert, report } from './runner.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// collaborationCardActions.ts imports from ../lib/visualAssetTypes — a
// relative sibling import, so (same pattern as portalHostActions and
// portalAuthorization tests) this recreates the real relative layout
// under a temp dir via esbuild rather than using importCompiled's
// single-file mode.
const srcRoot = new URL('../../src/', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'sp-collabcard-test-'));
mkdirSync(join(dir, 'components'), { recursive: true });
mkdirSync(join(dir, 'lib'), { recursive: true });

function compile(relPath) {
  return execFileSync('npx', ['--yes', 'esbuild', join(srcRoot, relPath), '--bundle=false', '--format=esm'], { encoding: 'utf8' });
}

writeFileSync(join(dir, 'lib', 'visualAssetTypes.js'), compile('lib/visualAssetTypes.ts'));
const actionsJs = compile('components/collaborationCardActions.ts').replace(
  /from\s+(['"])\.\.\/lib\/visualAssetTypes\1/,
  'from $1../lib/visualAssetTypes.js$1',
);
writeFileSync(join(dir, 'components', 'collaborationCardActions.js'), actionsJs);

const { resolveCollaborationActions } = await import(pathToFileURL(join(dir, 'components', 'collaborationCardActions.js')).href);

function availability(actions) {
  return Object.fromEntries(actions.map((a) => [a.path, a.available]));
}

// --- Stage I2G regression: the actual bug that was found ---
assert(
  'a collaboration with ONLY a track_cover enables Visuals (the Stage I2G bug: previously only visual_image counted)',
  availability(resolveCollaborationActions(new Set(['track_cover']))).visuals === true,
);
assert('a collaboration with ONLY an alternate_cover enables Visuals', availability(resolveCollaborationActions(new Set(['alternate_cover']))).visuals === true);
assert('a collaboration with ONLY a visual_concept enables Visuals', availability(resolveCollaborationActions(new Set(['visual_concept']))).visuals === true);
assert('a collaboration with a visual_image still enables Visuals (unchanged behavior)', availability(resolveCollaborationActions(new Set(['visual_image']))).visuals === true);

// --- must not become over-permissive while fixing the under-permissive bug ---
assert('a collaboration with NO visual-type assets at all does not enable Visuals', availability(resolveCollaborationActions(new Set(['audio_short']))).visuals === false);
assert('a collaboration with zero assets of any kind does not enable Visuals', availability(resolveCollaborationActions(new Set())).visuals === false);
assert('audio_short/audio_full alone never enables Visuals', availability(resolveCollaborationActions(new Set(['audio_short', 'audio_full']))).visuals === false);
assert('proposal_pdf alone never enables Visuals', availability(resolveCollaborationActions(new Set(['proposal_pdf']))).visuals === false);

// --- the other three actions are untouched by this fix ---
assert('audio_short enables Listen', availability(resolveCollaborationActions(new Set(['audio_short']))).listen === true);
assert('audio_full enables Listen', availability(resolveCollaborationActions(new Set(['audio_full']))).listen === true);
assert('no audio type does not enable Listen', availability(resolveCollaborationActions(new Set(['track_cover']))).listen === false);
assert('proposal_pdf enables Proposal', availability(resolveCollaborationActions(new Set(['proposal_pdf']))).proposal === true);
assert('no proposal_pdf does not enable Proposal', availability(resolveCollaborationActions(new Set())).proposal === false);
assert('Respond is always available regardless of assets (feedback never requires a pre-existing asset)', availability(resolveCollaborationActions(new Set())).respond === true);

// --- a realistic mixed set, matching the Stage I2G review dataset's Project A ---
assert(
  'a realistic mixed asset set (audio_short + proposal_pdf + track_cover + visual_concept) enables all four actions',
  (() => {
    const result = availability(resolveCollaborationActions(new Set(['audio_short', 'proposal_pdf', 'track_cover', 'visual_concept'])));
    return result.listen && result.proposal && result.visuals && result.respond;
  })(),
);

report('collaborationCardActions (Stage I2G Visuals-availability bugfix)');
