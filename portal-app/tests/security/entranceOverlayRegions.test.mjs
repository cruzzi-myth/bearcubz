import { assert, importCompiled, report } from './runner.mjs';

const mod = await importCompiled(new URL('../../src/pages/entranceOverlayRegions.ts', import.meta.url).pathname);
const { OVERLAY_REGIONS, ARTWORK_WIDTH, ARTWORK_HEIGHT, WIDE_OVERLAY_REGIONS, WIDE_ARTWORK_WIDTH, WIDE_ARTWORK_HEIGHT, WIDE_BREAKPOINT_PX } = mod;

assert('artwork dimensions match the real source file (1199x1312)', ARTWORK_WIDTH === 1199 && ARTWORK_HEIGHT === 1312);

assert('email region converts to percentage strings, not raw numbers', typeof OVERLAY_REGIONS.email.left === 'string' && OVERLAY_REGIONS.email.left.endsWith('%'));

assert(
  'email region left% matches the measured pixel box (320/1199)',
  Math.abs(parseFloat(OVERLAY_REGIONS.email.left) - (320 / 1199) * 100) < 0.001,
);

assert(
  'accessPortal region height% matches the measured pixel box (55/1312)',
  Math.abs(parseFloat(OVERLAY_REGIONS.accessPortal.height) - (55 / 1312) * 100) < 0.001,
);

assert('no overlay region exists for the illustrated "ACCESS CODE / INVITATION" field (deliberately left non-interactive)', !('accessCode' in OVERLAY_REGIONS));

assert('all 4 quick-action panels are present', Object.keys(OVERLAY_REGIONS.panels).sort().join(',') === 'listen,proposal,respond,visuals');

assert('all 5 left-nav labels are present', Object.keys(OVERLAY_REGIONS.leftNav).length === 5);

for (const [name, region] of Object.entries({ email: OVERLAY_REGIONS.email, accessPortal: OVERLAY_REGIONS.accessPortal, fingerprint: OVERLAY_REGIONS.fingerprint })) {
  const left = parseFloat(region.left);
  const width = parseFloat(region.width);
  assert(`${name}: region stays within the artwork's horizontal bounds (left + width <= 100%)`, left + width <= 100);
}

// ---------- Stage I2E: landscape/wide composition ----------
assert('wide artwork dimensions match the real source file (1672x941)', WIDE_ARTWORK_WIDTH === 1672 && WIDE_ARTWORK_HEIGHT === 941);

assert(
  'wide email region left% matches the measured pixel box (655/1672)',
  Math.abs(parseFloat(WIDE_OVERLAY_REGIONS.email.left) - (655 / 1672) * 100) < 0.001,
);

assert(
  'wide fingerprint region matches the measured pixel box (978/1672, 410/941)',
  Math.abs(parseFloat(WIDE_OVERLAY_REGIONS.fingerprint.left) - (978 / 1672) * 100) < 0.001 &&
    Math.abs(parseFloat(WIDE_OVERLAY_REGIONS.fingerprint.top) - (410 / 941) * 100) < 0.001,
);

assert('no wide overlay region exists for the illustrated access-code field either', !('accessCode' in WIDE_OVERLAY_REGIONS));

assert('all 4 wide quick-action panels are present', Object.keys(WIDE_OVERLAY_REGIONS.panels).sort().join(',') === 'listen,proposal,respond,visuals');

assert('all 5 wide left-nav labels are present', Object.keys(WIDE_OVERLAY_REGIONS.leftNav).length === 5);

for (const [name, region] of Object.entries({ email: WIDE_OVERLAY_REGIONS.email, accessPortal: WIDE_OVERLAY_REGIONS.accessPortal, fingerprint: WIDE_OVERLAY_REGIONS.fingerprint })) {
  const left = parseFloat(region.left);
  const width = parseFloat(region.width);
  assert(`wide ${name}: region stays within the artwork's horizontal bounds (left + width <= 100%)`, left + width <= 100);
}

for (const panelName of Object.keys(WIDE_OVERLAY_REGIONS.panels)) {
  const region = WIDE_OVERLAY_REGIONS.panels[panelName];
  assert(`wide panel ${panelName}: stays within horizontal bounds`, parseFloat(region.left) + parseFloat(region.width) <= 100);
}

assert('the two compositions use genuinely different coordinate sets, not the same numbers reused', OVERLAY_REGIONS.email.left !== WIDE_OVERLAY_REGIONS.email.left);

assert('WIDE_BREAKPOINT_PX matches the brief\'s explicit "1280 pixels and wider" desktop threshold', WIDE_BREAKPOINT_PX === 1280);

report('entranceOverlayRegions (Stage I2D/I2E overlay coordinate math — portrait + wide)');
