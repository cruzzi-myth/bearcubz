# SIGNAL PORTAL — K1.6H.4 Artist Experience Rehearsal

Verified 2026-11-12. Two synthetic identities ("Artist A", "Artist B") were created in the native rehearsal database — never real artists, never invited, never touching any real email address.

## Database-level rehearsal (this stage, genuine)

Artist A and Artist B were each made a member of a separate synthetic collaboration (Rehearsal Collab A / B). Real RLS-level checks (see `k16h4-security-verification.md` for the full attack table) confirmed:

- Artist A cannot see Collab B, Collab B's membership, or Collab B's feedback (0 rows visible in every case).
- A third, unassigned synthetic identity sees zero collaborations.
- A revoked synthetic identity (added to Collab A, then revoked) sees zero collaborations, matching the existing, unchanged revocation behavior.
- Direct URL manipulation is equivalent, at the database level, to an unauthorized row request — already covered by the same RLS tests, since the frontend's signed-URL/data-fetch calls are the actual enforcement point, not the URL string itself.

This is the correct scope for a Postgres-only rehearsal: it proves the **data-access** half of "Artist A cannot access Artist B's collaboration" from scratch. It does not exercise the Dashboard/Listening/Proposal/Visuals/Transmission **UI chambers**, mobile layout, or keyboard/accessibility behavior — those require the real frontend running against a real Supabase Auth+PostgREST+Storage runtime, which this stage's local-only environment does not have.

## UI-level evidence (not re-run this stage — carried forward with reasoning, not assumed)

No frontend or chamber-routing code has changed since K1.6H.2/K1.6H.3, both of which already performed the full UI-level verification this section asks for (dashboard, all four chambers, feedback submission, mobile layout at 390px, keyboard navigation, axe accessibility contrast) against the real dev project with real browser automation. Re-running that full browser suite here, against no code change, would exercise nothing new and directly contradicts the brief's own instruction (section 19: distinguish genuine from redundant checks) and the established practice of this entire engagement (avoid unnecessary repeated live-authentication browser runs). The one UI-adjacent thing this stage did verify freshly and for real is the scanner/attachment pipeline end-to-end for a genuine clean file (`k16h4-scanner-verification.md`), which is the piece most likely to regress from recent scanner-architecture changes.

**If the project owner wants a fresh full browser/accessibility pass specifically for K1.6H.4's own record**, that is a deliberate, explicit choice to make (it costs real live-authentication test time and a small amount of Supabase request volume) — not something this stage performed unprompted, consistent with "avoid unnecessary... repetition."
