// Stage K1.6C — mirrors the server-side CATEGORY_RULES in
// portal-request-attachment-upload-url exactly. This is a fast,
// client-side-only check for immediate UX feedback (a clear message
// before even attempting an upload) — it is NEVER the real
// enforcement. The Edge Function re-validates every one of these
// independently and is the only check that actually matters; nothing
// here is trusted server-side.
export type AttachmentCategory = 'document' | 'image' | 'audio' | 'zip';

export const ATTACHMENT_RULES: Record<AttachmentCategory, { maxBytes: number; label: string; mimeTypes: string[] }> = {
  document: {
    maxBytes: 25 * 1024 * 1024,
    label: '25 MB',
    mimeTypes: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
  },
  image: {
    maxBytes: 15 * 1024 * 1024,
    label: '15 MB',
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  },
  audio: {
    maxBytes: 100 * 1024 * 1024,
    label: '100 MB',
    mimeTypes: ['audio/x-wav', 'audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a'],
  },
  // Stage K1.6E.1 — reuses the document category's own 25MB limit,
  // never the 100MB audio allowance (zipping an already-compressed
  // audio file barely shrinks it — see malwareScan.ts's own comment).
  zip: {
    maxBytes: 25 * 1024 * 1024,
    label: '25 MB',
    mimeTypes: ['application/zip'],
  },
};

export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

// Stage K1.6G section 5 — the launch-time policy: a SEPARATE,
// ADDITIONAL cap layered on top of (never replacing) each category's
// own limit above, mirroring the backend's own uploadPolicy.ts
// default exactly (2,900,000 — the real, configurable scanner
// threshold; see malwareScan.ts). This literal default is checked
// against the backend's own literal default by
// tests/security/uploadPolicyDrift.test.mjs specifically so the two
// can never silently drift apart. Overridable via VITE_PORTAL_ARTIST_UPLOAD_MAX_BYTES
// (a public, safe-to-expose number, never a secret) if the backend's
// own PORTAL_ARTIST_UPLOAD_MAX_BYTES is ever configured differently.
const ARTIST_UPLOAD_MAX_BYTES_DEFAULT = 2_900_000;
export const ARTIST_UPLOAD_MAX_BYTES = (() => {
  const configured = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_PORTAL_ARTIST_UPLOAD_MAX_BYTES : undefined;
  const parsed = configured ? Number(configured) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : ARTIST_UPLOAD_MAX_BYTES_DEFAULT;
})();

export type AttachmentValidation = { ok: true; category: AttachmentCategory } | { ok: false; reason: string };

export function validateAttachmentFile(file: File): AttachmentValidation {
  const category = (Object.keys(ATTACHMENT_RULES) as AttachmentCategory[]).find((c) =>
    ATTACHMENT_RULES[c].mimeTypes.includes(file.type),
  );
  if (!category) return { ok: false, reason: 'Unsupported file type.' };
  const rules = ATTACHMENT_RULES[category];
  if (file.size > rules.maxBytes) return { ok: false, reason: `File is larger than the ${rules.label} limit for this type.` };
  if (file.size === 0) return { ok: false, reason: 'File is empty.' };
  // Checked AFTER the category limit (a file that's invalid for its
  // type should say so, not a generic size message) but BEFORE
  // returning ok — "Do not begin an upload that cannot currently
  // complete the security workflow" (K1.6G section 5). Exact required
  // artist-facing copy (section 6), never technical jargon.
  if (file.size > ARTIST_UPLOAD_MAX_BYTES) {
    return { ok: false, reason: 'This file exceeds the current upload limit. Please choose a smaller file.' };
  }
  return { ok: true, category };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
