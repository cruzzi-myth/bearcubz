import MoonRacerOracle from './moon-racer-oracle';

// Minimal return-to-package bar. Rendered as a plain sibling ABOVE the
// delivered Oracle component — no shared classes, no shared CSS file,
// nothing here touches MoonRacerOracle.module.css or the Oracle's own
// DOM tree, so it can't affect its hero sizing, edge-to-edge layout,
// animations, card interactions, or scroll behavior.
function ReturnBar() {
  return (
    <div
      style={{
        position: 'static',
        background: '#0b0a10',
        color: '#e7e0d2',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '13px',
        letterSpacing: '0.04em',
        padding: '10px 16px',
      }}
    >
      <a
        href="/bearcubz/package-resume/"
        style={{ color: 'inherit', textDecoration: 'none', opacity: 0.85 }}
      >
        ← Artist Package
      </a>
    </div>
  );
}

export default function App() {
  return (
    <>
      <ReturnBar />
      <MoonRacerOracle />
    </>
  );
}
