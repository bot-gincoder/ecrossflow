import { db, transactionsTable, usersTable } from "@workspace/db";
import { asc, eq, sql } from "drizzle-orm";
import { buildActionCardEmail, sendEmail } from "./email.js";
import { getSystemSetting } from "./system-config.js";

type DispatchState = "PENDING" | "PROCESSING" | "SENT" | "FAILED";

type PendingTxEmail = {
  transactionId: string;
  userId: string;
  email: string;
  username: string;
  preferredLanguage: string | null;
  type: string;
  status: string;
  amount: string;
  currency: string;
  amountUsd: string;
  referenceId: string | null;
  description: string | null;
  createdAt: Date;
};

let infraReady = false;
let infraPromise: Promise<void> | null = null;
let running = false;
let intervalHandle: NodeJS.Timeout | null = null;

function getPublicAppUrl(): string {
  const raw = process.env.PUBLIC_APP_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  const domain = process.env.DOMAIN?.trim();
  if (domain) return `https://${domain.replace(/\/$/, "")}`;
  return "https://ecrossflow.com";
}

function formatType(type: string, locale: string): string {
  const t = String(type || "").toUpperCase();
  const mapFr: Record<string, string> = {
    DEPOSIT: "Depot",
    WITHDRAWAL: "Retrait",
    BOARD_PAYMENT: "Paiement niveau",
    BOARD_RECEIPT: "Gain niveau",
    BOARD_PROMOTION: "Progression niveau",
    REFERRAL_BONUS: "Bonus parrainage",
    SYSTEM_FEE: "Frais systeme",
    CONVERSION: "Conversion",
  };
  const mapEn: Record<string, string> = {
    DEPOSIT: "Deposit",
    WITHDRAWAL: "Withdrawal",
    BOARD_PAYMENT: "Level payment",
    BOARD_RECEIPT: "Level earning",
    BOARD_PROMOTION: "Level promotion",
    REFERRAL_BONUS: "Referral bonus",
    SYSTEM_FEE: "System fee",
    CONVERSION: "Conversion",
  };
  const useFr = locale !== "en";
  const translated = (useFr ? mapFr[t] : mapEn[t]) || t;
  return translated;
}

function formatStatus(status: string, locale: string): string {
  const s = String(status || "").toUpperCase();
  const mapFr: Record<string, string> = {
    PENDING: "En attente",
    PROCESSING: "En traitement",
    COMPLETED: "Complete",
    FAILED: "Echoue",
    CANCELLED: "Annule",
  };
  const mapEn: Record<string, string> = {
    PENDING: "Pending",
    PROCESSING: "Processing",
    COMPLETED: "Completed",
    FAILED: "Failed",
    CANCELLED: "Cancelled",
  };
  const useFr = locale !== "en";
  return (useFr ? mapFr[s] : mapEn[s]) || s;
}

function renderTemplate(template: string, vars: Record<string, string | number>): string {
  let output = template;
  for (const [key, value] of Object.entries(vars)) {
    const pattern = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    output = output.replace(pattern, String(value));
  }
  return output;
}

