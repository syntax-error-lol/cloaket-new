const fs = require('fs');

let app = fs.readFileSync('artifacts/blacket-game/src/App.tsx', 'utf8');

const newApp = `import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { useGetMe } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/layout";

import Landing from "@/pages/landing";
import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import Market from "@/pages/market";
import Blooks from "@/pages/blooks";
import Bazaar from "@/pages/bazaar";
import Chat from "@/pages/chat";
import Trade from "@/pages/trade";
import Leaderboard from "@/pages/leaderboard";
import Stats from "@/pages/stats";
import AdminPage from "@/pages/admin";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const basePath = import.meta.env.BASE_URL.replace(/\\/$/, "");

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
  const { data: me, isLoading, isError } = useGetMe();

  if (isLoading) {
    return <div className="min-h-screen w-full flex items-center justify-center bg-background"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>;
  }

  if (isError || !me) {
    return <Redirect to="/sign-up" />;
  }

  return (
    <AppShell>
      <Switch>
        <Route path="/market"><Market /></Route>
        <Route path="/blooks"><Blooks /></Route>
        <Route path="/bazaar"><Bazaar /></Route>
        <Route path="/chat"><Chat /></Route>
        <Route path="/trade"><Trade /></Route>
        <Route path="/leaderboard"><Leaderboard /></Route>
        <Route path="/stats"><Stats /></Route>
        <Route path="/admin"><AdminPage /></Route>
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function PublicOnlyRoute({ component: Component }: { component: React.ComponentType<any> }) {
  const { data: me, isLoading, isError } = useGetMe();

  if (isLoading) {
    return <div className="min-h-screen w-full flex items-center justify-center bg-background"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>;
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
          
          <Route><ProtectedRoutes /></Route>
        </Switch>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <MainRouter />
    </WouterRouter>
  );
}

export default App;
`;

fs.writeFileSync('artifacts/blacket-game/src/App.tsx', newApp);
