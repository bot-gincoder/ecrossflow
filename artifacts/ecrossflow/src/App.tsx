import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { useAppStore } from "@/hooks/use-store";

import Landing from "@/pages/landing";
import AuthPage from "@/pages/auth";
import Dashboard from "@/pages/dashboard";
import Boards from "@/pages/boards";
import WalletPage from "@/pages/wallet";
import HistoryPage from "@/pages/history";
import ReferralsPage from "@/pages/referrals";
import NotificationsPage from "@/pages/notifications";
import ProfilePage from "@/pages/profile";
import AdminPage from "@/pages/admin";
import AboutPage from "@/pages/about";
import HowItWorksPage from "@/pages/how-it-works";
import TermsPage from "@/pages/terms";
import PrivacyPage from "@/pages/privacy";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    }
  }
});

function AppSetup({ children }: { children: React.ReactNode }) {
  const { token, theme } = useAppStore();

  useEffect(() => {
    const apiUrl = `${window.location.origin}`;
    setBaseUrl(apiUrl);
    setAuthTokenGetter(() => token || "");
  }, [token]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark', 'midnight', 'gold');
    if (theme !== 'light') root.classList.add(theme);
    else root.classList.add('light');
  }, [theme]);

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/auth/login" component={AuthPage} />
      <Route path="/auth/register" component={AuthPage} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/boards" component={Boards} />
      <Route path="/wallet" component={WalletPage} />
      <Route path="/history" component={HistoryPage} />
      <Route path="/referrals" component={ReferralsPage} />
      <Route path="/notifications" component={NotificationsPage} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/about" component={AboutPage} />
      <Route path="/how-it-works" component={HowItWorksPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppSetup>
            <Router />
          </AppSetup>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
