import { BlackSignal, type BlackSignalReason } from './components/BlackSignal';

// Safe query-parameter whitelist. Never render the raw query string —
// anything not on this list (missing, misspelled, or hostile) falls
// back to "not-found". "already-voted" is intentionally excluded: that
// reason only ever appears as the /vote/ overlay, not a standalone route.
const ALLOWED_REASONS: readonly BlackSignalReason[] = [
  'unmapped',
  'erased',
  'offline',
  'error',
  'not-found',
];

function readReason(): BlackSignalReason {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('reason');
  return (ALLOWED_REASONS as readonly string[]).includes(raw ?? '')
    ? (raw as BlackSignalReason)
    : 'not-found';
}

function App() {
  const reason = readReason();
  return (
    <BlackSignal
      mode="page"
      reason={reason}
      networkHref="/universe/"
    />
  );
}

export default App;
