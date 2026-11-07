import { assert, importCompiled, report } from './runner.mjs';

const mod = await importCompiled(
  new URL('../../../supabase/functions/_shared/invitationValidation.ts', import.meta.url).pathname,
);
const { isValidInvitationEmail, normalizeInvitationEmail, resolveExpiryDays, DEFAULT_EXPIRY_DAYS, MAX_EXPIRY_DAYS } = mod;

assert('ordinary email is valid', isValidInvitationEmail('artist@example.com') === true);
assert('missing @ is invalid', isValidInvitationEmail('artistexample.com') === false);
assert('missing domain dot is invalid', isValidInvitationEmail('artist@examplecom') === false);
assert('email with whitespace is invalid', isValidInvitationEmail('ar tist@example.com') === false);
assert('empty string is invalid', isValidInvitationEmail('') === false);

assert('normalize trims surrounding whitespace', normalizeInvitationEmail('  Artist@Example.com  ') === 'artist@example.com');
assert('normalize lowercases', normalizeInvitationEmail('ARTIST@EXAMPLE.COM') === 'artist@example.com');
assert('normalize of null/undefined is empty string, not a crash', normalizeInvitationEmail(null) === '' && normalizeInvitationEmail(undefined) === '');

assert('missing expiresInDays falls back to default', resolveExpiryDays(undefined) === DEFAULT_EXPIRY_DAYS);
assert('null expiresInDays falls back to default', resolveExpiryDays(null) === DEFAULT_EXPIRY_DAYS);
assert('zero is rejected, falls back to default (not a 0-day expiry)', resolveExpiryDays(0) === DEFAULT_EXPIRY_DAYS);
assert('negative is rejected, falls back to default', resolveExpiryDays(-5) === DEFAULT_EXPIRY_DAYS);
assert('NaN is rejected, falls back to default', resolveExpiryDays(NaN) === DEFAULT_EXPIRY_DAYS);
assert('Infinity is rejected, falls back to default', resolveExpiryDays(Infinity) === DEFAULT_EXPIRY_DAYS);
assert('value beyond the cap is rejected, falls back to default (never silently clamped to the cap)', resolveExpiryDays(MAX_EXPIRY_DAYS + 1) === DEFAULT_EXPIRY_DAYS);
assert('value exactly at the cap is accepted as-is', resolveExpiryDays(MAX_EXPIRY_DAYS) === MAX_EXPIRY_DAYS);
assert('a reasonable in-range value is accepted as-is', resolveExpiryDays(7) === 7);

report('invitationValidation');
