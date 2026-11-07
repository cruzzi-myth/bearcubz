import { assert, importCompiled, report } from './runner.mjs';

const mod = await importCompiled(
  new URL('../../src/features/admin/lib/coverEligibility.ts', import.meta.url).pathname,
);
const { isCoverEligible } = mod;

const base = { assetType: 'track_cover', isActive: true, uploadStatus: 'ready', approvalStatus: 'pending' };

assert('ready + active + eligible type + not rejected -> eligible', isCoverEligible(base) === true);
assert('approved status is still eligible (approval != promotion)', isCoverEligible({ ...base, approvalStatus: 'approved' }) === true);
assert('rejected asset is never eligible', isCoverEligible({ ...base, approvalStatus: 'rejected' }) === false);
assert('pending upload_status is never eligible', isCoverEligible({ ...base, uploadStatus: 'pending' }) === false);
assert('failed upload_status is never eligible', isCoverEligible({ ...base, uploadStatus: 'failed' }) === false);
assert('inactive asset is never eligible', isCoverEligible({ ...base, isActive: false }) === false);
assert('audio_short is never cover-eligible', isCoverEligible({ ...base, assetType: 'audio_short' }) === false);
assert('proposal_pdf is never cover-eligible', isCoverEligible({ ...base, assetType: 'proposal_pdf' }) === false);
for (const type of ['track_cover', 'alternate_cover', 'visual_image', 'visual_concept']) {
  assert(`${type} is cover-eligible when otherwise ready`, isCoverEligible({ ...base, assetType: type }) === true);
}

report('coverEligibility');
