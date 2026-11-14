# SIGNAL PORTAL — K1.6H.4 Production Activation Gates

Verified 2026-11-12. A rehearsal pass is evidence toward these gates — **it is not authorization to deploy**. Nothing below is marked complete without the specific evidence cited.

## Gate A — Database

- [x] Baseline reproduced — genuinely, all 17 real baseline files (including the unrelated moon-racer-vote ones), not a synthetic approximation.
- [x] Pending migrations applied in rehearsal — all 12, cleanly, on top of the real baseline.
- [x] RLS verified — 21/21 tables, live attack-tested (10/10 denied).
- [x] Functions verified — all Signal-Portal-specific functions present with correct `SECURITY DEFINER`/grant restrictions.
- [x] Triggers verified — 4, including the asset-activation trigger, live-tested positive and negative.
- [x] Recovery documented — `k16h4-backup-restore.md`, `k16h4-rollback-recovery.md`.

## Gate B — Infrastructure

- [x] Storage private — unchanged, re-confirmed via the rehearsal's own RLS tests on `storage.objects`.
- [x] **Required Edge Functions operational (proxy evidence)** — not directly rehearsal-environment-verifiable (no managed platform locally), but the real dev project's own Edge Functions were re-confirmed fresh this stage: 186/186 integration, plus one genuine new Cloudmersive clean-verdict call through the real pipeline. This is proxy evidence from the real, already-deployed function source, not a rehearsal-environment proof — flagged as such, not claimed as equivalent.
- [x] Secrets identified — `k16h3-production-secrets.md`, unchanged, still accurate.
- [x] Scheduler configuration validated — the scheduler-free stripping mechanism itself re-proven this stage (29/29 replay never executed a `cron.schedule` statement).
- [x] Cloudmersive configured — genuine clean-verdict call succeeded this stage.
- [x] ClamAV safely disabled — live-verified fresh this stage, every realistic misconfiguration still fails closed.

## Gate C — Security

- [x] Genuine scanning works — Cloudmersive, genuine clean verdict, this stage.
- [x] Administrator review works — asset-activation positive path, genuine, this stage.
- [x] Asset activation gate works — 9/9 negative+positive cases, genuine, this stage.
- [x] Signed URLs restricted — unchanged, 5-minute TTL re-confirmed in K1.6H.3, not re-derived.
- [x] Artist isolation verified — 10/10 attack scenarios, genuine, this stage, from a from-scratch schema.
- [x] Cleanup and recovery safe — scan-lease/cap/manual-override suite, genuine, this stage.

## Gate D — Artist experience

- [ ] **Dashboard/Listening/Proposal/Visuals/Transmission chambers, mobile, accessibility** — not re-run this stage (no frontend code change since K1.6H.2/K1.6H.3's own thorough, passing runs to justify repeating); data-access-layer isolation re-confirmed instead. See `k16h4-artist-experience.md` for the explicit reasoning and what would be needed to close this with fresh UI-level evidence specifically dated to K1.6H.4.

## Gate E — Recovery

- [x] Logical backup created — genuine, this stage, of the rehearsal baseline.
- [x] Restore demonstrated — genuine, with real AES-256 encryption round-trip verified byte-for-byte, this stage.
- [x] Production backup procedure prepared — `k16h3-free-tier-recovery.md`, unchanged, still the operative procedure.
- [x] Limitations documented — explicitly, in `k16h4-backup-restore.md` and carried forward from K1.6H.3.

## Gate F — Owner authorization (none of these are technical; none were sought or granted this stage)

- [ ] Production deployment explicitly approved — not sought.
- [ ] Production secrets explicitly approved — not sought.
- [ ] Production backup destination selected — not sought; remains an owner decision (`k16h3-free-tier-recovery.md`).
- [ ] Artist asset transfer separately approved — not sought.
- [ ] Invitations separately approved — not sought.

## Honest overall read

Gates A, C, and E are now backed by the strongest evidence this engagement has produced to date — genuine, from-scratch, measured, not merely re-described. Gate B is mostly closed except the one piece no local environment can close (true managed-platform Edge Function rehearsal) without either Docker or a second Supabase project, neither available this stage by the owner's own confirmed choice. Gate D was not re-attempted at the UI level this stage, by design, since nothing changed to justify it — not because it's unresolved, but because it's already resolved as of K1.6H.2/K1.6H.3 and re-testing it here would prove nothing new. Gate F remains entirely the project owner's own decision, as it always has been.
