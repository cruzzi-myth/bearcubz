import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import { MoonRacerLayout } from '../layouts/MoonRacerLayout';

// Every RPG page is lazy-loaded (see PERFORMANCE requirements) —
// the initial /network bundle only pays for the hub + layout.
// React Router's <Suspense> boundary lives in App.tsx.
const NetworkHome = lazy(() => import('../features/entry/NetworkHome').then((m) => ({ default: m.NetworkHome })));
const GuestEntryPage = lazy(() => import('../features/auth/GuestEntryPage').then((m) => ({ default: m.GuestEntryPage })));
const LoginPage = lazy(() => import('../features/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const PassportShellPage = lazy(() => import('../features/passport/PassportShellPage').then((m) => ({ default: m.PassportShellPage })));
const NewPassportPage = lazy(() => import('../features/passport/NewPassportPage').then((m) => ({ default: m.NewPassportPage })));
const OnboardingPage = lazy(() => import('../features/onboarding/OnboardingPage').then((m) => ({ default: m.OnboardingPage })));
const AvatarCreationPage = lazy(() => import('../features/avatar/AvatarCreationPage').then((m) => ({ default: m.AvatarCreationPage })));
const DashboardPage = lazy(() => import('../features/player/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const GalaxyMapPage = lazy(() => import('../features/galaxy/GalaxyMapPage').then((m) => ({ default: m.GalaxyMapPage })));
const CorePage = lazy(() => import('../features/worlds/CorePage').then((m) => ({ default: m.CorePage })));
const CastlePage = lazy(() => import('../features/worlds/CastlePage').then((m) => ({ default: m.CastlePage })));
const WorldPage = lazy(() => import('../features/worlds/WorldPage').then((m) => ({ default: m.WorldPage })));
const LocationPage = lazy(() => import('../features/worlds/LocationPage').then((m) => ({ default: m.LocationPage })));
const MissionsLogPage = lazy(() => import('../features/missions/MissionsLogPage').then((m) => ({ default: m.MissionsLogPage })));
const CanonPage = lazy(() => import('../features/canon/CanonPage').then((m) => ({ default: m.CanonPage })));
const InventoryPage = lazy(() => import('../features/inventory/InventoryPage').then((m) => ({ default: m.InventoryPage })));
const TransmissionsArchivePage = lazy(() => import('../features/transmissions/TransmissionsArchivePage').then((m) => ({ default: m.TransmissionsArchivePage })));
const VisualizerTheaterPage = lazy(() => import('../features/visualizers/VisualizerTheaterPage').then((m) => ({ default: m.VisualizerTheaterPage })));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));

// Paths are relative to the router basename ("/bearcubz/universe" in
// production — see vite.config.ts + main.tsx). "/" here is
// https://cruzzi-myth.github.io/bearcubz/universe/, not the Classic
// site root.
export const networkRoutes: RouteObject[] = [
  {
    path: '/',
    element: <MoonRacerLayout />,
    children: [
      { index: true, element: <NetworkHome /> },
      { path: 'guest', element: <GuestEntryPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'passport', element: <PassportShellPage /> },
      { path: 'passport/new', element: <NewPassportPage /> },
      { path: 'onboarding', element: <OnboardingPage /> },
      { path: 'avatar', element: <AvatarCreationPage /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'galaxy', element: <GalaxyMapPage /> },
      { path: 'core', element: <CorePage /> },
      { path: 'castle', element: <CastlePage /> },
      { path: 'world/:worldId', element: <WorldPage /> },
      { path: 'location/:locationId', element: <LocationPage /> },
      { path: 'missions', element: <MissionsLogPage /> },
      { path: 'canon', element: <CanonPage /> },
      { path: 'inventory', element: <InventoryPage /> },
      { path: 'transmissions', element: <TransmissionsArchivePage /> },
      { path: 'visualizers', element: <VisualizerTheaterPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
