import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

/**
 * Fixes the Phase 1 mobile bug: below 768px the old header nav just
 * `display:none`'d with no replacement, leaving no way to navigate.
 * This is a compact bottom tab bar (Map / Passport / Missions /
 * Inventory) plus a Menu button that opens the rest of the site as a
 * full slide-up sheet — essential gameplay navigation stays reachable
 * at every width.
 */
export function MobileNav({ settingsSlot }: { settingsSlot?: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <>
      {menuOpen && (
        <div className="mr-mobile-sheet" role="dialog" aria-label="Menu">
          <nav className="mr-mobile-sheet__links" aria-label="Moon Racer Universe — full menu">
            <NavLink to="/" end onClick={() => setMenuOpen(false)}>
              Hub
            </NavLink>
            <NavLink to="/dashboard" onClick={() => setMenuOpen(false)}>
              Dashboard
            </NavLink>
            <NavLink to="/galaxy" onClick={() => setMenuOpen(false)}>
              Galaxy Map
            </NavLink>
            <NavLink to="/passport" onClick={() => setMenuOpen(false)}>
              Passport
            </NavLink>
            <NavLink to="/missions" onClick={() => setMenuOpen(false)}>
              Missions
            </NavLink>
            <NavLink to="/inventory" onClick={() => setMenuOpen(false)}>
              Inventory
            </NavLink>
            <NavLink to="/canon" onClick={() => setMenuOpen(false)}>
              Canon
            </NavLink>
            <NavLink to="/transmissions" onClick={() => setMenuOpen(false)}>
              Transmissions
            </NavLink>
          </nav>
          {settingsSlot && <div className="mr-mobile-sheet__settings">{settingsSlot}</div>}
        </div>
      )}

      <nav className="mr-mobile-tabbar" aria-label="Moon Racer Universe — quick navigation">
        <button
          type="button"
          className="mr-mobile-tab"
          aria-expanded={menuOpen}
          aria-controls="mr-mobile-sheet"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span aria-hidden="true">☰</span>
          Menu
        </button>
        <NavLink to="/galaxy" className="mr-mobile-tab">
          <span aria-hidden="true">🗺</span>
          Map
        </NavLink>
        <NavLink to="/passport" className="mr-mobile-tab">
          <span aria-hidden="true">🪪</span>
          Passport
        </NavLink>
        <NavLink to="/missions" className="mr-mobile-tab">
          <span aria-hidden="true">🎯</span>
          Missions
        </NavLink>
        <NavLink to="/inventory" className="mr-mobile-tab">
          <span aria-hidden="true">🎒</span>
          Inventory
        </NavLink>
      </nav>
    </>
  );
}
