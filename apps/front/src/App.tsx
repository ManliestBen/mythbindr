import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './theme/ThemeProvider';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { ActiveCampaignProvider } from './campaign/ActiveCampaignProvider';
import AuthThemeSync from './components/AuthThemeSync';
import AuthScreen from './auth/AuthScreen';
import AppShell from './components/AppShell';
const Campaigns = lazy(() => import('./pages/Campaigns'));
const CampaignHome = lazy(() => import('./pages/CampaignHome'));
const ElementList = lazy(() => import('./pages/ElementList'));
const ElementEditor = lazy(() => import('./pages/ElementEditor'));
const SearchResults = lazy(() => import('./pages/SearchResults'));
const CampaignMap = lazy(() => import('./pages/CampaignMap'));
const Activity = lazy(() => import('./pages/Activity'));
const Members = lazy(() => import('./pages/Members'));
const AcceptInvite = lazy(() => import('./pages/AcceptInvite'));
const RunSession = lazy(() => import('./pages/RunSession'));
const Reference = lazy(() => import('./pages/Reference'));
const SharePage = lazy(() => import('./pages/SharePage'));
const ShareSessionView = lazy(() => import('./pages/ShareSessionView'));
const Settings = lazy(() => import('./pages/Settings'));
const Placeholder = lazy(() => import('./pages/Placeholder'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center bg-app-bg text-fg-muted">
      <span className="text-sm">Loading…</span>
    </div>
  );
}

/** Layout route: gate the whole authed app; public routes live outside it. */
function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <AuthScreen />;
  return (
    <ActiveCampaignProvider>
      <AppShell />
    </ActiveCampaignProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <AuthThemeSync />
          <BrowserRouter>
            <Suspense fallback={<Splash />}>
              <Routes>
                {/* Public player share views — no auth. */}
                <Route path="/share/:token" element={<SharePage />} />
                <Route path="/share/:token/session" element={<ShareSessionView />} />

                {/* Authenticated app. */}
                <Route element={<RequireAuth />}>
                  <Route index element={<Navigate to="/campaigns" replace />} />
                  <Route path="campaigns" element={<Campaigns />} />
                  <Route path="campaigns/:cid" element={<CampaignHome />} />
                  <Route path="campaigns/:cid/members" element={<Members />} />
                  <Route path="campaigns/:cid/session" element={<RunSession />} />
                  <Route path="campaigns/:cid/search" element={<SearchResults />} />
                  <Route path="campaigns/:cid/map" element={<CampaignMap />} />
                  <Route path="campaigns/:cid/activity" element={<Activity />} />
                  <Route path="invite/:token" element={<AcceptInvite />} />
                  <Route path="campaigns/:cid/:type" element={<ElementList />} />
                  <Route path="campaigns/:cid/:type/:elementId" element={<ElementEditor />} />
                  <Route path="reference" element={<Reference />} />
                  <Route path="reference/:category" element={<Reference />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="*" element={<Placeholder />} />
                </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
