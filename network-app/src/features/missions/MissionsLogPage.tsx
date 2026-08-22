import { RouteShell } from '../../components/RouteShell';
import { missions } from '../../data/missions';

export function MissionsLogPage() {
  return (
    <RouteShell
      eyebrow="Progress"
      title="Mission Log"
      description="The Mission Engine itself is a later phase. These are sample entries proving the data model and this page render correctly."
      placeholder={false}
    >
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {missions.map((m) => (
          <li
            key={m.id}
            style={{
              border: '1px solid rgba(255,255,255,.08)',
              borderRadius: 6,
              padding: '12px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'baseline',
            }}
          >
            <div>
              <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 13, color: '#fff' }}>{m.title}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', marginTop: 4 }}>{m.summary}</div>
            </div>
            <span
              style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: 10,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: m.status === 'available' ? 'var(--cyan)' : 'rgba(255,255,255,.35)',
                flexShrink: 0,
              }}
            >
              {m.status}
            </span>
          </li>
        ))}
      </ul>
    </RouteShell>
  );
}
