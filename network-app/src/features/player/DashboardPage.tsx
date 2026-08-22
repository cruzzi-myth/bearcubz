import { Link } from 'react-router-dom';
import { RouteShell } from '../../components/RouteShell';

export function DashboardPage() {
  return (
    <RouteShell
      eyebrow="Player"
      title="Dashboard"
      description="Your home base once inside the Network — missions, inventory, and galaxy status will surface here. Phase 1 just proves the route and links to the other shells."
    >
      <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Link to="/galaxy" className="network-btn">Galaxy Map</Link>
        <Link to="/missions" className="network-btn">Mission Log</Link>
        <Link to="/inventory" className="network-btn">Inventory</Link>
      </nav>
    </RouteShell>
  );
}
