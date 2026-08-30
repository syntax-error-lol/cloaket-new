import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient, MutationCache } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { useGetMe, ApiError } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/layout";
import logoImg from "@/assets/logo.png";

// ============================================================================
// EMERGENCY MAINTENANCE SWITCH — Aug 28, 2026 hack recovery.
// While true, the whole client renders only the maintenance notice below and
// fires ZERO api calls. The API server has its own copy of this flag
// (artifacts/api-server/src/lib/maintenance.ts) that 503s every game route.
// Reopening the game = flip BOTH flags to false and publish.
// ============================================================================
const MAINTENANCE_MODE: boolean = false;

function MaintenanceScreen() {
  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-background text-foreground relative">
      <div className="absolute inset-0 bg-checkerboard opacity-20 pointer-events-none animate-bg-drift" />
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-32 h-32 md:w-44 md:h-44 mb-6 animate-float">
          <img src={logoImg} alt="Cloaket Logo" className="w-full h-full object-contain drop-shadow-2xl" />
        </div>
        <h1 className="font-black font-display tracking-widest uppercase text-3xl md:text-5xl text-white mb-4 drop-shadow-[0_0_20px_rgba(107,59,227,0.5)]">
          Temporarily Down
        </h1>
        <p className="max-w-md text-lg md:text-xl font-bold text-muted-foreground mb-2">
          Cloaket is temporarily down due to some issues. We&apos;re getting them
          fixed and will have the game back up as fast as possible.
        </p>
        <p className="max-w-md text-base md:text-lg font-bold text-foreground/80">
          Your blooks and progress are safe — check back soon!
        </p>
      </div>
    </div>
  );
}

import Landing from "@/pages/landing";
import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import MinePage from "@/pages/mine";
import Market from "@/pages/market";
import Blooks from "@/pages/blooks";
import Bazaar from "@/pages/bazaar";
import Chat from "@/pages/chat";
import Trade from "@/pages/trade";
import Clans from "@/pages/clans";
import FriendsPage from "@/pages/friends";
import Leaderboard from "@/pages/leaderboard";
import Stats from "@/pages/stats";
import AdminPage from "@/pages/admin";
import StorePage from "@/pages/store";
import CraftPage from "@/pages/craft";
import SettingsPage from "@/pages/settings";
import TermsPage from "@/pages/terms";
import ModPage from "@/pages/mod";
import OwnerPage from "@/pages/owner";
import CoownerPage from "@/pages/coowner";

// Queries that already refresh themselves on a short interval (chat, trades,
// online count). Refetching these after every mutation just multiplies
// requests — their own polling picks up any change within a few seconds.
const SELF_POLLING_PATHS = ["/api/chat/messages", "/api/online-count", "/api/trades/"];

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      // Serve cached data on remount for a bit instead of refiring every
      // query each time the player switches pages — navigation renders
      // instantly from cache and the server isn't hammered. Mutations
      // still force-refresh via the invalidation below.
      staleTime: 15_000,
    },
  },
  // After a successful mutation (equipping a color, buying a bundle,
  // changing a name, ...), refetch the queries on screen so every surface
  // updates. Two carve-outs keep this from becoming a request storm:
  //  - mutations with meta.noGlobalInvalidate (e.g. sending a chat message)
  //    handle their own targeted cache updates
  //  - self-polling queries are skipped entirely
  mutationCache: new MutationCache({
    onSuccess: (_data, _variables, _context, mutation) => {
      if (mutation.meta?.noGlobalInvalidate) return;
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const path = query.queryKey[0];
          return !(
            typeof path === "string" &&
            SELF_POLLING_PATHS.some((p) => path.startsWith(p))
          );
        },
      });
    },
  }),
});

// True only when the server explicitly said "not signed in". Network blips,
// timeouts, and 5xx errors must NOT be treated as a logout.
function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

