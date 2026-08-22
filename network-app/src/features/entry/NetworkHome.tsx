import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { trackEvent } from '../../services/analytics';
import './network-home.css';

/** The /network landing shell — the fork between Guest Mode and a
 * real Passport-linked identity (auth happens on /login). */
export function NetworkHome() {
  useDocumentTitle('Moon Racer Network');

  return (
    <section className="network-home">
      <div className="network-home__eyebrow">First Fans · Original Tribe</div>
      <h1 className="network-home__title">MOON RACER NETWORK</h1>
      <p className="network-home__tagline">The RPG layer of the Moon Racer universe. Phase 1 shell — the galaxy is dark, but the door is open.</p>

      <div className="network-home__actions">
        <Link
          to="/guest"
          className="network-home__cta network-home__cta--primary"
          onClick={() => trackEvent('guest_entered')}
        >
          Enter As Guest
        </Link>
        <Link to="/login" className="network-home__cta network-home__cta--secondary">
          Create / Access Moon Racer Passport
        </Link>
      </div>

      <nav className="network-home__map" aria-label="Network sections">
        <Link to="/galaxy">Galaxy Map</Link>
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/missions">Mission Log</Link>
        <Link to="/canon">Galactic Canon</Link>
        <Link to="/transmissions">Transmissions</Link>
      </nav>
    </section>
  );
}
