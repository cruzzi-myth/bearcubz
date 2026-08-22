import { useParams, Link } from 'react-router-dom';
import { RouteShell } from '../../components/RouteShell';
import { getLocation } from '../../data/locations';
import { getWorld } from '../../data/worlds';

/** Generic destination route: /network/location/:locationId */
export function LocationPage() {
  const { locationId } = useParams<{ locationId: string }>();
  const location = locationId ? getLocation(locationId) : undefined;

  if (!location) {
    return (
      <RouteShell
        eyebrow="Unknown Location"
        title="No Signal"
        description={`No location is registered with id "${locationId ?? ''}" yet. Add it to src/data/locations.ts.`}
      />
    );
  }

  const world = getWorld(location.worldId);

  return (
    <RouteShell eyebrow={location.tagline} title={location.name} description={location.description} placeholder={false}>
      {world && (
        <Link to={`/world/${world.id}`} style={{ color: 'var(--cyan)', textDecoration: 'none', fontSize: 13 }}>
          ← Back to {world.name}
        </Link>
      )}
    </RouteShell>
  );
}
