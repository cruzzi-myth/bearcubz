import { assert, importCompiled, report } from './runner.mjs';

const mod = await importCompiled(new URL('../../../supabase/functions/_shared/invitationPolicy.ts', import.meta.url).pathname);
const { findPhase01Recipient, revisedProposalReady, classifyEmailError, sendCooldownDecision, PHASE01_RECIPIENTS, SUPERSEDED_PROPOSAL_SHA256 } = mod;

const CT = 'fb260abd-2c12-479b-a7db-047e3da810fc';
const WLD = 'c297d5be-14d9-4f2b-93e2-a184e1ed2b83';

assert('exactly two Phase 01 recipients', PHASE01_RECIPIENTS.length === 2);
assert('BEλR CUBZ + CLIMBING TREES is authorized', findPhase01Recipient('bearcubzmusic@gmail.com', CT) !== null);
assert('Setia + WONKY LIQUID DREAMS is authorized', findPhase01Recipient('setiahaven@gmail.com', WLD) !== null);
assert('email match is case/whitespace-insensitive', findPhase01Recipient('  SetiaHaven@Gmail.com ', WLD) !== null);
assert('BEλR CUBZ is NOT authorized for Setia\'s collaboration', findPhase01Recipient('bearcubzmusic@gmail.com', WLD) === null);
assert('Setia is NOT authorized for CLIMBING TREES', findPhase01Recipient('setiahaven@gmail.com', CT) === null);
assert('an unrelated address is rejected', findPhase01Recipient('someone@example.com', CT) === null);
assert('XYLØ collaboration id is rejected for every address', PHASE01_RECIPIENTS.every((r) => findPhase01Recipient(r.email, 'e94ff20c-c332-4dcc-bffb-596a0df265cc') === null) && findPhase01Recipient('x@y.com', '45b9a584-f438-4ac1-be29-a00cb9e59e48') === null);
assert('Issey Cross collaboration id is rejected', findPhase01Recipient('setiahaven@gmail.com', '211a3334-1777-4da0-b07f-c83753d89482') === null);

const old = SUPERSEDED_PROPOSAL_SHA256[WLD];
const mk = (o) => ({ asset_type: 'proposal_pdf', is_active: true, upload_status: 'ready', security_status: 'clean', security_review_status: 'approved', file_sha256: 'abc', ...o });
assert('original proposal alone is NOT ready', revisedProposalReady(WLD, [mk({ file_sha256: old })]) === false);
assert('revised + original both active is NOT ready (original not replaced)', revisedProposalReady(WLD, [mk({ file_sha256: old }), mk()]) === false);
assert('revised active, original inactive IS ready', revisedProposalReady(WLD, [mk({ file_sha256: old, is_active: false }), mk()]) === true);
assert('revised but not security-approved is NOT ready', revisedProposalReady(WLD, [mk({ security_review_status: 'pending' })]) === false);
assert('revised but not clean is NOT ready', revisedProposalReady(WLD, [mk({ security_status: 'pending' })]) === false);
assert('revised but still uploading is NOT ready', revisedProposalReady(WLD, [mk({ upload_status: 'verifying' })]) === false);
assert('no proposal at all is NOT ready', revisedProposalReady(WLD, []) === false);
assert('collaborations without a superseded proposal are unaffected', revisedProposalReady(CT, []) === true);

assert('rate limit is classified and actionable', classifyEmailError({ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }).code === 'EMAIL_RATE_LIMITED');
assert('shared-SMTP team-only restriction maps to SMTP_NOT_CONFIGURED', classifyEmailError({ message: 'Email address not authorized' }).code === 'SMTP_NOT_CONFIGURED');
assert('provider failure maps to SMTP_REJECTED', classifyEmailError({ message: 'Error sending magic link email' }).code === 'SMTP_REJECTED');
assert('unknown error maps to generic, leaks nothing', classifyEmailError({ message: 'weird internal secret xyz' }).message.includes('xyz') === false);
assert('failure messages never suggest bypassing the limit', !/bypass(?!ed)/i.test(classifyEmailError({ code: 'over_email_send_rate_limit' }).message));

const now = 1_000_000_000;
assert('no prior attempt allows send', sendCooldownDecision(null, now) === 'allow');
assert('in-flight request blocks a second click', sendCooldownDecision({ status: 'requested', atMs: now - 10_000 }, now) === 'in-flight');
assert('stale "requested" (crashed attempt) allows retry', sendCooldownDecision({ status: 'requested', atMs: now - 10 * 60_000 }, now) === 'allow');
assert('recent successful send blocks duplicate', sendCooldownDecision({ status: 'sent', atMs: now - 60_000 }, now) === 'recently-sent');
assert('old successful send allows an intentional resend', sendCooldownDecision({ status: 'sent', atMs: now - 60 * 60_000 }, now) === 'allow');
assert('failed attempt allows retry immediately', sendCooldownDecision({ status: 'failed', atMs: now - 1000 }, now) === 'allow');

report('invitationPolicy');
