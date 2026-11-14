# SIGNAL PORTAL — K1.6F Open Decisions

Only decisions that genuinely require the project owner's approval — not implementation details this audit could resolve on its own.

## 1. Oversized-file retention period

A real gap (`k16f-security-audit.md` Gap 1): files held pending future scanner capacity are currently deleted by the existing 7-day abandoned-cleanup rule, with no distinction from a genuinely abandoned upload. A fix requires the project owner to decide:

- **How long** should an oversized file be held (the brief explicitly warns against "indefinite storage without an approved retention policy" — a real number is needed: 30 days? 90 days? Tied to the artist's own project timeline?).
- **Whether** the artist should be able to trigger a re-check themselves (e.g. after being told the plan was upgraded) or whether this stays administrator-only (current retry-scan design is admin-only).

## 2. Cloudmersive plan upgrade timing

This audit did not purchase or upgrade anything (not authorized to). But the free tier's real, confirmed 3MB limit means **no audio attachment (the portal's own 100MB category) can ever be genuinely scanned today** — every real audio upload will sit at `security_status='error'` (`EXCEEDS_SCANNER_SIZE_LIMIT`) indefinitely under the free plan. This is not a bug to fix; it's a real product-level question: **is launching with audio attachments effectively unscannable (and therefore never administrator-approvable, per the "approval cannot bypass the scan gate" rule that this audit re-confirmed holds) an acceptable state for the production launch, or does audio-attachment support need to wait for a paid Cloudmersive plan?**

## 3. Stuck-`'scanning'`-state recovery fix

A real gap (`k16f-security-audit.md` Gap 2): a crashed/killed scan leaves a permanently stuck, non-retryable row. The proposed fix (a claim-timeout pattern) is a small, well-understood change, but — like Gap 1 — this audit's authorization did not include implementing it. Needs a go-ahead to build and verify in dev before it's included in a production migration set.

## 4. Async scan architecture for large files

If decision #2 above leads to a paid Cloudmersive plan and genuinely larger files being scanned, `k16f-scanner-operations.md` section 11 recommends moving the scan step to an asynchronous background-task model rather than the current fully-synchronous one. This is a real architectural change (not a bug fix) and needs explicit buy-in before any implementation work begins — it touches the artist-facing upload UX (no longer a single blocking "confirm" call) as well as the backend.

## 5. Artist-facing "scanner limit exceeded" messaging

`k16f-artist-experience.md` notes the brief's suggested copy is not yet implemented anywhere — a small, low-risk frontend change, but still a product-copy decision (exact wording, where it appears) rather than something to silently choose during an audit.

## 6. Production Cloudmersive account ownership

Who creates and pays for the production Cloudmersive account, and whether it starts on the free tier (same real 3MB constraint as dev, see #2) or a paid tier from day one, is a project-owner/billing decision, not a technical one.

Everything else in this audit (architecture, security isolation, test totals, production-vs-dev diff) is a factual finding, not a decision — see the other K1.6F documents.
