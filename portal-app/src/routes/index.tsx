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
  // Stage K1.6A.3: project-independent chamber routes -- same page
  // components as above, just matched with no :id param, so
  // useParams().id is undefined and useAuthorizedCollaboration(undefined)
  // makes zero requests (see that hook's own early-return guard). Lets
  // every authenticated visitor explore each chamber environment even
  // with zero or no-yet-selected collaborations, without duplicating
  // any chamber implementation.
  {
    path: 'chambers/listening',
    element: (
      <RequirePortalAuth>
        <ListeningChamberPage />
      </RequirePortalAuth>
    ),
  },
  {
    path: 'chambers/proposals',
    element: (
      <RequirePortalAuth>
        <ProposalArchivePage />
      </RequirePortalAuth>
    ),
  },
  {
    path: 'chambers/visuals',
    element: (
      <RequirePortalAuth>
        <VisualGalleryPage />
      </RequirePortalAuth>
    ),
  },
  {
    path: 'chambers/transmission',
    element: (
      <RequirePortalAuth>
        <TransmissionChamberPage />
      </RequirePortalAuth>
    ),
  },
  { path: '*', element: <NotFoundPage /> },
];
