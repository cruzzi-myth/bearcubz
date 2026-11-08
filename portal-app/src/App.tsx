import { BrowserRouter, useRoutes } from 'react-router-dom';
import { portalRoutes } from './routes';
import { PortalAuthProvider } from './features/auth/PortalAuthContext';
import { PortalHostProvider } from './features/portal-host/PortalHostProvider';
import { SignalInbox } from './components/SignalInbox';

// Vite's BASE_URL is "/portal/" in production (see vite.config.ts)
// and "/" in local dev — either way, strip the trailing slash for
// React Router's basename.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

function AppRoutes() {
  return useRoutes(portalRoutes);
}

export default function App() {
  return (
    <PortalAuthProvider>
      {/* Above the router so Nyx's conversation history survives
          client-side navigation between pages — cleared entirely on
          sign-out/account-change inside the provider itself, not here. */}
      <PortalHostProvider>
        <BrowserRouter basename={basename}>
          <AppRoutes />
          {/* Stage K1.1: mounted once, globally, so every authenticated
              route gets it automatically with no per-page wiring --
              renders nothing itself for a signed-out visitor or during
              the initial authorization check (see SignalInbox.tsx). */}
          <SignalInbox />
        </BrowserRouter>
      </PortalHostProvider>
    </PortalAuthProvider>
  );
}
