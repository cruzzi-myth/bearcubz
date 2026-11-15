// The Command Center's live proposal gate (frontend) must agree with the
// backend's revisedProposalReady() on EVERY case — the backend is the
// authority, the frontend only decides what to show/offer.
import { assert, importCompiled, report } from './runner.mjs';
const be = await importCompiled(new URL('../../../supabase/functions/_shared/invitationPolicy.ts', import.meta.url).pathname);
const fe = await importCompiled(new URL('../../src/features/admin/lib/proposalGate.ts', import.meta.url).pathname);

const WLD = 'c297d5be-14d9-4f2b-93e2-a184e1ed2b83';
const CT = 'fb260abd-2c12-479b-a7db-047e3da810fc';
const OLD = 'e6a3fcdc50ec5799dae63f53b0d414d6a41500337b1b00ea0b34f28a2df78a3e';
const NEW = '3f5c11ee237226bd0f92463b4ee996b2e9043988762e7148bc8d77cb17a2ff75';

assert('both modules carry the identical superseded hash', be.SUPERSEDED_PROPOSAL_SHA256[WLD] === OLD && fe.SUPERSEDED_PROPOSAL_SHA256[WLD] === OLD);

const row = (o = {}) => ({ assetType: 'proposal_pdf', isActive: true, uploadStatus: 'ready', securityStatus: 'clean', securityReviewStatus: 'approved', fileSha256: NEW, ...o });
const toBackend = (r) => ({ asset_type: r.assetType, is_active: r.isActive, upload_status: r.uploadStatus, security_status: r.securityStatus, security_review_status: r.securityReviewStatus, file_sha256: r.fileSha256 });

const cases = {
  'REAL PRODUCTION STATE: revised active+ready+clean+approved, original gone': { collab: WLD, rows: [row(), row({ assetType: 'audio_full', fileSha256: 'a' }), row({ assetType: 'track_cover', fileSha256: 'b' })], expect: true },
  'revised ready, original present but inactive': { collab: WLD, rows: [row({ fileSha256: OLD, isActive: false }), row()], expect: true },
  'original proposal only (still active)': { collab: WLD, rows: [row({ fileSha256: OLD })], expect: false },
  'revised AND original both active': { collab: WLD, rows: [row({ fileSha256: OLD }), row()], expect: false },
  'revised not security-approved': { collab: WLD, rows: [row({ securityReviewStatus: 'pending' })], expect: false },
  'revised review status null': { collab: WLD, rows: [row({ securityReviewStatus: null })], expect: false },
  'revised not scanned clean (error)': { collab: WLD, rows: [row({ securityStatus: 'error' })], expect: false },
  'revised infected': { collab: WLD, rows: [row({ securityStatus: 'infected' })], expect: false },
  'revised still verifying': { collab: WLD, rows: [row({ uploadStatus: 'verifying' })], expect: false },
  'revised is inactive': { collab: WLD, rows: [row({ isActive: false })], expect: false },
  'revised has no recorded hash': { collab: WLD, rows: [row({ fileSha256: null })], expect: false },
  'no proposal at all': { collab: WLD, rows: [], expect: false },
  'a non-proposal asset with a clean hash does not count': { collab: WLD, rows: [row({ assetType: 'audio_full' })], expect: false },
  'collaboration without a gate (CLIMBING TREES) is unaffected': { collab: CT, rows: [], expect: true },
};
for (const [name, c] of Object.entries(cases)) {
  const f = fe.proposalGate(c.collab, c.rows).ready;
  const b = be.revisedProposalReady(c.collab, c.rows.map(toBackend));
  assert(`parity + expected (${c.expect ? 'ELIGIBLE' : 'BLOCKED'}): ${name}`, f === b && f === c.expect);
}
assert('blocked results always carry an explanatory message', ['ORIGINAL_STILL_ACTIVE', 'NO_VERIFIED_REVISION'].every((k) => typeof fe.PROPOSAL_GATE_MESSAGE[k] === 'string' && fe.PROPOSAL_GATE_MESSAGE[k].length > 20));
assert('original-still-active is reported distinctly', fe.proposalGate(WLD, [row({ fileSha256: OLD })]).reason === 'ORIGINAL_STILL_ACTIVE');
report('proposalGateParity');
