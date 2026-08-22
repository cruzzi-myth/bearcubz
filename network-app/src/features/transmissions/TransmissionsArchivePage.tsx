import { RouteShell } from '../../components/RouteShell';
import { transmissions } from '../../data/canon';
import { trackEvent } from '../../services/analytics';

export function TransmissionsArchivePage() {
  return (
    <RouteShell
      eyebrow="Archive"
      title="Transmissions"
      description="Every signal the Original Tribe has received. Playback of real media is a later phase — this proves the archive list and the analytics hook."
      placeholder={false}
    >
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {transmissions.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className="network-btn"
              disabled={!t.mediaSrc}
              onClick={() => trackEvent('transmission_play', { id: t.id })}
              style={{ width: '100%', textAlign: 'left' }}
            >
              {t.title}
            </button>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', margin: '6px 2px 0' }}>{t.description}</p>
          </li>
        ))}
      </ul>
    </RouteShell>
  );
}
