import { Router, type IRouter } from "express";
import { requireAdmin, type AuthRequest } from "../middlewares/auth.js";
import {
  DEFAULT_LOCALE,
  ensureI18nInfra,
  getBundle,
  listActiveLocales,
  listProviderSupportedLanguages,
  setManualRuntimeTranslation,
  translateRuntimeBatch,
  upsertI18nKeys,
} from "../services/i18n.js";

const router: IRouter = Router();

router.get("/i18n/languages", async (req, res) => {
  await ensureI18nInfra();
  const locales = await listActiveLocales();
  const providerTarget = typeof req.query["target"] === "string" ? req.query["target"] : DEFAULT_LOCALE;
  const providerLocales = await listProviderSupportedLanguages(providerTarget);
  res.json({
    defaultLocale: DEFAULT_LOCALE,
    locales: locales.map((item) => ({
      code: item.code,
      label: item.label,
      nativeLabel: (item as any).native_label ?? (item as any).nativeLabel ?? item.label,
      isRtl: Boolean((item as any).is_rtl ?? (item as any).isRtl),
      isActive: Boolean((item as any).is_active ?? (item as any).isActive ?? true),
    })),
    providerLocales,
  });
});

router.get("/i18n/bundle", async (req, res) => {
  await ensureI18nInfra();
  const locale = typeof req.query["locale"] === "string" ? req.query["locale"] : DEFAULT_LOCALE;
  const namespacesRaw = typeof req.query["namespaces"] === "string" ? req.query["namespaces"] : "";
  const namespaces = namespacesRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const messages = await getBundle(locale, namespaces);
  res.json({
    locale,
    fallbackLocale: DEFAULT_LOCALE,
    messages,
  });
});

router.post("/i18n/translate-runtime", async (req: AuthRequest, res) => {
  await ensureI18nInfra();
  const locale = typeof req.body?.locale === "string" ? req.body.locale : DEFAULT_LOCALE;
  const texts = Array.isArray(req.body?.texts) ? req.body.texts : [];
  const safeTexts = texts.filter((item) => typeof item === "string").slice(0, 200);
  const translations = await translateRuntimeBatch(locale, safeTexts, req.userId);
  res.json({
    locale,
    translations,
  });
});

router.post("/i18n/sync-keys", async (req: AuthRequest, res) => {
  await ensureI18nInfra();
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const normalized = items
    .filter((item: unknown) => item && typeof item === "object")
    .map((item: any) => ({
      namespace: typeof item.namespace === "string" ? item.namespace : "common",
      key: typeof item.key === "string" ? item.key : "",
      sourceText: typeof item.sourceText === "string" ? item.sourceText : "",
      context: typeof item.context === "string" ? item.context : null,
    }));
  await upsertI18nKeys(normalized);
  res.json({ success: true, count: normalized.length });
});

router.post("/i18n/runtime-override", requireAdmin as never, async (req: AuthRequest, res) => {
  await ensureI18nInfra();
  const sourceText = typeof req.body?.sourceText === "string" ? req.body.sourceText : "";
  const translatedText = typeof req.body?.translatedText === "string" ? req.body.translatedText : "";
  const locale = typeof req.body?.locale === "string" ? req.body.locale : DEFAULT_LOCALE;
  if (!sourceText.trim() || !translatedText.trim()) {
    res.status(400).json({ message: "sourceText and translatedText are required" });
    return;
  }
  await setManualRuntimeTranslation({
    sourceText,
    translatedText,
    locale,
    actorUserId: req.userId!,
  });
  res.json({ success: true });
});

export default router;
