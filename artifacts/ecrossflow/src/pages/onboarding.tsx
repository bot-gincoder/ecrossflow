import { useState } from "react";
import { useLocation } from "wouter";
import { useAppStore, type Language, type Theme } from "@/hooks/use-store";
import { useToast } from "@/hooks/use-toast";
import { buildLocalizedPath, persistLocale } from "@/lib/i18n";

type Step = 1 | 2 | 3 | 4;

const LANGUAGES: { value: Language; label: string; flag: string; nativeName: string }[] = [
  { value: "fr", label: "French", flag: "🇫🇷", nativeName: "Français" },
  { value: "en", label: "English", flag: "🇬🇧", nativeName: "English" },
  { value: "es", label: "Spanish", flag: "🇪🇸", nativeName: "Español" },
  { value: "pt", label: "Portuguese", flag: "🇵🇹", nativeName: "Português" },
  { value: "de", label: "German", flag: "🇩🇪", nativeName: "Deutsch" },
  { value: "it", label: "Italian", flag: "🇮🇹", nativeName: "Italiano" },
  { value: "nl", label: "Dutch", flag: "🇳🇱", nativeName: "Nederlands" },
  { value: "ar", label: "Arabic", flag: "🇸🇦", nativeName: "العربية" },
  { value: "hi", label: "Hindi", flag: "🇮🇳", nativeName: "हिन्दी" },
  { value: "zh", label: "Chinese", flag: "🇨🇳", nativeName: "中文" },
  { value: "ht", label: "Haitian Creole", flag: "🇭🇹", nativeName: "Kreyòl Ayisyen" },
];

const THEMES: { value: Theme; label: string; description: string; preview: string }[] = [
  { value: "light", label: "Light", description: "Propre et lumineux", preview: "bg-white border-gray-200" },
  { value: "dark", label: "Dark", description: "Élégant sombre", preview: "bg-gray-900 border-gray-700" },
  { value: "midnight", label: "Midnight", description: "Bleu nuit profond", preview: "bg-slate-900 border-blue-500" },
  { value: "gold", label: "Gold", description: "Prestige et luxe", preview: "bg-amber-950 border-amber-400" },
];

