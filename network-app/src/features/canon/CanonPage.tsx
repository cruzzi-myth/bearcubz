import { RouteShell } from '../../components/RouteShell';
import { canonEntries } from '../../data/canon';

export function CanonPage() {
  return (
    <RouteShell
      eyebrow="Lore"
      title="Galactic Canon"
      description="The living record of Moon Racer lore — eras, factions, characters, artifacts. Sample entries only for now."
      placeholder={false}
    >
      <dl style={{ margin: 0 }}>
        {canonEntries.map((entry) => (
          <div key={entry.id} style={{ marginBottom: 18 }}>
            <dt
              style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: 10,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--pink)',
              }}
            >
              {entry.category}
            </dt>
            <dd style={{ margin: '4px 0 0', fontFamily: "'Orbitron', sans-serif", fontSize: 15, color: '#fff' }}>
              {entry.title}
            </dd>
            <dd style={{ margin: '6px 0 0', fontSize: 14, color: 'rgba(255,255,255,.55)' }}>{entry.body}</dd>
          </div>
        ))}
      </dl>
    </RouteShell>
  );
}
