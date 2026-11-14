import { assert, importCompiled, report } from './runner.mjs';

const mod = await importCompiled(new URL('../../src/lib/attachmentRules.ts', import.meta.url).pathname);
const { validateAttachmentFile, ATTACHMENT_RULES, ARTIST_UPLOAD_MAX_BYTES, MAX_ATTACHMENTS_PER_MESSAGE, formatFileSize } = mod;

function fakeFile(type, size) {
  return { type, size };
}

assert('MAX_ATTACHMENTS_PER_MESSAGE matches the approved K1.6C limit of 5', MAX_ATTACHMENTS_PER_MESSAGE === 5);

// Stage K1.6G section 5 added a SECOND, smaller launch-policy cap
// (ARTIST_UPLOAD_MAX_BYTES, 2,900,000) layered on top of each
// category's own limit below -- every category's maxBytes (25MB/
// 15MB/100MB/25MB) is now well above that cap, so "accepted at
// exactly the category limit" is no longer true for any of them. This
// tests the category limit in isolation instead, at a size safely
// under the launch policy too, and the launch-policy boundary is
// tested separately below.
assert(
  'every approved document/image/audio/zip mime type is accepted at a size well under both the category limit and the launch-policy cap',
  ['document', 'image', 'audio', 'zip'].every((cat) => {
    const rules = ATTACHMENT_RULES[cat];
    return rules.mimeTypes.every((mime) => validateAttachmentFile(fakeFile(mime, 1_000_000)).ok);
  }),
);

assert(
  'one byte over the category limit is rejected (even for a category whose limit is itself above the launch-policy cap)',
  ['document', 'image', 'audio', 'zip'].every((cat) => {
    const rules = ATTACHMENT_RULES[cat];
    const result = validateAttachmentFile(fakeFile(rules.mimeTypes[0], rules.maxBytes + 1));
    return result.ok === false;
  }),
);

assert(
  'Stage K1.6G section 5: a file exactly at the launch-policy cap is accepted (still within every category\'s own larger limit)',
  validateAttachmentFile(fakeFile('text/plain', ARTIST_UPLOAD_MAX_BYTES)).ok === true,
);
assert(
  'Stage K1.6G section 5: one byte over the launch-policy cap is rejected with the exact required artist-facing message, even though it is well under the document category\'s own 25MB limit',
  (() => {
    const result = validateAttachmentFile(fakeFile('text/plain', ARTIST_UPLOAD_MAX_BYTES + 1));
    return result.ok === false && result.reason === 'This file exceeds the current upload limit. Please choose a smaller file.';
  })(),
);

assert(
  'Stage K1.6E.1: zip reuses the document category\'s 25MB limit, never the 100MB audio allowance (no zip-compression size loophole)',
  ATTACHMENT_RULES.zip.maxBytes === ATTACHMENT_RULES.document.maxBytes && ATTACHMENT_RULES.zip.maxBytes < ATTACHMENT_RULES.audio.maxBytes,
);

assert('an unlisted mime type is rejected, never silently categorized', validateAttachmentFile(fakeFile('application/x-msdownload', 1000)).ok === false);

assert('a zero-byte file is rejected', validateAttachmentFile(fakeFile('application/pdf', 0)).ok === false);

assert(
  'the document limit (25MB) is strictly smaller than the audio limit (100MB) — a document-sized check never accidentally passes an audio-sized file',
  ATTACHMENT_RULES.document.maxBytes < ATTACHMENT_RULES.audio.maxBytes,
);

assert('formatFileSize renders bytes, KB, and MB in the expected ranges', formatFileSize(500).endsWith('B') && formatFileSize(5000).includes('KB') && formatFileSize(5_000_000).includes('MB'));

report('attachmentRules (Stage K1.6C client-side validation — never the real enforcement)');
