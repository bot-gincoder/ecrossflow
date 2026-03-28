import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect, useMemo } from "react";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { BASE_FR_TRANSLATIONS, useAppStore } from "@/hooks/use-store";
import {
  buildLocalizedPath,
  DEFAULT_LOCALE,
  detectBrowserLocale,
  extractLocaleFromPath,
  fetchI18nBundle,
  INITIAL_ENABLED_LOCALES,
  normalizeLocale,
  persistLocale,
  RTL_LOCALES,
} from "@/lib/i18n";
import { startRuntimeTranslation, stopRuntimeTranslation } from "@/lib/runtime-i18n";

import Landing from "@/pages/landing";
import AuthPage from "@/pages/auth";
import VerifyEmailPage from "@/pages/verify-email";
import GoogleCheckEmailPage from "@/pages/google-check-email";
import OnboardingPage from "@/pages/onboarding";
import Dashboard from "@/pages/dashboard";
import Boards from "@/pages/boards";
import WalletPage from "@/pages/wallet";
import HistoryPage from "@/pages/history";
import HistoryReport from "@/pages/history-report";
import ReferralsPage from "@/pages/referrals";
import NotificationsPage from "@/pages/notifications";
import ProfilePage from "@/pages/profile";
import AdminPage from "@/pages/admin";
import EvolutionPage from "@/pages/evolution";
import NotifLinkPage from "@/pages/notif-link";
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

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_ID_RE = /^[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$/;
const IS_GOOGLE_CLIENT_ID_VALID = GOOGLE_CLIENT_ID_RE.test(GOOGLE_CLIENT_ID);

if (typeof window !== "undefined") {
  setBaseUrl(window.location.origin);
  setAuthTokenGetter(() => {
    return (
      localStorage.getItem("ecrossflow_token") ||
      useAppStore.getState().token ||
      ""
    );
  });
}

function RedirectTo({ to }: { to: string }) {
  const [, navigate] = useLocation();
  useEffect(() => { navigate(to); }, [to, navigate]);
  return null;
}

function AppSetup({ children, locale }: { children: React.ReactNode; locale: string }) {
  const { theme, setLanguage, setRemoteMessages } = useAppStore();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark", "midnight", "gold");
    if (theme !== "light") root.classList.add(theme);
    else root.classList.add("light");
  }, [theme]);

  useEffect(() => {
    setLanguage(locale);
    persistLocale(locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = RTL_LOCALES.has(locale) ? "rtl" : "ltr";
  }, [locale, setLanguage]);

  useEffect(() => {
    const origin = window.location.origin;
    const canonicalHref = `${origin}${window.location.pathname}${window.location.search}`;
    let canonical = document.querySelector<HTMLLinkElement>("link[rel='canonical']");
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalHref;

    document.querySelectorAll("link[data-i18n-hreflang='true']").forEach((node) => node.remove());
    for (const code of INITIAL_ENABLED_LOCALES) {
      const href = buildLocalizedPath(code, window.location.pathname, window.location.search, window.location.hash);
      const alt = document.createElement("link");
      alt.rel = "alternate";
      alt.hreflang = code;
      alt.href = `${origin}${href}`;
      alt.dataset.i18nHreflang = "true";
      document.head.appendChild(alt);
    }
  }, [locale]);

  useEffect(() => {
    let active = true;
    const loadBundle = async () => {
      try {
        const syncKey = "ecrossflow_i18n_synced_v1";
        if (!localStorage.getItem(syncKey)) {
          const base = import.meta.env.BASE_URL.replace(/\/$/, "");
          const items = Object.entries(BASE_FR_TRANSLATIONS).map(([key, sourceText]) => {
            const split = key.split(".");
            const namespace = split.length > 1 ? split[0]! : "common";
            const normalizedKey = split.length > 1 ? split.slice(1).join(".") : key;
            return { namespace, key: normalizedKey, sourceText };
          });
          await fetch(`${base}/api/i18n/sync-keys`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items }),
          });
          localStorage.setItem(syncKey, "1");
        }

        const messages = await fetchI18nBundle(locale, ["common"]);
        if (!active) return;
        setRemoteMessages(messages);
      } catch {
        if (!active) return;
        setRemoteMessages({});
      }
    };
    void loadBundle();
    return () => { active = false; };
  }, [locale, setRemoteMessages]);

  useEffect(() => {
    void startRuntimeTranslation(locale);
    return () => { stopRuntimeTranslation(); };
  }, [locale]);

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/auth/login" component={AuthPage} />
      <Route path="/auth/register" component={AuthPage} />
      <Route path="/auth/verify-email" component={VerifyEmailPage} />
      <Route path="/auth/check-email" component={GoogleCheckEmailPage} />
      <Route path="/onboarding" component={OnboardingPage} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/boards" component={Boards} />
      <Route path="/wallet" component={WalletPage} />
      <Route path="/history" component={HistoryPage} />
      <Route path="/history/report" component={HistoryReport} />
      <Route path="/referrals" component={ReferralsPage} />
      <Route path="/notifications" component={NotificationsPage} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/admin/evolution" component={EvolutionPage} />
      <Route path="/admin/notif-link" component={NotifLinkPage} />
      <Route path="/admin/users"><RedirectTo to="/admin?tab=users" /></Route>
      <Route path="/admin/payments"><RedirectTo to="/admin?tab=deposits" /></Route>
      <Route path="/admin/boards"><RedirectTo to="/admin?tab=boards" /></Route>
      <Route path="/admin/reports"><RedirectTo to="/admin?tab=reports" /></Route>
      <Route path="/admin/withdrawals"><RedirectTo to="/admin?tab=withdrawals" /></Route>
      <Route path="/about" component={AboutPage} />
      <Route path="/how-it-works" component={HowItWorksPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent({ locale }: { locale: string }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/${locale}`}>
          <AppSetup locale={locale}>
            <Router />
          </AppSetup>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function App() {
  const locale = useMemo(() => {
    if (typeof window === "undefined") return DEFAULT_LOCALE;
    const path = window.location.pathname || "/";
    const extracted = extractLocaleFromPath(path);
    if (extracted.locale) return normalizeLocale(extracted.locale);

    const detected = detectBrowserLocale();
    const nextUrl = buildLocalizedPath(detected, path, window.location.search, window.location.hash);
    window.history.replaceState({}, "", nextUrl);
    return detected;
  }, []);

  if (IS_GOOGLE_CLIENT_ID_VALID) {
    return (
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <AppContent locale={locale} />
      </GoogleOAuthProvider>
    );
  }
  return <AppContent locale={locale} />;
}

export default App;
