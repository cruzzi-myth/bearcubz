# SIGNAL PORTAL — K1.6H.4 Backup & Restore Rehearsal

Verified 2026-11-12, against the rehearsal database (not dev, not production). This extends K1.6H.3's own restore test with the one piece that stage didn't perform: real encryption.

## Process (performed for real)

1. Created a logical backup (schema + data, `public` schema only — platform schemas excluded, matching the real Supabase CLI's own approach) of the fully-migrated (29/29) rehearsal database via native `pg_dump`.
2. Encrypted it with `openssl enc -aes-256-cbc -pbkdf2` using a freshly-generated random passphrase (32 random bytes, base64). The passphrase was written only to a `0600`-permission file in the session scratchpad and deleted immediately after use — never logged, never reused, never written to this document.
3. Computed SHA-256 of both the plaintext and the encrypted artifact.
4. Deleted the plaintext backup file, keeping only the encrypted one (simulating "stored outside the working database" in a form that could safely sit somewhere less trusted).
5. Decrypted the encrypted artifact back to plaintext and **re-verified its SHA-256 matched the original exactly** — proving the encryption round-trips losslessly before ever relying on it.
6. Restored the decrypted dump into a second, fresh, isolated database (minimal platform-role/schema shims pre-applied, including pre-seeding the same synthetic `auth.users` rows the application data references — a real foreign-key dependency this stage specifically identified and solved, not glossed over).
7. Verified schema, RLS, functions, triggers, and representative row counts against the source.

## Result

| Check | Result |
|---|---|
| Plaintext → encrypted → decrypted round-trip | SHA-256 identical, confirmed |
| Restore errors | 1 — `function auth.jwt() does not exist` (a second, minor auth shim gap, same category already documented in K1.6H.3; zero errors in the actual application schema or data) |
| Restore time | 0.067 seconds (schema + data combined) — a small dataset, not extrapolated to production scale, exactly as K1.6H.3 cautioned |
| RLS-enabled tables after restore | 21/21, matching the source exactly |
| Triggers after restore | 4, matching the source exactly |
| Row counts after restore | Exact match on every table checked (`collaborations`, `collaboration_feedback_attachments`, `collaboration_assets`, `collaboration_members`) |

## A real methodological finding worth recording

The first restore attempt (before pre-seeding `auth.users`) produced 18 errors — not because the backup/restore mechanism was broken, but because this rehearsal's own dump initially included the platform-shim schemas themselves (duplicating what the restore target also pre-creates) and the restored Signal Portal data has real foreign-key references to `auth.users` rows that a `public`-schema-only dump never carries. Both were fixed by (a) excluding platform schemas from the dump, matching exactly what the real Supabase CLI already does, and (b) pre-seeding the same synthetic identities before restoring data — which is also exactly the real-world procedure a genuine disaster recovery would need to follow (Auth identities must be separately recovered; they are not inside a database-only backup). This is now explicitly documented as a required step in any future real backup procedure, not just discovered and forgotten.

## What this still does not prove

Production has still never been backed up (`backups=[]`, `pitr_enabled=false`, unchanged, not re-queried this stage since it cannot have changed without a purchase the owner declined). This remains a rehearsal of the **mechanism** on safe data, not a production backup.
