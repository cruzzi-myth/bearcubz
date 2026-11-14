# K1.6H.1 — Deployment checklist

2026-11-09. **NO-GO. K1.6H.2 is not authorized.** Each unchecked item requires recorded evidence or explicit approval, not assumption.

## Gate A — Code readiness

- [x] TypeScript passes.
- [x] Lint exits successfully; two pre-existing unused-variable warnings recorded.
- [x] Production build succeeds in a staging directory; public bundle preserved.
- [x] Security: 233 assertions pass across 19 files.
- [x] Exact accessibility defect corrected and focused axe check passes.
- [x] Review final integration/browser results and assess each remaining failure in k16h1-test-results.md.
- [ ] Replay prepared scheduler-free migrations against an isolated database; verify source/prepared manifests and full SQL semantics.

## Gate B — Infrastructure readiness

- [ ] Verify recent production database backup and isolated restore evidence. Current API lists no backups.
- [ ] Verify PITR or owner-approved restore-tested recovery alternative with RPO/RTO. PITR currently disabled.
- [x] Data-preserving rollback/forward-fix boundaries documented.
- [x] Eleven-file migration order documented; four development scheduler blocks excluded from prepared artifact.
- [ ] Review new deployment allowlists against frozen artifacts; existing manifests do not authorize this stage.
- [ ] Provision production scanner key, cron secret, system identity and aligned 2,900,000-byte caps only after authorization.
- [ ] Verify storage quota/headroom and account-specific Edge Function memory/time/concurrency limits.
- [ ] Validate production Auth/SMTP smoke. Portal callback allowlist is present.
- [ ] Review Vault permissions, production-only cron endpoints/cadences, and scanner quota/alert ownership.

## Gate C — Security readiness

- [x] Inspect lease identity guards, retry caps, retention, ZIP validation, mandatory scanner and separate administrator approval.
- [x] Review current development isolation/recovery regression evidence in test-results.
- [ ] Production authorized upload → real scan → approval → signed retrieval smoke with exact-byte evidence.
- [ ] Production anonymous, cross-artist and revoked identity denial smoke using dedicated test identities.
- [ ] Verify production cleanup/recovery after separately authorized deployment without deleting real artist data.
- [ ] Assign global scanner quota monitoring; per-file retry bounds do not impose a global account budget.

## Gate D — Artist package readiness

- [x] Download/hash all nine existing development objects read-only; active optimized audio sizes match handoff.
- [x] Metadata remains XYLØ 96 / A♭ minor and Issey 145 / A♭, mode unconfirmed.
- [x] Both artwork states remain pending; audio unchanged.
- [ ] Recover original hash-bound scan evidence or rescan exact production bytes through an approved process.
- [ ] Approve a security process for artwork above 2.9MB; do not exempt or silently release it.
- [ ] Create validated production collaboration/asset ownership references through authorized workflows.
- [ ] Verify actual production audio, proposal rendering/navigation, exact signed bytes and artist isolation.
- [ ] Obtain separate package-activation authorization. Invitations remain separate.

## Gate E — Explicit release authorization

- [ ] Owner explicitly authorizes K1.6H.2 against the reviewed artifact, migrations, recovery evidence, secret plan, security smoke and transfer process.
- [ ] Record separate scheduler, package activation and invitation permissions as applicable.

No commit, push, production mutation, subscription purchase or invitations in K1.6H.1. Passing development tests do not close infrastructure or transfer blockers.
