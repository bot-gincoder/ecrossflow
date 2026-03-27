import { ALL_LANGUAGE_OPTIONS } from "@/lib/languages";

export const DEFAULT_LOCALE = "fr";
export const RTL_LOCALES = new Set(["ar"]);
export const INITIAL_ENABLED_LOCALES = [
  "fr",
  "en",
  "es",
  "pt",
  "de",
  "it",
  "nl",
  "ar",
  "hi",
  "zh",
  "ht",
];

export function normalizeLocale(locale: string | null | undefined): string {
  const raw = String(locale || "").trim().toLowerCase();
  if (!raw) return DEFAULT_LOCALE;
  if (raw.includes("-")) return raw.split("-")[0] || DEFAULT_LOCALE;
  return raw;
}

export function extractLocaleFromPath(pathname: string): { locale: string | null; restPath: string } {
  const clean = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const segments = clean.split("/").filter(Boolean);
  if (!segments.length) return { locale: null, restPath: "/" };
  const maybeLocale = normalizeLocale(segments[0]);
  const supported = new Set(INITIAL_ENABLED_LOCALES);
  if (!supported.has(maybeLocale)) return { locale: null, restPath: clean };
  const rest = `/${segments.slice(1).join("/")}`;
  return { locale: maybeLocale, restPath: rest === "/" ? "/" : rest.replace(/\/+$/, "") };
}

export function detectBrowserLocale(): string {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const saved = normalizeLocale(localStorage.getItem("ecrossflow_locale"));
  if (INITIAL_ENABLED_LOCALES.includes(saved)) return saved;

  const navCandidates = [
    ...(navigator.languages || []),
    navigator.language || "",
  ].map(normalizeLocale);
  const found = navCandidates.find((code) => INITIAL_ENABLED_LOCALES.includes(code));
  return found || DEFAULT_LOCALE;
}

export function buildLocalizedPath(targetLocale: string, pathname: string, search: string, hash: string): string {
  const normalized = normalizeLocale(targetLocale);
  const { restPath } = extractLocaleFromPath(pathname);
  const safeRest = restPath.startsWith("/") ? restPath : `/${restPath}`;
  const joined = safeRest === "/" ? `/${normalized}` : `/${normalized}${safeRest}`;
  return `${joined}${search || ""}${hash || ""}`;
}

export function persistLocale(locale: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("ecrossflow_locale", normalizeLocale(locale));
}

export async function fetchI18nBundle(locale: string, namespaces: string[] = ["common"]) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const params = new URLSearchParams({
    locale: normalizeLocale(locale),
    namespaces: namespaces.join(","),
  });
  const response = await fetch(`${base}/api/i18n/bundle?${params.toString()}`);
  if (!response.ok) throw new Error(`I18N_BUNDLE_${response.status}`);
  const payload = await response.json() as { messages?: Record<string, string> };
  return payload.messages || {};
}

export async function fetchLanguagesFromBackend() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const response = await fetch(`${base}/api/i18n/languages`);
  if (!response.ok) throw new Error(`I18N_LANGUAGES_${response.status}`);
  const payload = await response.json() as {
    locales?: Array<{ code: string; label: string; nativeLabel: string; isRtl: boolean; isActive: boolean }>;
  };
  const fallback = ALL_LANGUAGE_OPTIONS.map((opt) => ({
    code: opt.value,
    label: opt.label,
    nativeLabel: opt.nativeLabel,
    isRtl: RTL_LOCALES.has(opt.value),
    isActive: true,
  }));
  return payload.locales?.length ? payload.locales : fallback;
}

