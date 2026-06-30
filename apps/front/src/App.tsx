import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './theme/ThemeProvider';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { ActiveCampaignProvider } from './campaign/ActiveCampaignProvider';
import AuthThemeSync from './components/AuthThemeSync';
import AuthScreen from './auth/AuthScreen';
import AppShell from './components/AppShell';
import Campaigns from './pages/Campaigns';
import CampaignHome from './pages/CampaignHome';
import ElementList from './pages/ElementList';
import ElementEditor from './pages/ElementEditor';
import SearchResults from './pages/SearchResults';
import Members from './pages/Members';
import AcceptInvite from './pages/AcceptInvite';
import RunSession from './pages/RunSession';
import Reference from './pages/Reference';
import SharePage from './pages/SharePage';
import Settings from './pages/Settings';
import Placeholder from './pages/Placeholder';

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
            <Routes>
              {/* Public player share view — no auth. */}
              <Route path="/share/:token" element={<SharePage />} />

              {/* Authenticated app. */}
              <Route element={<RequireAuth />}>
                <Route index element={<Navigate to="/campaigns" replace />} />
                <Route path="campaigns" element={<Campaigns />} />
                <Route path="campaigns/:cid" element={<CampaignHome />} />
                <Route path="campaigns/:cid/members" element={<Members />} />
                <Route path="campaigns/:cid/session" element={<RunSession />} />
                <Route path="campaigns/:cid/search" element={<SearchResults />} />
                <Route path="invite/:token" element={<AcceptInvite />} />
                <Route path="campaigns/:cid/:type" element={<ElementList />} />
                <Route path="campaigns/:cid/:type/:elementId" element={<ElementEditor />} />
                <Route path="reference" element={<Reference />} />
                <Route path="reference/:category" element={<Reference />} />
                <Route path="settings" element={<Settings />} />
                <Route path="*" element={<Placeholder />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
