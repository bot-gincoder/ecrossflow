import { createHash } from "node:crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const DEFAULT_LOCALE = process.env.DEFAULT_LOCALE || "fr";
const GOOGLE_TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY || "";
const AUTO_TRANSLATE_ENABLED = (process.env.AUTO_TRANSLATE_ENABLED || "true").toLowerCase() === "true";
const TRANSLATION_PROVIDER = process.env.TRANSLATION_PROVIDER || "google";

const INITIAL_LANGUAGES: Array<{ code: string; label: string; nativeLabel: string; isRtl: boolean }> = [
  { code: "fr", label: "French", nativeLabel: "Français", isRtl: false },
  { code: "en", label: "English", nativeLabel: "English", isRtl: false },
  { code: "es", label: "Spanish", nativeLabel: "Español", isRtl: false },
  { code: "pt", label: "Portuguese", nativeLabel: "Português", isRtl: false },
  { code: "de", label: "German", nativeLabel: "Deutsch", isRtl: false },
  { code: "it", label: "Italian", nativeLabel: "Italiano", isRtl: false },
  { code: "nl", label: "Dutch", nativeLabel: "Nederlands", isRtl: false },
  { code: "ar", label: "Arabic", nativeLabel: "العربية", isRtl: true },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी", isRtl: false },
  { code: "zh", label: "Chinese", nativeLabel: "中文", isRtl: false },
  { code: "ht", label: "Haitian Creole", nativeLabel: "Kreyòl Ayisyen", isRtl: false },
];

let i18nReady = false;
let i18nReadyPromise: Promise<void> | null = null;

function normalizeLocale(locale: string): string {
  const input = String(locale || "").trim().toLowerCase();
  if (!input) return DEFAULT_LOCALE;
  if (input.includes("-")) return input.split("-")[0] || DEFAULT_LOCALE;
  return input;
}

function sourceHash(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function normalizeText(source: string): string {
  return String(source || "").replace(/\s+/g, " ").trim();
}

async function callGoogleTranslate(texts: string[], target: string): Promise<string[]> {
  if (!texts.length) return [];
  if (!GOOGLE_TRANSLATE_API_KEY || !AUTO_TRANSLATE_ENABLED || TRANSLATION_PROVIDER !== "google") {
    return texts;
  }

  const response = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(GOOGLE_TRANSLATE_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: texts, target, source: DEFAULT_LOCALE, format: "text" }),
    },
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`GOOGLE_TRANSLATE_HTTP_${response.status}: ${errText.slice(0, 500)}`);
  }

  const payload = await response.json() as { data?: { translations?: Array<{ translatedText?: string }> } };
  const translated = payload.data?.translations?.map((item) => item.translatedText || "") || [];
  return translated.length === texts.length ? translated : texts;
}

async function runQuery<T = Record<string, unknown>>(query: ReturnType<typeof sql>): Promise<T[]> {
  const result = await db.execute(query) as unknown as { rows?: T[] };
  return result.rows || [];
}

