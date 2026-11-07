import { assert, report } from './runner.mjs';

// portalHostActions.ts imports from portalHostDialogue.ts and
// portalHostTypes.ts — importCompiled only transpiles one file at a
// time (no bundling), so this test compiles all three into the same
// temp directory under their original relative filenames, then lets
// Node's own module resolution follow the relative imports normally.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const srcDir = new URL('../../src/features/portal-host/', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'sp-host-test-'));
for (const file of ['portalHostTypes.ts', 'portalHostConfig.ts', 'portalHostDialogue.ts', 'portalHostActions.ts']) {
  const js = execFileSync('npx', ['--yes', 'esbuild', join(srcDir, file), '--bundle=false', '--format=esm'], { encoding: 'utf8' });
  const rewritten = js.replace(/from\s+(['"])\.\/(portalHostTypes|portalHostDialogue|portalHostConfig)\1/g, 'from $1./$2.js$1');
  writeFileSync(join(dir, file.replace('.ts', '.js')), rewritten);
}
const { resolveQuickAction, resolveForCollaboration } = await import(pathToFileURL(join(dir, 'portalHostActions.js')).href);
const { matchFaq, NO_PROJECTS_MESSAGE } = await import(pathToFileURL(join(dir, 'portalHostDialogue.js')).href);

const twoProjects = [
  { id: 'a', title: 'Ghost In The Signal', availableAssetTypes: new Set(['audio_short']) },
  { id: 'b', title: 'Lost Transition', availableAssetTypes: new Set(['proposal_pdf']) },
];

const multi = resolveQuickAction('listen', twoProjects);
assert('multi-project -> select-project (never auto-picks)', multi.kind === 'select-project' && multi.choices.length === 2);

const noAudio = resolveForCollaboration('listen', { id: 'b', title: 'Lost Transition', availableAssetTypes: new Set(['proposal_pdf']) });
assert('missing audio -> honest message, not navigate', noAudio.kind === 'message' && noAudio.text.includes("hasn't been uploaded"));

const hasAudio = resolveForCollaboration('listen', { id: 'a', title: 'Ghost In The Signal', availableAssetTypes: new Set(['audio_short']) });
assert('has audio -> navigates to the correct collaboration id', hasAudio.kind === 'navigate' && hasAudio.path === '/collaboration/a/listen');

const single = resolveQuickAction('proposal', [twoProjects[1]]);
assert('single project -> navigates directly, no selection step', single.kind === 'navigate' && single.path === '/collaboration/b/proposal');

const none = resolveQuickAction('visuals', []);
assert('zero projects -> explicit "none available," never fabricated', none.kind === 'message' && none.text === NO_PROJECTS_MESSAGE);

const about = resolveQuickAction('about', twoProjects);
assert('"about" never navigates', about.kind === 'message');

const fallback1 = matchFaq('asdkjfh random gibberish 12345');
const fallback2 = matchFaq('what color is the sky today');
assert('unrelated questions get the identical generic fallback', fallback1 === fallback2);
assert('royalty/payment questions get the honest non-committal answer', matchFaq('what about royalties?').includes("don't have information about royalties"));

report('portalHostActions (NYX ARDENT project selection + dialogue)');
