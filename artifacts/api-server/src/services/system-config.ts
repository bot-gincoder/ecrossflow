import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const DEFAULTS: Record<string, unknown> = {
  entry_fee_usd: 2,
  min_deposit_usd: 2,
  kyc_on_withdraw_only: true,
  enable_sms_otp: true,
  enable_whatsapp_otp: false,
  enable_auto_withdraw_crypto: false,
  maintenance_mode: false,
  board_auto_progression: true,
  board_force_tools_enabled: true,
  board_min_direct_referrals: 2,
  ceo_bootstrap_full_board_f_required: true,
  deposit_methods_enabled: ["MONCASH", "NATCASH", "BANK_TRANSFER", "CARD", "CRYPTO"],
  withdraw_methods_enabled: ["MONCASH", "NATCASH", "BANK_TRANSFER", "CRYPTO"],
  board_referral_bonus: {
    F: 0.5,
    E: 0.25,
    D: 0.25,
    C: 0.25,
    B: 0.062,
    A: 0.062,
    S: 0.062,
  },
  board_financials: {
    F: { entryFee: 2, totalGain: 16, nextBoardDeduction: 10, withdrawable: 4 },
    E: { entryFee: 10, totalGain: 80, nextBoardDeduction: 50, withdrawable: 20 },
    D: { entryFee: 50, totalGain: 400, nextBoardDeduction: 200, withdrawable: 150 },
    C: { entryFee: 200, totalGain: 1600, nextBoardDeduction: 800, withdrawable: 600 },
    B: { entryFee: 800, totalGain: 6400, nextBoardDeduction: 3200, withdrawable: 2400 },
    A: { entryFee: 3200, totalGain: 25600, nextBoardDeduction: 12800, withdrawable: 9600 },
    S: { entryFee: 12800, totalGain: 102400, nextBoardDeduction: 51200, withdrawable: 50000 },
  },
  notif_sms_otp: {
    body: "Ecrossflow • Code securite: {{otp}} • Expire dans {{minutes}} min. Ne le partagez jamais.",
  },
  notif_email_otp: {
    subject: "Votre code de securite Ecrossflow",
    bodyHtml: "<h2>Code de verification</h2><p>Utilisez ce code pour valider votre action:</p><p><strong style='font-size:24px'>{{otp}}</strong></p><p>Validite: {{minutes}} minutes.</p><p>Si vous n etes pas a l origine de cette demande, ignorez ce message.</p>",
  },
  notif_email_verification: {
    subject: "Activez votre compte Ecrossflow",
    bodyHtml: "<h2>Confirmez votre email</h2><p>Votre compte est presque pret.</p><p><a href='{{verification_link}}'>Confirmer mon compte</a></p><p>Si le bouton ne fonctionne pas, copiez ce lien: {{verification_link}}</p>",
  },
  notif_email_notification: {
    subject: "Compte active avec succes",
    bodyHtml: "<h2>Activation confirmee</h2><p>Votre compte est actif.</p><p>Etape suivante: rechargez votre wallet avec au moins {{min_deposit_usd}} USD pour commencer.</p>",
  },
  notif_referral_link: {
    baseUrl: "https://ecrossflow.com",
    registerPath: "/auth/register",
    queryParam: "ref",
    whatsappTemplate: "Bonjour 👋 Rejoins {{app_name}} avec mon code {{referral_code}} et commence ici: {{referral_link}}",
    telegramTemplate: "🚀 Rejoins {{app_name}} | Code: {{referral_code}} | Lien: {{referral_link}}",
    genericTemplate: "Rejoins {{app_name}} avec mon code {{referral_code}}: {{referral_link}}",
  },
};

let infraReady = false;
let infraPromise: Promise<void> | null = null;
let cache = new Map<string, unknown>();
let lastLoadAt = 0;

export function invalidateSystemConfigCache(): void {
  lastLoadAt = 0;
}

export async function ensureSystemConfigInfra(): Promise<void> {
  if (infraReady) return;
  if (infraPromise) return infraPromise;
  infraPromise = (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS system_settings (
        key varchar(80) PRIMARY KEY,
        value jsonb NOT NULL,
        updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS system_settings_audit (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        key varchar(80) NOT NULL,
        old_value jsonb,
        new_value jsonb NOT NULL,
        changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    for (const [key, value] of Object.entries(DEFAULTS)) {
      await db.execute(sql`
        INSERT INTO system_settings (key, value)
        VALUES (${key}, ${JSON.stringify(value)}::jsonb)
        ON CONFLICT (key) DO NOTHING;
      `);
    }
    infraReady = true;
  })();
  try {
    await infraPromise;
  } finally {
    infraPromise = null;
  }
}

async function loadSettings(): Promise<void> {
  await ensureSystemConfigInfra();
  if (Date.now() - lastLoadAt < 5000) return;
  const rows = await db.execute(sql`SELECT key, value FROM system_settings`);
  const next = new Map<string, unknown>();
  const items = (rows as unknown as { rows?: Array<{ key: string; value: unknown }> }).rows || [];
  for (const row of items) next.set(row.key, row.value);
  cache = next;
  lastLoadAt = Date.now();
}

export async function getSystemSetting<T>(key: string, fallback: T): Promise<T> {
  await loadSettings();
  if (!cache.has(key)) return fallback;
  return cache.get(key) as T;
}

export async function getBooleanSetting(key: string, fallback: boolean): Promise<boolean> {
  const raw = await getSystemSetting<unknown>(key, fallback);
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") return raw.toLowerCase() === "true";
  if (typeof raw === "number") return raw !== 0;
  return fallback;
}

export async function getNumberSetting(key: string, fallback: number): Promise<number> {
  const raw = await getSystemSetting<unknown>(key, fallback);
  const num = typeof raw === "number" ? raw : parseFloat(String(raw));
  return Number.isFinite(num) ? num : fallback;
}
