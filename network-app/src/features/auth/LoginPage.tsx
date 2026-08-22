import { RouteShell } from '../../components/RouteShell';

/**
 * UI shell only — deliberately does not authenticate anyone. Phase 2
 * wires this to Supabase Auth, tying it to the same passport_members
 * identity used by the existing /passport/ registration flow.
 */
export function LoginPage() {
  return (
    <RouteShell
      eyebrow="Identity"
      title="Moon Racer Passport"
      description="Sign in with the email you used to claim your Moon Racer Digital Passport. Account linking isn't wired up yet — this is a Phase 1 shell."
    >
      <form
        onSubmit={(e) => e.preventDefault()}
        style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 360 }}
      >
        <label style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 11, letterSpacing: '0.15em', color: 'var(--cyan)', textTransform: 'uppercase' }}>
          Email
          <input
            type="email"
            disabled
            placeholder="you@example.com"
            style={{
              display: 'block',
              width: '100%',
              marginTop: 6,
              padding: '12px 14px',
              background: 'rgba(255,255,255,.03)',
              border: '1px solid rgba(255,255,255,.14)',
              borderRadius: 4,
              color: '#fff',
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 16,
            }}
          />
        </label>
        <button type="submit" className="network-btn" disabled>
          Coming In Phase 2
        </button>
      </form>
    </RouteShell>
  );
}
