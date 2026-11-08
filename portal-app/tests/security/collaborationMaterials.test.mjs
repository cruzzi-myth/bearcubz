import { assert, report } from './runner.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// collaborationMaterials.ts imports a VALUE from the sibling
// ./visualAssetTypes (same lib/ folder) — same multi-file temp-dir
// pattern as collaborationCardActions.test.mjs. Its `import type`
// from components/collaborationCardActions is type-only and esbuild
// strips it entirely, so that file never needs to exist on disk here.
const srcRoot = new URL('../../src/', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'sp-collabmaterials-test-'));
mkdirSync(join(dir, 'lib'), { recursive: true });

function compile(relPath) {
  return execFileSync('npx', ['--yes', 'esbuild', join(srcRoot, relPath), '--bundle=false', '--format=esm'], { encoding: 'utf8' });
}

writeFileSync(join(dir, 'lib', 'visualAssetTypes.js'), compile('lib/visualAssetTypes.ts'));
const materialsJs = compile('lib/collaborationMaterials.ts').replace(/from\s+(['"])\.\/visualAssetTypes\1/, 'from $1./visualAssetTypes.js$1');
writeFileSync(join(dir, 'lib', 'collaborationMaterials.js'), materialsJs);

const { buildDeliverables, buildMaterials } = await import(pathToFileURL(join(dir, 'lib', 'collaborationMaterials.js')).href);

// --- Deliverables: the exact Project A/B requirement from the brief —
// "the full WAV export is not yet confirmed as uploaded. Do not mark
// it complete or invent a download link." ---
assert(
  'audio_short present, audio_full absent -> demo completed, full master pending (never fabricated complete)',
  (() => {
    const d = buildDeliverables(new Set(['audio_short', 'proposal_pdf', 'track_cover']));
    const byKey = Object.fromEntries(d.map((x) => [x.key, x.status]));
    return byKey.demo === 'completed' && byKey.fullMaster === 'pending' && byKey.proposal === 'completed' && byKey.artwork === 'completed';
  })(),
);
assert(
  'zero assets -> every deliverable pending, nothing fabricated',
  buildDeliverables(new Set()).every((d) => d.status === 'pending'),
);
assert(
  'audio_full present -> full master completed',
  buildDeliverables(new Set(['audio_full'])).find((d) => d.key === 'fullMaster').status === 'completed',
);
assert(
  'alternate_cover (not literally track_cover) still completes the artwork deliverable',
  buildDeliverables(new Set(['alternate_cover'])).find((d) => d.key === 'artwork').status === 'completed',
);

// --- Materials: availability must match real asset presence, and the
// route each one points at matches the real chamber routes exactly. ---
assert('no assets -> nothing available', buildMaterials(new Set()).every((m) => m.available === false));
assert(
  'audio_short -> listen available, routed to /listen',
  (() => {
    const m = buildMaterials(new Set(['audio_short'])).find((x) => x.key === 'listen');
    return m.available === true && m.routePath === 'listen';
  })(),
);
assert('proposal_pdf -> proposal available, routed to /proposal', buildMaterials(new Set(['proposal_pdf'])).find((m) => m.key === 'proposal').routePath === 'proposal');
assert('visual_concept -> visuals available (matches the Stage I2G Visuals-eligibility set)', buildMaterials(new Set(['visual_concept'])).find((m) => m.key === 'visuals').available === true);

// --- Stage K1.4.1: restoring the remaining Stage I2G visual-type
// coverage that collaborationCardActions.test.mjs (deleted when
// CollaborationCard was removed) asserted individually, so no
// per-type case is lost just because the old card component is gone.
assert('track_cover alone -> visuals available (the original Stage I2G bug case)', buildMaterials(new Set(['track_cover'])).find((m) => m.key === 'visuals').available === true);
assert('visual_image alone -> visuals available (unchanged legacy behavior)', buildMaterials(new Set(['visual_image'])).find((m) => m.key === 'visuals').available === true);
assert('track_cover alone -> visuals deliverable also completed', buildDeliverables(new Set(['track_cover'])).find((d) => d.key === 'artwork').status === 'completed');

assert('audio_full alone -> listen available (not just audio_short)', buildMaterials(new Set(['audio_full'])).find((m) => m.key === 'listen').available === true);
assert(
  'track_cover only (no audio at all) -> listen NOT available',
  buildMaterials(new Set(['track_cover'])).find((m) => m.key === 'listen').available === false,
);
assert(
  'proposal_pdf alone -> visuals NOT available (no cross-type leakage)',
  buildMaterials(new Set(['proposal_pdf'])).find((m) => m.key === 'visuals').available === false,
);

assert(
  'a realistic mixed asset set (audio_short + proposal_pdf + track_cover) enables listen, proposal, and visuals together',
  (() => {
    const m = buildMaterials(new Set(['audio_short', 'proposal_pdf', 'track_cover']));
    return m.every((item) => item.available === true);
  })(),
);

report('collaborationMaterials (Stage K1.4 briefing deliverables/materials — never fabricated)');