export default function OnboardingPage() {
  const { t, language, setLanguage, theme, setTheme, token } = useAppStore();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>(1);
  const [selectedLang, setSelectedLang] = useState<Language>(language);
  const [selectedTheme, setSelectedTheme] = useState<Theme>(theme);
  const [phone, setPhone] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [loading, setLoading] = useState(false);

  const effectiveToken = token || localStorage.getItem('ecrossflow_token');
  if (!effectiveToken) {
    navigate("/auth/login");
    return null;
  }

  const handleNext = () => {
    if (step === 1) {
      setLanguage(selectedLang);
      persistLocale(selectedLang);
      const next = buildLocalizedPath(
        selectedLang,
        window.location.pathname,
        window.location.search,
        window.location.hash,
      );
      window.history.replaceState({}, "", next);
    }
    if (step === 2) {
      setTheme(selectedTheme);
    }
    if (step < 4) {
      setStep((s) => (s + 1) as Step);
    }
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/users/preferences`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${effectiveToken}`,
        },
        body: JSON.stringify({
          preferredLanguage: selectedLang,
          preferredTheme: selectedTheme,
          phone: phone || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { message?: string };
        toast({ title: t("common.error"), description: data.message || t("common.error"), variant: "destructive" });
        return;
      }
      toast({ title: t("onboarding.finish"), description: "Configuration enregistrée." });
      navigate("/dashboard");
    } catch {
      toast({ title: t("common.error"), description: "Erreur réseau. Réessayez.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const progressPct = (step / 4) * 100;
  const stepTitles: Record<Step, string> = {
    1: t("onboarding.step1"),
    2: t("onboarding.step2"),
    3: t("onboarding.step3"),
    4: t("onboarding.step4"),
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent mb-4">
            <span className="font-display font-bold text-white text-xl">E</span>
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground">{t("onboarding.welcome")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("onboarding.step_of")} {step} {t("onboarding.of")} 4
          </p>
        </div>

        <div className="w-full bg-border/30 rounded-full h-2 mb-8">
          <div
            className="bg-primary rounded-full h-2 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="bg-card border border-card-border rounded-2xl p-8">
          <h2 className="text-xl font-display font-bold text-foreground mb-6">{stepTitles[step]}</h2>

          {step === 1 && (
            <div className="grid grid-cols-1 gap-3">
              {LANGUAGES.map(lang => (
                <button
                  key={lang.value}
                  onClick={() => setSelectedLang(lang.value)}
                  className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                    selectedLang === lang.value
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50 bg-background/50"
                  }`}
                >
                  <span className="text-3xl">{lang.flag}</span>
                  <div>
                    <div className="font-semibold text-foreground">{lang.nativeName}</div>
                    <div className="text-sm text-muted-foreground">{lang.label}</div>
                  </div>
                  {selectedLang === lang.value && (
                    <div className="ml-auto w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-2 gap-3">
              {THEMES.map(th => (
                <button
                  key={th.value}
                  onClick={() => setSelectedTheme(th.value)}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    selectedTheme === th.value
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className={`w-full h-16 rounded-lg mb-3 border-2 ${th.preview} flex items-center justify-center`}>
                    <div className="w-6 h-6 rounded-full bg-primary/70" />
                  </div>
                  <div className="font-semibold text-foreground text-sm">{th.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{th.description}</div>
                </button>
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground mb-4">
                Ajoutez un numéro de téléphone pour sécuriser votre compte (optionnel).
              </p>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {t("profile.phone")} <span className="text-muted-foreground text-xs">(optionnel)</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+509 XXXX XXXX"
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              </div>
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 text-sm text-muted-foreground">
                💡 Vous pourrez modifier ces informations à tout moment depuis votre profil.
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Partagez ce code pour inviter vos amis et gagner des bonus sur chaque filleul actif.
              </p>
              <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20">
                <div className="text-xs text-muted-foreground mb-1">{t("referrals.your_code")}</div>
                <div className="flex items-center gap-3">
                  <div className="font-mono font-bold text-2xl text-foreground tracking-widest">
                    {referralCode || "CHARGEMENT..."}
                  </div>
                  <button
                    onClick={async () => {
                      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
                      const res = await fetch(`${base}/api/users/me`, {
                        headers: { Authorization: `Bearer ${effectiveToken}` },
                      });
                      const data = await res.json() as { referralCode?: string };
                      if (data.referralCode) {
                        setReferralCode(data.referralCode);
                        await navigator.clipboard.writeText(data.referralCode);
                        toast({ title: t("referrals.copied") });
                      }
                    }}
                    className="ml-auto px-3 py-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary text-sm font-medium transition-colors"
                  >
                    Copier
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-xl bg-card border border-border">
                  <div className="text-2xl font-bold text-primary">5%</div>
                  <div className="text-xs text-muted-foreground">Bonus parrainage</div>
                </div>
                <div className="p-3 rounded-xl bg-card border border-border">
                  <div className="text-2xl font-bold text-primary">∞</div>
                  <div className="text-xs text-muted-foreground">Filleuls illimités</div>
                </div>
                <div className="p-3 rounded-xl bg-card border border-border">
                  <div className="text-2xl font-bold text-primary">7</div>
                  <div className="text-xs text-muted-foreground">Boards actifs</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          {step > 1 && (
            <button
              onClick={() => setStep(s => (s - 1) as Step)}
              className="flex-1 py-3 rounded-xl border border-border text-foreground font-semibold hover:bg-muted transition-all"
            >
              {t("common.back")}
            </button>
          )}
          {step === 4 ? (
            <button
              onClick={handleFinish}
              disabled={loading}
              className="flex-1 py-3 rounded-xl font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50"
            >
              {loading ? t("common.loading") : t("onboarding.finish")}
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="flex-1 py-3 rounded-xl font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
            >
              {t("onboarding.continue")}
            </button>
          )}
        </div>

        <div className="flex justify-center gap-2 mt-6">
          {[1, 2, 3, 4].map(s => (
            <div
              key={s}
              className={`h-2 rounded-full transition-all ${
                s === step ? "w-8 bg-primary" : s < step ? "w-2 bg-primary/50" : "w-2 bg-border"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
