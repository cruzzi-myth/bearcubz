import { Link } from 'react-router-dom';
import { RouteShell } from '../../components/RouteShell';
import { sectors } from '../../data/sectors';
import { worlds } from '../../data/worlds';
import './galaxy-map.css';

/** Renders the fixed 15-sector hierarchy from data — proves the
 * galaxy is data-driven, not hardcoded into this component. */
export function GalaxyMapPage() {
  return (
    <RouteShell
      eyebrow="Navigation"
      title="Galaxy Map"
      description="The Core, twelve numbered sectors, the Outer Rim, the Deep Signal Zone, and the Lost Systems. Only worlds with data render as links — the rest are dark until a future phase populates them."
      placeholder={false}
    >
      <ul className="galaxy-grid">
        {sectors.map((sector) => {
          const worldsInSector = worlds.filter((w) => w.sectorId === sector.id);
          return (
            <li key={sector.id} className={`galaxy-tile${sector.unlocked ? ' galaxy-tile--unlocked' : ''}`}>
              <div className="galaxy-tile__name">{sector.name}</div>
              {worldsInSector.length > 0 ? (
                <div className="galaxy-tile__worlds">
                  {worldsInSector.map((w) => (
                    <Link key={w.id} to={`/world/${w.id}`}>
                      {w.name}
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="galaxy-tile__dark">No signal</div>
              )}
            </li>
          );
        })}
      </ul>
    </RouteShell>
  );
}
