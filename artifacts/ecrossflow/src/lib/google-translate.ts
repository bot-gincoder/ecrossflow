declare global {
  interface Window {
    google?: {
      translate?: {
        TranslateElement?: new (
          options: Record<string, unknown>,
          elementId: string,
        ) => unknown;
      };
    };
    googleTranslateElementInit?: () => void;
    __googleTranslateReady?: Promise<void>;
  }
}

export const CORE_LANGUAGES = new Set(["fr", "en", "es", "ht"]);
let reapplyTimer: ReturnType<typeof setInterval> | null = null;

function rootDomain(hostname: string): string {
  const parts = hostname.split(".").filter(Boolean);
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join(".");
}

function setGoogleTranslateCookie(lang: string): void {
  const value = `/auto/${lang}`;
  const host = window.location.hostname;
  const domains = new Set<string>([host, `.${host}`, `.${rootDomain(host)}`]);
  for (const domain of domains) {
    document.cookie = `googtrans=${value};path=/;domain=${domain};max-age=31536000;SameSite=Lax`;
  }
  document.cookie = `googtrans=${value};path=/;max-age=31536000;SameSite=Lax`;
}

export function ensureGoogleTranslate(): Promise<void> {
  if (window.__googleTranslateReady) return window.__googleTranslateReady;

  window.__googleTranslateReady = new Promise<void>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="translate.google.com/translate_a/element.js"]',
    );

    window.googleTranslateElementInit = () => {
      if (window.google?.translate?.TranslateElement) {
        new window.google.translate.TranslateElement(
          {
            pageLanguage: "en",
            autoDisplay: false,
          },
          "google_translate_element_hidden",
        );
      }

      const waitForCombo = () => {
        const combo = document.querySelector<HTMLSelectElement>(".goog-te-combo");
        if (combo) resolve();
        else setTimeout(waitForCombo, 120);
      };
      waitForCombo();
    };

    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
      script.async = true;
      document.head.appendChild(script);
    } else if (window.google?.translate?.TranslateElement) {
      window.googleTranslateElementInit();
    }
  });

  return window.__googleTranslateReady;
}

export function applyGoogleLanguage(lang: string): void {
  setGoogleTranslateCookie(lang);
  const combo = document.querySelector<HTMLSelectElement>(".goog-te-combo");
  if (!combo) return;
  combo.value = lang;
  combo.dispatchEvent(new Event("change"));
}

export function keepGoogleLanguageSynced(lang: string): void {
  setGoogleTranslateCookie(lang);
  if (reapplyTimer) {
    clearInterval(reapplyTimer);
    reapplyTimer = null;
  }
  // If user closes Google's floating translate UI, force the selected language back.
  reapplyTimer = setInterval(() => {
    const combo = document.querySelector<HTMLSelectElement>(".goog-te-combo");
    if (!combo) {
      setGoogleTranslateCookie(lang);
      return;
    }
    if (combo.value !== lang) {
      combo.value = lang;
      combo.dispatchEvent(new Event("change"));
    }
  }, 1200);
}

function clearGoogTransCookie(): void {
  const host = window.location.hostname;
  const domains = new Set<string>([host, `.${host}`, `.${rootDomain(host)}`]);
  for (const domain of domains) {
    document.cookie = `googtrans=;path=/;domain=${domain};max-age=0;SameSite=Lax`;
  }
  document.cookie = "googtrans=;path=/;max-age=0;SameSite=Lax";
}

export function cleanupGoogleTranslateUi(resetCookie = false): void {
  if (reapplyTimer) {
    clearInterval(reapplyTimer);
    reapplyTimer = null;
  }
  if (resetCookie) clearGoogTransCookie();

  const selectors = [
    ".goog-te-banner-frame",
    "iframe.goog-te-banner-frame",
    ".goog-te-balloon-frame",
    "#goog-gt-tt",
    ".goog-te-spinner-pos",
    ".skiptranslate",
  ];
  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((node) => node.remove());
  });

  document.body.style.top = "0px";
}
