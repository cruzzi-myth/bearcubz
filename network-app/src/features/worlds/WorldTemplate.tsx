import { Link } from 'react-router-dom';
import { RouteShell } from '../../components/RouteShell';
import { getWorld } from '../../data/worlds';
import { locations } from '../../data/locations';

/**
 * Shared template for any World — this is what proves a new world
 * can be added by editing src/data/worlds.ts, not by writing a new
 * page component. /network/world/:worldId, /network/core, and
 * /network/castle all render through this same component.
 */
export function WorldTemplate({ worldId }: { worldId: string }) {
  const world = getWorld(worldId);

  if (!world) {
    return (
      <RouteShell
        eyebrow="Unknown World"
        title="No Signal"
        description={`No world is registered with id "${worldId}" yet. Add it to src/data/worlds.ts.`}
      />
    );
  }

  const worldLocations = locations.filter((l) => l.worldId === world.id);

  return (
    <RouteShell eyebrow={world.tagline} title={world.name} description={world.description} placeholder={false}>
      {worldLocations.length > 0 && (
        <div>
          <div className="route-shell__eyebrow" style={{ marginBottom: 10 }}>
            Locations
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {worldLocations.map((loc) => (
              <li key={loc.id}>
                <Link to={`/location/${loc.id}`} style={{ color: 'var(--cyan)', textDecoration: 'none' }}>
                  {loc.name} — <span style={{ color: 'rgba(255,255,255,.5)' }}>{loc.tagline}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </RouteShell>
  );
}
