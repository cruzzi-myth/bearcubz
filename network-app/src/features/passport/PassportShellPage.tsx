import { RouteShell } from '../../components/RouteShell';

/**
 * NOTE for whoever picks up Phase 2: this is intentionally NOT the
 * same thing as https://cruzzi-myth.github.io/bearcubz/passport/,
 * which is the real, already-shipped Passport registration flow
 * (Supabase-backed, sequential MR-###### IDs, untouched by this
 * migration). This route is the future in-Network *profile* view —
 * once /network/login is wired up, it will read the same
 * passport_members row and render it inside the RPG shell instead
 * of sending the player out to the standalone registration page.
 */
export function PassportShellPage() {
  return (
    <RouteShell
      eyebrow="Identity"
      title="Your Passport"
      description="Once account linking ships, your MR-###### Passport ID, Founder status, and Tribe will render here. For now, claim or check your Passport at the standalone Passport page."
    >
      <a href="https://cruzzi-myth.github.io/bearcubz/passport/" className="network-btn" style={{ textDecoration: 'none' }}>
        Open Passport Registration →
      </a>
    </RouteShell>
  );
}
