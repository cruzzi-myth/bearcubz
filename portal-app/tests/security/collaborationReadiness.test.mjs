import { assert, importCompiled, report } from './runner.mjs';

const mod = await importCompiled(new URL('../../src/features/admin/lib/collaborationReadiness.ts', import.meta.url).pathname);
const { buildReadinessChecklist } = mod;

const complete = {
  bpm: 96,
  musicalKey: 'A♭ minor',
  hasAudio: true,
  hasProposal: true,
  hasPrimaryCover: true,
  primaryCoverApproved: true,
  anySecurityRequiredAsset: true,
  allSecurityRequiredAssetsClean: true,
  allSecurityRequiredAssetsApproved: true,
  activeMemberCount: 1,
};

assert('a fully-ready collaboration has every check complete', buildReadinessChecklist(complete).every((c) => c.complete === true));

assert('missing BPM fails the metadata check only', (() => {
  const checks = buildReadinessChecklist({ ...complete, bpm: null });
  const byKey = Object.fromEntries(checks.map((c) => [c.key, c.complete]));
  return byKey.metadata === false && byKey.audio === true;
})());

assert('empty-string musicalKey (not null) still fails metadata — whitespace is not a real key', buildReadinessChecklist({ ...complete, musicalKey: '   ' }).find((c) => c.key === 'metadata').complete === false);

assert('a primary cover that exists but is not yet approved fails the artwork check', buildReadinessChecklist({ ...complete, primaryCoverApproved: false }).find((c) => c.key === 'artwork').complete === false);

assert('no primary cover at all also fails the artwork check (not vacuously true)', buildReadinessChecklist({ ...complete, hasPrimaryCover: false, primaryCoverApproved: false }).find((c) => c.key === 'artwork').complete === false);

assert(
  'a collaboration with zero security-required assets (only legacy) reads scanning/security_review complete, not permanently stuck',
  (() => {
    const checks = buildReadinessChecklist({ ...complete, anySecurityRequiredAsset: false, allSecurityRequiredAssetsClean: false, allSecurityRequiredAssetsApproved: false });
    const byKey = Object.fromEntries(checks.map((c) => [c.key, c.complete]));
    return byKey.scanning === true && byKey.security_review === true;
  })(),
);

assert('a security-required asset that is not yet clean fails scanning (and therefore security_review too, since it can never be approved first)', (() => {
  const checks = buildReadinessChecklist({ ...complete, allSecurityRequiredAssetsClean: false, allSecurityRequiredAssetsApproved: false });
  const byKey = Object.fromEntries(checks.map((c) => [c.key, c.complete]));
  return byKey.scanning === false && byKey.security_review === false;
})());

assert('zero active members fails the permissions check', buildReadinessChecklist({ ...complete, activeMemberCount: 0 }).find((c) => c.key === 'permissions').complete === false);

assert('there is no "ready to invite" check at all — that decision is never computed here', !buildReadinessChecklist(complete).some((c) => c.key.includes('invite')));

report('collaborationReadiness (Stage K1.6L — admin dashboard readiness checklist, no new DB state)');
