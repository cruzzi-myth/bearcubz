// Stage K1.6C — two DELIBERATELY SEPARATE safety checks. Neither one
// is a substitute for the other, and passing both is still not a
// claim of "scanned by a real malware engine" — see the K1.6C report.

/**
 * File-signature (magic-byte) verification: confirms the object's
 * actual bytes match what its declared mime_type claims, catching a
 * disguised file (e.g. an executable renamed to .pdf). This says
 * NOTHING about whether a genuinely-valid file of that type carries
 * malicious content (an exploit embedded in a real PDF, a macro in a
 * real DOCX) — that is what scanning (below) is for, and the two are
 * never conflated into one verdict anywhere in this codebase.
 */
const MAGIC_BYTES: Record<string, (bytes: Uint8Array) => boolean> = {
  'application/pdf': (b) => b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d, // %PDF-
  'image/png': (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/jpeg': (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) => b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  'audio/wav': (b) => b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x41 && b[10] === 0x56 && b[11] === 0x45,
  'audio/x-wav': (b) => MAGIC_BYTES['audio/wav'](b),
  'audio/mpeg': (b) => b.length >= 3 && ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)), // ID3 or raw MPEG frame sync
  // M4A/MP4 containers: 'ftyp' box at offset 4.
  'audio/mp4': (b) => b.length >= 8 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70,
  'audio/x-m4a': (b) => MAGIC_BYTES['audio/mp4'](b),
  // DOCX/TXT have no reliable fixed magic bytes at this check's scope
  // (DOCX is a ZIP container -- 'PK\x03\x04' -- TXT is arbitrary text
  // with no signature at all). Verified structurally instead: DOCX
  // via the ZIP signature, TXT accepted as-is (nothing to check).
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (b) =>
    b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07),
  'text/plain': () => true,
  // Stage K1.6E.1 — a plain ZIP, same signature family as DOCX above
  // (DOCX IS a ZIP container) but checked as its own declared type,
  // not an alias, so a file claiming to be a ZIP is held to the ZIP
  // signature specifically.
  'application/zip': (b) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07),
};

export function verifyFileSignature(mimeType: string, bytes: Uint8Array): boolean {
  const check = MAGIC_BYTES[mimeType];
  if (!check) return false;
  return check(bytes);
}

/**
 * Stage K1.6C malware-scanning fallback (no external scanning account
 * exists yet -- see the K1.6C report's "If a suitable scanner requires
 * ... implement the surrounding workflow in development but leave
 * promotion disabled" instruction). This is NOT a malware scanner. It
 * recognizes exactly one thing: the industry-standard EICAR test
 * string (https://www.eicar.org/download-anti-malware-testfile/),
 * the same 68-byte pattern every real antivirus product is DESIGNED
 * to flag specifically because it is harmless but universally
 * recognized by convention. It exists so the REJECTION path (quarantine
 * -> scan -> rejected -> never promoted) can be exercised end-to-end
 * with a real, safe, recognizable signal, without using or fabricating
 * an actual malicious file.
 *
 * Finding the EICAR string does NOT mean "this scanner caught
 * malware" in any general sense, and NOT finding it does NOT mean
 * "this file is clean" -- it means only "this file isn't the one
 * specific test pattern this stub recognizes." See
 * requiresManualReview below, which is what actually governs whether
 * promotion is allowed.
 */
const EICAR_SIGNATURE = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

export function matchesEicarTestSignature(bytes: Uint8Array): boolean {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  return text.includes(EICAR_SIGNATURE);
}

/**
 * The honest answer to "is automated scanning available": no. Every
 * attachment that isn't the EICAR test fixture requires a human
 * admin's manual review (status 'awaiting_scan' -> admin decision)
 * before it can ever reach 'clean'. This function exists as the one
 * place that fact is encoded, so nothing elsewhere can silently start
 * auto-promoting real uploads by accident.
 */
export const AUTOMATED_SCANNING_AVAILABLE = false;
