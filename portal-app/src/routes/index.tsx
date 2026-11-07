import type { RouteObject } from 'react-router-dom';
import { EntrancePage } from '../pages/EntrancePage';
import { DashboardPage } from '../pages/DashboardPage';
import { AdminPage } from '../pages/AdminPage';
import { ListeningChamberPage } from '../pages/ListeningChamberPage';
import { ProposalArchivePage } from '../pages/ProposalArchivePage';
import { VisualGalleryPage } from '../pages/VisualGalleryPage';
import { TransmissionChamberPage } from '../pages/TransmissionChamberPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { RequirePortalAuth } from '../features/auth/RequirePortalAuth';
import { RequirePortalAdmin } from '../features/auth/RequirePortalAdmin';

// Paths are relative to the router basename ("/portal" in production
// — see vite.config.ts + main.tsx). Every route below the entrance is
// now wrapped in a real authorization gate (Stage D) — none of them
// render collaboration data of their own yet (that's Stage E/F); each
// still shows its Stage B empty state, but only once the backend has
// actually confirmed the visitor is authorized to be there.
export const portalRoutes: RouteObject[] = [
  { path: '/', element: <EntrancePage /> },
  {
    path: 'dashboard',
    element: (
      <RequirePortalAuth>
        <DashboardPage />
      </RequirePortalAuth>
    ),
  },
  {
    path: 'admin',
    element: (
      <RequirePortalAdmin>
        <AdminPage />
      </RequirePortalAdmin>
    ),
  },
  {
    path: 'collaboration/:id/listen',
    element: (
      <RequirePortalAuth>
        <ListeningChamberPage />
      </RequirePortalAuth>
    ),
  },
  {
    path: 'collaboration/:id/proposal',
    element: (
      <RequirePortalAuth>
        <ProposalArchivePage />
      </RequirePortalAuth>
    ),
  },
  {
    path: 'collaboration/:id/visuals',
    element: (
      <RequirePortalAuth>
        <VisualGalleryPage />
      </RequirePortalAuth>
    ),
  },
  {
    path: 'collaboration/:id/respond',
    element: (
      <RequirePortalAuth>
        <TransmissionChamberPage />
      </RequirePortalAuth>
    ),
  },
  { path: '*', element: <NotFoundPage /> },
];