export async function ensureI18nInfra(): Promise<void> {
  if (i18nReady) return;
  if (i18nReadyPromise) return i18nReadyPromise;

  i18nReadyPromise = (async () => {
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE i18n_translation_status AS ENUM ('AUTO','MANUAL','REVIEW');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS i18n_languages (
        code varchar(10) PRIMARY KEY,
        label varchar(80) NOT NULL,
        native_label varchar(120) NOT NULL,
        is_rtl boolean NOT NULL DEFAULT false,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS i18n_keys (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        namespace varchar(60) NOT NULL,
        key varchar(255) NOT NULL,
        source_text text NOT NULL,
        context text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_i18n_keys_namespace_key ON i18n_keys(namespace, key);`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS i18n_key_translations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        i18n_key_id uuid NOT NULL REFERENCES i18n_keys(id) ON DELETE CASCADE,
        locale varchar(10) NOT NULL,
        translated_text text NOT NULL,
        status i18n_translation_status NOT NULL DEFAULT 'AUTO',
        provider varchar(40) NOT NULL DEFAULT 'google',
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_i18n_key_translations_key_locale ON i18n_key_translations(i18n_key_id, locale);`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS i18n_runtime_cache (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        source_hash varchar(64) NOT NULL,
        source_text text NOT NULL,
        locale varchar(10) NOT NULL,
        translated_text text NOT NULL,
        status i18n_translation_status NOT NULL DEFAULT 'AUTO',
        provider varchar(40) NOT NULL DEFAULT 'google',
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        metadata jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_i18n_runtime_hash_locale ON i18n_runtime_cache(source_hash, locale);`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS i18n_audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        action varchar(80) NOT NULL,
        target_type varchar(60) NOT NULL,
        target_id varchar(120),
        details jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    for (const lang of INITIAL_LANGUAGES) {
      await db.execute(sql`
        INSERT INTO i18n_languages(code, label, native_label, is_rtl, is_active)
        VALUES (${lang.code}, ${lang.label}, ${lang.nativeLabel}, ${lang.isRtl}, true)
        ON CONFLICT (code) DO UPDATE
        SET label = EXCLUDED.label,
            native_label = EXCLUDED.native_label,
            is_rtl = EXCLUDED.is_rtl,
            is_active = EXCLUDED.is_active,
            updated_at = now();
      `);
    }

    i18nReady = true;
  })();

  try {
    await i18nReadyPromise;
  } finally {
    i18nReadyPromise = null;
  }
}

export async function listActiveLocales() {
  await ensureI18nInfra();
  return runQuery<{ code: string; label: string; native_label: string; is_rtl: boolean; is_active: boolean }>(sql`
    SELECT code, label, native_label, is_rtl, is_active
    FROM i18n_languages
    WHERE is_active = true
    ORDER BY code ASC;
  `);
}

export async function upsertI18nKeys(payload: Array<{ namespace: string; key: string; sourceText: string; context?: string | null }>) {
  await ensureI18nInfra();
  for (const item of payload) {
    const namespace = String(item.namespace || "common").trim();
    const key = String(item.key || "").trim();
    const sourceTextValue = normalizeText(item.sourceText);
    if (!namespace || !key || !sourceTextValue) continue;

    await db.execute(sql`
      INSERT INTO i18n_keys(namespace, key, source_text, context)
      VALUES (${namespace}, ${key}, ${sourceTextValue}, ${item.context || null})
      ON CONFLICT (namespace, key) DO UPDATE
      SET source_text = EXCLUDED.source_text,
          context = EXCLUDED.context,
          updated_at = now();
    `);
  }
}

export async function getBundle(localeRaw: string, namespaces: string[] = []) {
  await ensureI18nInfra();
  const locale = normalizeLocale(localeRaw);
  const cleanNamespaces = namespaces.map((n) => n.trim()).filter(Boolean);

  const allKeys = await runQuery<{ id: string; namespace: string; key: string; source_text: string }>(sql`
    SELECT id, namespace, key, source_text
    FROM i18n_keys;
  `);
  const keys = cleanNamespaces.length
    ? allKeys.filter((item) => cleanNamespaces.includes(item.namespace))
    : allKeys;

  if (!keys.length) return {};

  if (locale !== DEFAULT_LOCALE && AUTO_TRANSLATE_ENABLED) {
    const missing = await runQuery<{ id: string; source_text: string }>(sql`
      SELECT k.id, k.source_text
      FROM i18n_keys k
      LEFT JOIN i18n_key_translations t
        ON t.i18n_key_id = k.id AND t.locale = ${locale}
      WHERE t.id IS NULL;
    `);

    if (missing.length) {
      const translated = await callGoogleTranslate(missing.map((m) => m.source_text), locale);
      for (let i = 0; i < missing.length; i++) {
        const item = missing[i]!;
        const text = normalizeText(translated[i] || item.source_text);
        await db.execute(sql`
          INSERT INTO i18n_key_translations(i18n_key_id, locale, translated_text, status, provider)
          VALUES (${item.id}, ${locale}, ${text}, 'AUTO', ${TRANSLATION_PROVIDER})
          ON CONFLICT (i18n_key_id, locale) DO UPDATE
          SET translated_text = EXCLUDED.translated_text,
              status = 'AUTO',
              provider = EXCLUDED.provider,
              updated_at = now();
        `);
      }
    }
  }

  const rows = locale === DEFAULT_LOCALE
    ? await runQuery<{ namespaced_key: string; translated_text: string }>(sql`
      SELECT (k.namespace || '.' || k.key) AS namespaced_key, k.source_text AS translated_text
      FROM i18n_keys k;
    `)
    : await runQuery<{ namespaced_key: string; translated_text: string }>(sql`
      SELECT (k.namespace || '.' || k.key) AS namespaced_key,
             COALESCE(t.translated_text, k.source_text) AS translated_text
      FROM i18n_keys k
      LEFT JOIN i18n_key_translations t
        ON t.i18n_key_id = k.id AND t.locale = ${locale};
    `);

  return Object.fromEntries(rows.map((row) => [row.namespaced_key, row.translated_text]));
}

export async function translateRuntimeBatch(localeRaw: string, texts: string[], actorUserId?: string) {
  await ensureI18nInfra();
  const locale = normalizeLocale(localeRaw);
  const clean = Array.from(new Set(texts.map(normalizeText).filter(Boolean))).slice(0, 200);
  if (!clean.length) return {};
  if (locale === DEFAULT_LOCALE) return Object.fromEntries(clean.map((t) => [t, t]));

  const output: Record<string, string> = {};
  const missing: string[] = [];

  for (const text of clean) {
    const hash = sourceHash(text);
    const rows = await runQuery<{ translated_text: string }>(sql`
      SELECT translated_text
      FROM i18n_runtime_cache
      WHERE source_hash = ${hash}
        AND locale = ${locale}
      LIMIT 1;
    `);
    if (rows.length) output[text] = rows[0]!.translated_text;
    else missing.push(text);
  }

  if (missing.length && AUTO_TRANSLATE_ENABLED) {
    const translated = await callGoogleTranslate(missing, locale);
    for (let i = 0; i < missing.length; i++) {
      const sourceTextValue = missing[i]!;
      const translatedText = normalizeText(translated[i] || sourceTextValue);
      const hash = sourceHash(sourceTextValue);
      output[sourceTextValue] = translatedText;

      await db.execute(sql`
        INSERT INTO i18n_runtime_cache(source_hash, source_text, locale, translated_text, status, provider, created_by)
        VALUES (${hash}, ${sourceTextValue}, ${locale}, ${translatedText}, 'AUTO', ${TRANSLATION_PROVIDER}, ${actorUserId || null})
        ON CONFLICT (source_hash, locale) DO UPDATE
        SET translated_text = EXCLUDED.translated_text,
            status = 'AUTO',
            provider = EXCLUDED.provider,
            updated_at = now();
      `);
    }
  }

  for (const text of clean) {
    if (!output[text]) output[text] = text;
  }

  return output;
}

export async function setManualRuntimeTranslation(input: {
  sourceText: string;
  locale: string;
  translatedText: string;
  actorUserId: string;
}) {
  await ensureI18nInfra();
  const locale = normalizeLocale(input.locale);
  const sourceTextValue = normalizeText(input.sourceText);
  const translatedTextValue = normalizeText(input.translatedText);
  const hash = sourceHash(sourceTextValue);

  await db.execute(sql`
    INSERT INTO i18n_runtime_cache(source_hash, source_text, locale, translated_text, status, provider, created_by)
    VALUES (${hash}, ${sourceTextValue}, ${locale}, ${translatedTextValue}, 'MANUAL', 'manual', ${input.actorUserId})
    ON CONFLICT (source_hash, locale) DO UPDATE
    SET translated_text = EXCLUDED.translated_text,
        status = 'MANUAL',
        provider = 'manual',
        created_by = ${input.actorUserId},
        updated_at = now();
  `);

  await db.execute(sql`
    INSERT INTO i18n_audit_logs(actor_user_id, action, target_type, target_id, details)
    VALUES (
      ${input.actorUserId},
      'RUNTIME_TRANSLATION_MANUAL_SET',
      'i18n_runtime_cache',
      ${`${locale}:${hash}`},
      jsonb_build_object(
        'locale', ${locale},
        'sourceText', ${sourceTextValue},
        'translatedText', ${translatedTextValue}
      )
    );
  `);
}

export async function listProviderSupportedLanguages(target = "fr") {
  if (!GOOGLE_TRANSLATE_API_KEY || TRANSLATION_PROVIDER !== "google") return [];
  const response = await fetch(
    `https://translation.googleapis.com/language/translate/v2/languages?key=${encodeURIComponent(GOOGLE_TRANSLATE_API_KEY)}&target=${encodeURIComponent(target)}`,
  );
  if (!response.ok) return [];
  const payload = await response.json() as { data?: { languages?: Array<{ language: string; name?: string }> } };
  return payload.data?.languages || [];
}
