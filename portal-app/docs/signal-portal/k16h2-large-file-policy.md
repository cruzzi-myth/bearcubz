# K1.6H.2 — Larger-file policy

ACTIVE artist policy remains 2,900,000 bytes. No production/development artist-limit increase occurred. Invalid, non-integral, negative, inconsistent or excessive configuration fails closed. Backend and frontend defaults continue to agree in regression tests.

Default PORTAL_SCANNER_PROVIDER_MODE=cloudmersive. Optional dual mode requires HTTPS worker URL and dedicated worker token. PORTAL_CLOUDMERSIVE_MAX_BYTES defaults to 2900000 (legacy CLOUDMERSIVE_MAX_FILE_SIZE_BYTES remains a validated fallback). PORTAL_CLAMAV_MAX_BYTES defaults to a configured ceiling of 104857600, not verified availability. PORTAL_SCANNER_FALLBACK_ENABLED must be false; post-failure fallback is not implemented. PORTAL_ARTIST_UPLOAD_MAX_BYTES remains <=2900000 until a separately verified release policy is implemented/approved. No code install enables dual mode.

| Category | Existing category architecture | Current practical policy | Future evaluation |
|---|---:|---|---|
| Artist documents | 25MiB | 2,900,000 bytes | Up to category cap only after real worker/transfer testing |
| Artist images | 15MiB | 2,900,000 bytes | Exact-byte genuine large-artwork scan; artistic approval remains pending |
| Artist audio | 100MiB | 2,900,000 bytes | 100MiB ClamAV engine scanning is now genuinely verified (audit follow-up); still blocked end-to-end by the current 50MiB global Storage ceiling, a separate infrastructure constraint |
| Artist ZIP | 25MiB | 2,900,000 bytes | Conservative 25MiB compressed /100MiB expansion only after complete worker tests; never advertise 250MB |
| Admin assets | Existing categories | Up to min(category,50MiB); unavailable scanner leaves larger files private/non-ready | No delivery above scanner capacity without successful real scan/review |

Generated 30MiB WAV reached private development storage and failed closed without a large-file provider at the time this was written. Initial 100MiB upload was rejected by Storage; new API/UI reject that request before transfer. **Audit follow-up:** a genuine 100MiB-exact WAV engine scan has since been performed and passed against a real local ClamAV daemon (`k16h2-clamav-setup.md`) — this proves the engine can handle that size, not that an end-to-end 100MiB upload works today; the 50MiB Storage ceiling above is unrelated and still blocks that regardless. Generated >2.9MB PNG retained pending approval and private/error state.

128kbps optimized real artist demos remain intact. A later higher-quality listening-copy proposal should retain originals, derive separately versioned copies, verify codec/duration/SHA, genuinely scan and review exact new bytes, test private playback and compare listening quality before any replacement. No real audio replacement or production transfer is authorized now.