export async function ensureTransactionEmailInfra(): Promise<void> {
  if (infraReady) return;
  if (infraPromise) return infraPromise;
  infraPromise = (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS transaction_email_dispatch (
        transaction_id uuid PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status varchar(20) NOT NULL DEFAULT 'PENDING',
        attempts integer NOT NULL DEFAULT 0,
        last_error text,
        sent_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_tx_email_dispatch_status ON transaction_email_dispatch(status, updated_at);`);
    infraReady = true;
  })();
  try {
    await infraPromise;
  } finally {
    infraPromise = null;
  }
}

async function loadPending(limit: number): Promise<PendingTxEmail[]> {
  const rows = await db.execute(sql<PendingTxEmail>`
    SELECT
      t.id AS "transactionId",
      t.user_id AS "userId",
      u.email AS email,
      u.username AS username,
      u.preferred_language AS "preferredLanguage",
      t.type AS type,
      t.status AS status,
      t.amount AS amount,
      t.currency AS currency,
      t.amount_usd AS "amountUsd",
      t.reference_id AS "referenceId",
      t.description AS description,
      t.created_at AS "createdAt"
    FROM transactions t
    INNER JOIN users u ON u.id = t.user_id
    LEFT JOIN transaction_email_dispatch d ON d.transaction_id = t.id
    WHERE
      u.email IS NOT NULL
      AND u.email <> ''
      AND (
        d.transaction_id IS NULL
        OR (d.status = 'FAILED' AND d.attempts < 3)
      )
    ORDER BY t.created_at ASC
    LIMIT ${limit}
  `);
  return (rows as unknown as { rows?: PendingTxEmail[] }).rows || [];
}

async function markDispatch(
  transactionId: string,
  userId: string,
  status: DispatchState,
  error: string | null,
  sentAt: Date | null,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO transaction_email_dispatch (transaction_id, user_id, status, attempts, last_error, sent_at, updated_at)
    VALUES (${transactionId}, ${userId}, ${status}, 1, ${error}, ${sentAt}, now())
    ON CONFLICT (transaction_id)
    DO UPDATE SET
      status = EXCLUDED.status,
      attempts = transaction_email_dispatch.attempts + 1,
      last_error = EXCLUDED.last_error,
      sent_at = COALESCE(EXCLUDED.sent_at, transaction_email_dispatch.sent_at),
      updated_at = now();
  `);
}

async function sendTransactionEmail(row: PendingTxEmail): Promise<void> {
  const lang = String(row.preferredLanguage || "fr").toLowerCase();
  const locale = lang === "en" ? "en" : lang === "es" ? "es" : lang === "ht" ? "ht" : "fr";
  const historyUrl = `${getPublicAppUrl()}/${locale}/history`;
  const amount = Number.parseFloat(String(row.amount || "0"));
  const amountUsd = Number.parseFloat(String(row.amountUsd || "0"));

  const txTypeLabel = formatType(row.type, locale);
  const txStatusLabel = formatStatus(row.status, locale);
  const subjectDefault = locale === "en"
    ? `Ecrossflow transaction update: ${txTypeLabel}`
    : `Mise a jour transaction Ecrossflow: ${txTypeLabel}`;

  const subjectTplCfg = await getSystemSetting<Record<string, unknown>>("notif_email_transaction", {
    subject: "",
    bodyHtml: "",
    actionLabel: "",
  });
  const subjectTpl = String(subjectTplCfg?.subject || "").trim();
  const bodyTpl = String(subjectTplCfg?.bodyHtml || "").trim();
  const actionLabelTpl = String(subjectTplCfg?.actionLabel || "").trim();

  const vars: Record<string, string | number> = {
    app_name: "Ecrossflow",
    username: row.username,
    tx_type: txTypeLabel,
    tx_status: txStatusLabel,
    tx_raw_type: row.type,
    tx_raw_status: row.status,
    amount: Number.isFinite(amount) ? amount.toFixed(2) : String(row.amount),
    amount_usd: Number.isFinite(amountUsd) ? amountUsd.toFixed(2) : String(row.amountUsd),
    currency: row.currency,
    reference_id: row.referenceId || "-",
    description: row.description || "-",
    history_url: historyUrl,
  };

  const subject = subjectTpl ? renderTemplate(subjectTpl, vars) : subjectDefault;
  const title = locale === "en" ? "New account transaction" : "Nouvelle transaction sur votre compte";
  const intro = locale === "en"
    ? `A new operation has been recorded on your account (${txTypeLabel}).`
    : `Une operation a ete enregistree sur votre compte (${txTypeLabel}).`;
  const actionLabel = actionLabelTpl
    ? renderTemplate(actionLabelTpl, vars)
    : locale === "en"
      ? "Open my history"
      : "Voir mon historique";

  const bodyHtml = bodyTpl ? renderTemplate(bodyTpl, vars) : "";
  const lines = bodyTpl ? [] : [
    `${locale === "en" ? "Status" : "Statut"}: ${txStatusLabel}`,
    `${locale === "en" ? "Amount" : "Montant"}: ${Number.isFinite(amount) ? amount.toFixed(2) : row.amount} ${row.currency} (${Number.isFinite(amountUsd) ? amountUsd.toFixed(2) : row.amountUsd} USD)`,
    `${locale === "en" ? "Reference" : "Reference"}: ${row.referenceId || "-"}`,
    `${locale === "en" ? "Description" : "Description"}: ${row.description || "-"}`,
  ];

  const payload = buildActionCardEmail({
    to: row.email,
    subject,
    title,
    intro,
    locale,
    action: {
      label: actionLabel,
      url: historyUrl,
    },
    rawHtml: bodyHtml || undefined,
    lines,
  });
  await sendEmail(payload);
}

export async function dispatchPendingTransactionEmails(limit = 25): Promise<void> {
  if (running) return;
  running = true;
  try {
    await ensureTransactionEmailInfra();
    const rows = await loadPending(limit);
    for (const row of rows) {
      await markDispatch(row.transactionId, row.userId, "PROCESSING", null, null);
      try {
        await sendTransactionEmail(row);
        await markDispatch(row.transactionId, row.userId, "SENT", null, new Date());
      } catch (error) {
        const message = error instanceof Error ? error.message : "EMAIL_SEND_FAILED";
        await markDispatch(row.transactionId, row.userId, "FAILED", message, null);
      }
    }
  } finally {
    running = false;
  }
}

export function startTransactionEmailWorker(): void {
  if (intervalHandle) return;
  void dispatchPendingTransactionEmails(40);
  intervalHandle = setInterval(() => {
    void dispatchPendingTransactionEmails(40);
  }, 20_000);
}

