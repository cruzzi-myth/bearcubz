# K1.6H.1 — Private asset transfer plan

Prepared 2026-11-09. No production transfer authorized or performed.

## Verified development sources

Read-only Storage downloads were hashed in memory by `tests/integration/verify-k16h1-assets.mjs`. Full private bucket/path and record evidence is in `k16h1-source-assets.json`; keep this operational metadata access-controlled. No media was written into public assets. All nine existing asset objects downloaded successfully; only these six active objects are candidates. Superseded originals remain inactive and must not be substituted.

| Artist | Type | Development asset ID | Exact bytes | SHA-256 | Artistic approval |
|---|---|---|---:|---|---|
| xylo | track_cover | 8fc21191-88ff-4e97-a10e-e932118c905f | 3,185,659 | `e61bb751f660fe4d0f4c23e1630016266df1ab3e732b9f8a9c6e3daf6a685fb3` | pending |
| xylo | audio_full | 89d65b23-4486-4a11-bc01-927f40e2eff1 | 2,388,252 | `3128e7414fa7767bda89e3913ee9eb6a73622d522c2e592dbd44103ab542a8b3` | not represented on asset row |
| xylo | proposal_pdf | 9c446d3c-dad2-4135-9ee2-3c0fa09e8f4b | 210,264 | `87bf93a6b14bec8822ab25e31bcb6c8d2db86f5765ec8868d45827d4a08de017` | not represented on asset row |
| issey | proposal_pdf | f7bf9ae9-f0d7-40e1-922d-789ea09e6b5d | 1,706,658 | `288509bd2205d410d9fc8203e9b257d52965061bb9404362e92f4b9710038974` | not represented on asset row |
| issey | track_cover | 885432d3-e5a4-47c3-b8ff-8ac2383f082e | 3,205,745 | `cc7b02364430d9090c5b3cdf3c287467e857ab76940656bd506295bdf63a79d2` | pending |
| issey | audio_full | 94529e1d-f460-40ed-8300-0685ebebf8c0 | 2,113,685 | `703c7e185a1b28cacb8aaedb5903377d9dd3ebc25c474c5cb6e8ee3681cc1255` | not represented on asset row |

XYLØ metadata remains 96 BPM / A♭ minor. Issey remains 145 BPM / A♭, mode unconfirmed. Optimized durations 149.203188s and 132.04s are the handoff measurements, not independently remeasured by this script. The optimized XYLØ PDF is 210,264 bytes. Both covers remain pending; primary-cover designation does not mean artistic approval.

## Evidence limitation and release hold

The handoff reports genuine clean scans of the optimized assets. Current asset rows do not have malware-clearance fields; no attachment scan rows exist under either real collaboration. The limited audit search found scan events for other attachment IDs, not hash-bound evidence for these assets. Original hash-bound scan evidence has therefore NOT been independently recovered. Do not reinterpret upload_status=ready or approval_status as a malware verdict.

`portal-admin-confirm-upload` checks object existence and exact byte size, not Cloudmersive. Do not assume the administrator asset workflow enforces the attachment scanner. A production transfer requires an explicitly authorized, recorded scan of the exact downloaded production bytes before the asset becomes ready/artist-visible. Until that controlled process or a dedicated gated implementation is approved and validated, package activation is blocked. The >2.9MB artwork cannot be cleared by the current free-tier scanner; keep it private and unreleased pending a suitable separately approved scanning process/capacity. Do not shrink, replace, approve, or exempt it implicitly.

## Repeatable future procedure (K1.6H.2 authorization required)

1. Freeze this manifest and verify all source hashes again. Obtain original provider response, scan time, exact-byte hash and administrator decision; missing evidence requires fresh production scanning, never an assumed pass.
2. Create/map production collaboration IDs and dedicated administrator and test identities under explicit authorization. Validate ownership and references; never copy development rows, UUID assumptions, passwords, sessions or artist credentials.
3. Map audio_full → private collaboration-audio, proposal_pdf → private collaboration-proposals, visual types → private collaboration-visuals. Keep attachment quarantine/final buckets reserved for the attachment pipeline. Validate MIME, byte size and bucket privacy.
4. Use the administrator request-upload workflow to allocate new production asset IDs/paths. Keep collaborations draft, unassigned and without invitations. Upload exact approved bytes; do not confirm readiness yet.
5. Download each production object as the authorized administrator and compare SHA-256 and exact length to this manifest. Reject any mismatch and investigate without overwriting the source.
6. Run the approved production malware/security process against those exact bytes and retain a hash-bound provider response. Eligible attachment uploads must go through ZIP validation where applicable and mandatory Cloudmersive scanning. Scanner errors, oversize responses and manual approval never count as clearance. No direct status='clean' writes.
7. Only after clearance, complete administrator asset confirmation and explicit artistic review. Preserve pending artwork honestly. Do not activate packages with uncleared material.
8. Verify signed-URL retrieval with the authorized test membership and actual returned bytes; verify anonymous, unrelated, cross-artist and revoked identities cannot retrieve. Record URL expiry without logging the URL/token.
9. Exercise both private audio players and proposal canvases. Confirm metadata, five-page XYLØ PDF navigation and pending artwork. Obtain separate package-activation approval, then separate invitation-send approval. Neither is authorized here.

No database or object backup alone replaces this evidence. Archive the reviewed manifest and scan/audit records alongside encrypted object backups.