// Retry transient failures (network hiccups, brief server restarts) a few
// times before giving up; never retry a real 401.
const meQueryOptions = {
  retry: (failureCount: number, error: unknown) =>
    !isAuthError(error) && failureCount < 3,
  retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 5000),
} as const;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground">
      <div className="text-center">
        <h1 className="text-6xl font-black mb-4">404</h1>
        <p className="text-xl text-muted-foreground font-medium">Page not found.</p>
      </div>
    </div>
  );
}

function ProtectedRoutes() {
  const { data: me, isLoading, isError, error, refetch } = useGetMe({ query: meQueryOptions as any });

  if (isLoading) {
    return <div className="min-h-screen w-full flex items-center justify-center bg-background"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>;
  }

  // Only a real 401 means "signed out". Anything else (network failure,
  // server restart) keeps the player in the app with a retry screen so they
  // don't get bounced to sign-up and lose where they were.
  if ((isError || !me) && !isAuthError(error)) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center gap-4 bg-background text-foreground">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-muted-foreground font-bold">Connection hiccup — reconnecting...</p>
        <button onClick={() => refetch()} className="text-primary font-bold underline">Retry now</button>
      </div>
    );
  }

  if (isError || !me) {
    return <Redirect to="/sign-up" />;
  }

  return (
    <AppShell>
      <Switch>
        <Route path="/mine"><MinePage /></Route>
        {/* Legacy URL: the Mine lived at /base before the rename. */}
        <Route path="/base"><Redirect to="/mine" /></Route>
        <Route path="/market"><Market /></Route>
        <Route path="/blooks"><Blooks /></Route>
        <Route path="/bazaar"><Bazaar /></Route>
        <Route path="/craft"><CraftPage /></Route>
        <Route path="/chat"><Chat /></Route>
        <Route path="/trade"><Trade /></Route>
        <Route path="/clans"><Clans /></Route>
        <Route path="/friends"><FriendsPage /></Route>
        <Route path="/leaderboard"><Leaderboard /></Route>
        <Route path="/stats"><Stats /></Route>
        <Route path="/store"><StorePage /></Route>
        <Route path="/settings"><SettingsPage /></Route>
        <Route path="/admin"><AdminPage /></Route>
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function PublicOnlyRoute({ component: Component }: { component: React.ComponentType<any> }) {
  const { data: me, isLoading, isError, error, refetch } = useGetMe({ query: meQueryOptions as any });

  if (isLoading) {
    return <div className="min-h-screen w-full flex items-center justify-center bg-background"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>;
  }

  // Same rule as ProtectedRoutes: a transient failure is not "signed out" —
  // hold on a reconnect screen instead of showing sign-in/sign-up to someone
  // who may still have a valid session.
  if (isError && !isAuthError(error)) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center gap-4 bg-background text-foreground">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-muted-foreground font-bold">Connection hiccup — reconnecting...</p>
        <button onClick={() => refetch()} className="text-primary font-bold underline">Retry now</button>
      </div>
    );
  }

  if (me && !isError) {
    return <Redirect to="/stats" />;
  }

  return <Component />;
}

function MainRouter() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Switch>
          <Route path="/"><PublicOnlyRoute component={Landing} /></Route>
          <Route path="/sign-in"><PublicOnlyRoute component={SignInPage} /></Route>
          <Route path="/sign-up"><PublicOnlyRoute component={SignUpPage} /></Route>
          <Route path="/terms"><TermsPage /></Route>
          <Route path="/mod"><ModPage /></Route>
          <Route path="/coowner"><CoownerPage /></Route>
          <Route path="/owner"><OwnerPage /></Route>
          
          <Route><ProtectedRoutes /></Route>
        </Switch>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function App() {
  if (MAINTENANCE_MODE) {
    return <MaintenanceScreen />;
  }
  return (
    <WouterRouter base={basePath}>
      <MainRouter />
    </WouterRouter>
  );
}

export default App;
