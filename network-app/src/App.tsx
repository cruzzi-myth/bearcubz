import { Suspense } from 'react';
import { BrowserRouter, useRoutes } from 'react-router-dom';
import { SettingsProvider } from './features/settings/SettingsContext';
import { AudioProvider } from './features/audio/AudioProvider';
import { networkRoutes } from './routes';

// Vite's BASE_URL is "/bearcubz/network/" in production (see
// vite.config.ts) and "/" in local dev — either way, strip the
// trailing slash for React Router's basename.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

function AppRoutes() {
  return useRoutes(networkRoutes);
}

function LoadingFallback() {
  return (
    <div
      style={{
        minHeight: '40vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 12,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,.4)',
      }}
    >
      Loading signal…
    </div>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <AudioProvider>
        <BrowserRouter basename={basename}>
          <Suspense fallback={<LoadingFallback />}>
            <AppRoutes />
          </Suspense>
        </BrowserRouter>
      </AudioProvider>
    </SettingsProvider>
  );
}
