import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import {
  usersTable,
  walletsTable,
  transactionsTable,
  boardInstancesTable,
  boardParticipantsTable,
  boardsTable,
  notificationsTable,
  ledgerEntriesTable,
  ledgerAccountsTable,
  referralsTable,
  bonusesTable,
  otpCodesTable,
  paymentEventsTable,
  userWalletsTable,
  internalWalletBalancesTable,
  depositsTable,
  withdrawalsTable,
  walletAuditLogsTable,
} from "@workspace/db";
import { eq, desc, ilike, and, count, or, gte, sql, lt, aliasedTable, inArray } from "drizzle-orm";
import { requireAdmin, type AuthRequest } from "../middlewares/auth.js";
import {
  adjustAvailableWithTreasury,
  creditAvailableFromTreasury,
  ensureLedgerInfra,
  ensureWalletAndLedgerAccounts,
  releaseBlockedToAvailable,
  settleBlockedToTreasury,
} from "../lib/ledger.js";
import {
  evaluateAutoPayoutPilot,
  isMoncashAutoWithdrawEnabled,
  moncashReferenceForWithdrawal,
  moncashRetrieveOrderPayment,
  moncashTransfer,
} from "../services/moncash.js";
import { getCryptoWithdrawMode } from "../services/crypto-provider.js";
import { dispatchCryptoWithdrawal } from "../lib/crypto-withdraw.js";
import { invalidateSystemConfigCache } from "../services/system-config.js";
import { BOARD_ORDER, backfillValidatedQueueNumbers, computeStrategicLeafNumbers, evaluateBoardProgressions, fetchValidatedAccounts } from "../services/board-network.js";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidId = (id: string) => UUID_RE.test(id);

const EVOLUTION_ALLOWED_KEYS = new Set([
  "entry_fee_usd",
  "min_deposit_usd",
  "kyc_on_withdraw_only",
  "enable_sms_otp",
  "enable_whatsapp_otp",
  "enable_auto_withdraw_crypto",
  "maintenance_mode",
  "board_auto_progression",
  "board_min_direct_referrals",
  "ceo_bootstrap_full_board_f_required",
  "board_force_tools_enabled",
  "deposit_methods_enabled",
  "withdraw_methods_enabled",
  "board_referral_bonus",
  "board_financials",
]);

const NOTIF_LINK_DOMAIN_TO_KEY = {
  sms_otp: "notif_sms_otp",
  email_otp: "notif_email_otp",
  email_verification: "notif_email_verification",
  email_notif: "notif_email_notification",
  referral_link: "notif_referral_link",
} as const;

const NOTIF_LINK_DEFAULTS: Record<(typeof NOTIF_LINK_DOMAIN_TO_KEY)[keyof typeof NOTIF_LINK_DOMAIN_TO_KEY], unknown> = {
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

const PLATFORM_RESET_PIN_KEY = "platform_reset_pin_hash";
const NOTIF_LINK_SETTING_KEYS = Object.values(NOTIF_LINK_DOMAIN_TO_KEY);
const PLATFORM_RESET_TABLES = [
  "board_participants",
  "board_instances",
  "bonuses",
  "referrals",
  "notifications",
  "otp_codes",
  "payment_events",
  "wallet_audit_logs",
  "deposits",
  "withdrawals",
  "ledger_entries",
  "transactions",
  "user_wallets",
  "internal_wallet_balances",
  "wallets",
  "i18n_audit_logs",
];
type SqlExecutor = { execute: typeof db.execute };

let evolutionInfraReady = false;
let evolutionInfraPromise: Promise<void> | null = null;

async function ensureEvolutionInfra(): Promise<void> {
  if (evolutionInfraReady) return;
  if (evolutionInfraPromise) return evolutionInfraPromise;
  evolutionInfraPromise = (async () => {
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
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_system_settings_audit_created ON system_settings_audit(created_at DESC);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_system_settings_audit_key ON system_settings_audit(key);`);

    await db.execute(sql`
      INSERT INTO system_settings (key, value) VALUES
        ('entry_fee_usd', '2'),
        ('min_deposit_usd', '2'),
        ('kyc_on_withdraw_only', 'true'),
        ('enable_sms_otp', 'true'),
        ('enable_whatsapp_otp', 'false'),
        ('enable_auto_withdraw_crypto', 'false'),
        ('maintenance_mode', 'false'),
        ('board_auto_progression', 'true'),
        ('board_min_direct_referrals', '2'),
        ('ceo_bootstrap_full_board_f_required', 'true'),
        ('board_force_tools_enabled', 'true'),
        ('deposit_methods_enabled', '["MONCASH","NATCASH","BANK_TRANSFER","CARD","CRYPTO"]'),
        ('withdraw_methods_enabled', '["MONCASH","NATCASH","BANK_TRANSFER","CRYPTO"]'),
        ('board_referral_bonus', '{"F":0.5,"E":0.25,"D":0.25,"C":0.25,"B":0.062,"A":0.062,"S":0.062}'),
        ('board_financials', '{"F":{"entryFee":2,"totalGain":16,"nextBoardDeduction":10,"withdrawable":4},"E":{"entryFee":10,"totalGain":80,"nextBoardDeduction":50,"withdrawable":20},"D":{"entryFee":50,"totalGain":400,"nextBoardDeduction":200,"withdrawable":150},"C":{"entryFee":200,"totalGain":1600,"nextBoardDeduction":800,"withdrawable":600},"B":{"entryFee":800,"totalGain":6400,"nextBoardDeduction":3200,"withdrawable":2400},"A":{"entryFee":3200,"totalGain":25600,"nextBoardDeduction":12800,"withdrawable":9600},"S":{"entryFee":12800,"totalGain":102400,"nextBoardDeduction":51200,"withdrawable":50000}}')
      ON CONFLICT (key) DO NOTHING;
    `);
    for (const [k, v] of Object.entries(NOTIF_LINK_DEFAULTS)) {
      await db.execute(sql`
        INSERT INTO system_settings (key, value)
        VALUES (${k}, ${JSON.stringify(v)}::jsonb)
        ON CONFLICT (key) DO NOTHING;
      `);
    }
    evolutionInfraReady = true;
  })();
  try {
    await evolutionInfraPromise;
  } finally {
    evolutionInfraPromise = null;
  }
}

function parseDestination(metadata: unknown, description: string | null): string {
  if (metadata && typeof metadata === "object" && "destination" in metadata) {
    const v = (metadata as Record<string, unknown>).destination;
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  if (description) {
    const m = /^Withdrawal to (.+)$/i.exec(description.trim());
    if (m?.[1]) return m[1].trim();
  }
  return "";
}

function computeStrategicTree(n1: number) {
  const n2 = n1 * 2;
  const n3 = n1 * 2 + 1;
  const n4 = n3 * 2;
  const n5 = n3 * 2 + 1;
  const n6 = n2 * 2 + 1;
  const n7 = n2 * 2;
  const n8 = n6 * 2 + 1;
  const n9 = n6 * 2;
  const n10 = n7 * 2 + 1;
  const n11 = n7 * 2;
  return { n1, n2, n3, n4, n5, n6, n7, n8, n9, n10, n11 };
}

async function readPlatformResetPinHash(executor: SqlExecutor): Promise<string | null> {
  const rows = await executor.execute(sql`
    SELECT value
    FROM system_settings
    WHERE key = ${PLATFORM_RESET_PIN_KEY}
    LIMIT 1
  `);
  const value = (rows as unknown as { rows?: Array<{ value: unknown }> }).rows?.[0]?.value;
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

async function truncateTableIfExists(executor: SqlExecutor, tableName: string): Promise<void> {
  await executor.execute(sql.raw(`TRUNCATE TABLE IF EXISTS ${tableName} RESTART IDENTITY CASCADE;`));
}

async function executePlatformHardReset(actorUserId: string | null): Promise<{ keptUsers: number; deletedUsers: number }> {
  await ensureEvolutionInfra();
  await ensureLedgerInfra();

  return db.transaction(async (tx) => {
    const protectedRows = await tx.execute(sql<{ id: string; username: string }>`
      SELECT id, LOWER(username) AS username
      FROM users
      WHERE LOWER(username) IN ('admin', 'ceo')
    `);
    const protectedUsers = (protectedRows as unknown as { rows?: Array<{ id: string; username: string }> }).rows || [];
    const adminUser = protectedUsers.find((u) => u.username === "admin");
    const ceoUser = protectedUsers.find((u) => u.username === "ceo");
    if (!adminUser || !ceoUser) {
      throw new Error("PROTECTED_USERS_MISSING");
    }

    const [{ count: beforeUserCount }] = await tx.select({ count: count() }).from(usersTable);

    for (const tableName of PLATFORM_RESET_TABLES) {
      await truncateTableIfExists(tx as unknown as SqlExecutor, tableName);
    }

    await tx.execute(sql`DELETE FROM ledger_accounts WHERE user_id IS NOT NULL`);

    await tx.execute(sql`
      DELETE FROM users
      WHERE id <> ${adminUser.id}
        AND id <> ${ceoUser.id}
    `);

    await tx.update(usersTable)
      .set({
        status: "ACTIVE",
        role: "ADMIN",
        accountNumber: 0,
        currentBoard: "F",
        kycStatus: "NONE",
        referredBy: null,
        googleId: null,
        phone: null,
        avatarUrl: null,
        activatedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, adminUser.id));

    await tx.update(usersTable)
      .set({
        status: "ACTIVE",
        role: "USER",
        accountNumber: null,
        currentBoard: null,
        kycStatus: "NONE",
        referredBy: null,
        googleId: null,
        phone: null,
        avatarUrl: null,
        activatedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, ceoUser.id));

    await tx.execute(sql`
      INSERT INTO wallets (user_id, balance_usd, balance_pending, balance_reserved, updated_at)
      VALUES
        (${adminUser.id}, '0', '0', '0', now()),
        (${ceoUser.id}, '0', '0', '0', now())
      ON CONFLICT (user_id) DO UPDATE
      SET balance_usd = '0',
          balance_pending = '0',
          balance_reserved = '0',
          updated_at = now()
    `);

    await tx.execute(sql`
      INSERT INTO internal_wallet_balances (user_id, available_balance, pending_balance, locked_balance, updated_at)
      VALUES
        (${adminUser.id}, '0', '0', '0', now()),
        (${ceoUser.id}, '0', '0', '0', now())
      ON CONFLICT (user_id) DO UPDATE
      SET available_balance = '0',
          pending_balance = '0',
          locked_balance = '0',
          updated_at = now()
    `);

    await tx.execute(sql`
      DO $$
      BEGIN
        IF to_regclass('public.investor_queue_seq') IS NOT NULL THEN
          PERFORM setval('investor_queue_seq', 2, false);
        END IF;
      END
      $$;
    `);

    await tx.execute(sql`DELETE FROM system_settings WHERE key = ${PLATFORM_RESET_PIN_KEY}`);
    await tx.execute(sql`
      INSERT INTO system_settings_audit (key, old_value, new_value, changed_by)
      VALUES (
        'platform_hard_reset',
        NULL,
        jsonb_build_object('at', now(), 'by', ${actorUserId}, 'scope', 'FULL_DB'),
        ${actorUserId}
      )
    `);

    invalidateSystemConfigCache();

    const [{ count: afterUserCount }] = await tx.select({ count: count() }).from(usersTable);
    return {
      keptUsers: Number(afterUserCount),
      deletedUsers: Number(beforeUserCount) - Number(afterUserCount),
    };
  });
}

type ConsistencyAuditRow = {
  id: string;
  username: string;
  status: "PENDING" | "ACTIVE" | "SUSPENDED";
  accountNumber: number | null;
  currentBoard: string | null;
  hasCompletedDeposit: boolean;
  hasCompletedBoardPaymentF: boolean;
  hasCompletedBoardPaymentAny: boolean;
};

async function buildEvolutionConsistencySnapshot() {
  const [activeAll] = await db.select({ c: count() }).from(usersTable).where(eq(usersTable.status, "ACTIVE"));
  const [activeNonAdmin] = await db.select({ c: count() }).from(usersTable).where(and(eq(usersTable.status, "ACTIVE"), sql`${usersTable.role} <> 'ADMIN'`));

  const numberedAllRows = await db.execute(sql<{ c: number }>`
    SELECT COUNT(*)::int AS c
    FROM users
    WHERE account_number IS NOT NULL;
  `);
  const numberedNonAdminRows = await db.execute(sql<{ c: number }>`
    SELECT COUNT(*)::int AS c
    FROM users
    WHERE role <> 'ADMIN'
      AND account_number IS NOT NULL
      AND account_number > 0;
  `);
  const numberedActiveNonAdminRows = await db.execute(sql<{ c: number }>`
    SELECT COUNT(*)::int AS c
    FROM users
    WHERE role <> 'ADMIN'
      AND status = 'ACTIVE'
      AND account_number IS NOT NULL
      AND account_number > 0;
  `);
  const usersWithCurrentBoardRows = await db.execute(sql<{ c: number }>`
    SELECT COUNT(*)::int AS c
    FROM users
    WHERE role <> 'ADMIN'
      AND current_board IS NOT NULL;
  `);
  const positionedLegacyRows = await db.execute(sql<{ c: number }>`
    SELECT COUNT(DISTINCT u.id)::int AS c
    FROM users u
    WHERE u.role <> 'ADMIN'
      AND (
        u.id IN (SELECT bp.user_id FROM board_participants bp)
        OR u.id IN (SELECT bi.ranker_id FROM board_instances bi WHERE bi.ranker_id IS NOT NULL)
      );
  `);

  const validated = await fetchValidatedAccounts();
  const validatedByBoard = BOARD_ORDER.reduce<Record<string, number>>((acc, boardId) => {
    acc[boardId] = validated.filter((u) => (u.currentBoard || "F").toUpperCase() === boardId).length;
    return acc;
  }, {});
  const validatedIdSet = new Set(validated.map((u) => u.id));

  const auditRowsRaw = await db.execute(sql<ConsistencyAuditRow>`
    SELECT
      u.id,
      u.username,
      u.status,
      u.account_number AS "accountNumber",
      u.current_board AS "currentBoard",
      EXISTS (
        SELECT 1
        FROM transactions d
        WHERE d.user_id = u.id
          AND d.type = 'DEPOSIT'
          AND d.status = 'COMPLETED'
      ) AS "hasCompletedDeposit",
      EXISTS (
        SELECT 1
        FROM transactions p
        WHERE p.user_id = u.id
          AND p.type = 'BOARD_PAYMENT'
          AND p.status = 'COMPLETED'
          AND (
            p.from_board = 'F'
            OR COALESCE(p.description, '') ILIKE '%board F%'
          )
      ) AS "hasCompletedBoardPaymentF",
      EXISTS (
        SELECT 1
        FROM transactions p2
        WHERE p2.user_id = u.id
          AND p2.type = 'BOARD_PAYMENT'
          AND p2.status = 'COMPLETED'
      ) AS "hasCompletedBoardPaymentAny"
    FROM users u
    WHERE u.role <> 'ADMIN'
      AND u.status = 'ACTIVE'
    ORDER BY COALESCE(u.account_number, 2147483647) ASC, u.created_at ASC;
  `);
  const auditRows = (auditRowsRaw as unknown as { rows?: ConsistencyAuditRow[] }).rows || [];

  const anomalies = auditRows.map((row) => {
    const reasons: string[] = [];
    if (!row.accountNumber || row.accountNumber <= 0) reasons.push("NOT_NUMBERED");
    if (!row.hasCompletedDeposit) reasons.push("MISSING_COMPLETED_DEPOSIT");
    if (!row.hasCompletedBoardPaymentAny) reasons.push("MISSING_COMPLETED_BOARD_PAYMENT");
    if (row.currentBoard && !row.hasCompletedBoardPaymentAny) reasons.push("STALE_CURRENT_BOARD");
    if (row.accountNumber && !validatedIdSet.has(row.id)) reasons.push("NOT_IN_EVOLUTION_VALIDATED_SET");
    return {
      id: row.id,
      username: row.username,
      accountNumber: row.accountNumber,
      currentBoard: row.currentBoard,
      flags: reasons,
    };
  }).filter((x) => x.flags.length > 0);

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      activeAll: Number(activeAll?.c || 0),
      activeNonAdmin: Number(activeNonAdmin?.c || 0),
      numberedAll: Number((numberedAllRows as unknown as { rows?: Array<{ c: number }> }).rows?.[0]?.c || 0),
      numberedNonAdmin: Number((numberedNonAdminRows as unknown as { rows?: Array<{ c: number }> }).rows?.[0]?.c || 0),
      numberedActiveNonAdmin: Number((numberedActiveNonAdminRows as unknown as { rows?: Array<{ c: number }> }).rows?.[0]?.c || 0),
      usersWithCurrentBoardNonAdmin: Number((usersWithCurrentBoardRows as unknown as { rows?: Array<{ c: number }> }).rows?.[0]?.c || 0),
      positionedLegacyNonAdmin: Number((positionedLegacyRows as unknown as { rows?: Array<{ c: number }> }).rows?.[0]?.c || 0),
      evolutionValidatedTotal: validated.length,
      evolutionDisplayedGraphicalTotal: validated.length,
    },
    evolutionByBoard: validatedByBoard,
    anomalies,
  };
}

router.get("/admin/evolution/overview", requireAdmin as never, async (_req: AuthRequest, res) => {
  await ensureEvolutionInfra();
  const [usersCount] = await db.select({ c: count() }).from(usersTable);
  const [activeUsersCount] = await db.select({ c: count() }).from(usersTable).where(eq(usersTable.status, "ACTIVE"));
  const [walletsCount] = await db.select({ c: count() }).from(walletsTable);
  const [boardsCount] = await db.select({ c: count() }).from(boardInstancesTable);
  const [pendingDep] = await db.select({ c: count() }).from(transactionsTable).where(and(eq(transactionsTable.type, "DEPOSIT"), eq(transactionsTable.status, "PENDING")));
  const [pendingWdr] = await db.select({ c: count() }).from(transactionsTable).where(and(eq(transactionsTable.type, "WITHDRAWAL"), or(eq(transactionsTable.status, "PENDING"), eq(transactionsTable.status, "PROCESSING"))));

  const twilioConfigured = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE);
  const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  const circleConfigured = String(process.env.CIRCLE_ENABLED || "").toLowerCase() === "true";

  res.json({
    kpi: {
      users: Number(usersCount.c),
      activeUsers: Number(activeUsersCount.c),
      wallets: Number(walletsCount.c),
      boards: Number(boardsCount.c),
      pendingDeposits: Number(pendingDep.c),
      pendingWithdrawals: Number(pendingWdr.c),
    },
    modules: [
      { code: "USER_MGMT", label: "User Management", status: "live", note: "CRUD, activation, suspension, bulk actions" },
      { code: "WALLET_ENGINE", label: "Wallet Engine", status: circleConfigured ? "live" : "partial", note: "Internal ledger + custodial crypto provider" },
      { code: "BOARD_ENGINE", label: "Board/Cycle Engine", status: "live", note: "Progression, payments, board instances" },
      { code: "NOTIFICATION_CENTER", label: "Notification Center", status: smtpConfigured ? "live" : "partial", note: `Email ${smtpConfigured ? "OK" : "missing"} · SMS ${twilioConfigured ? "OK" : "missing"}` },
      { code: "SYSTEM_CONFIG", label: "System Config", status: "live", note: "Runtime config + audit trail" },
      { code: "CONTENT_BUILDER", label: "Content & i18n", status: "partial", note: "i18n runtime in place, visual builder pending" },
      { code: "AUTOMATION", label: "Automation Engine", status: "planned", note: "BullMQ/Redis scheduling pending" },
      { code: "REALTIME", label: "Real-time Monitoring", status: "planned", note: "WebSocket/Socket.io pending" },
    ],
  });
});

router.get("/admin/evolution/config", requireAdmin as never, async (_req: AuthRequest, res) => {
  await ensureEvolutionInfra();
  const rows = await db.execute(sql`
    SELECT key, value, updated_at, updated_by
    FROM system_settings
    WHERE key <> ${PLATFORM_RESET_PIN_KEY}
      AND key NOT LIKE 'notif_%'
    ORDER BY key ASC
  `);
  const settings = (rows as unknown as { rows?: Array<{ key: string; value: unknown; updated_at: string; updated_by: string | null }> }).rows || [];
  res.json({ settings });
});

router.put("/admin/evolution/config/:key", requireAdmin as never, async (req: AuthRequest, res) => {
  await ensureEvolutionInfra();
  const key = String(req.params.key || "").trim();
  if (!EVOLUTION_ALLOWED_KEYS.has(key)) {
    res.status(400).json({ error: "Bad Request", message: "Unsupported config key" });
    return;
  }
  if (typeof req.body?.value === "undefined") {
    res.status(400).json({ error: "Bad Request", message: "value is required" });
    return;
  }
  const value = req.body.value as unknown;
  const actor = req.userId || null;

  const oldRows = await db.execute(sql`SELECT value FROM system_settings WHERE key = ${key} LIMIT 1`);
  const oldValue = ((oldRows as unknown as { rows?: Array<{ value: unknown }> }).rows || [])[0]?.value ?? null;

  await db.execute(sql`
    INSERT INTO system_settings (key, value, updated_by, updated_at)
    VALUES (${key}, ${JSON.stringify(value)}::jsonb, ${actor}, now())
    ON CONFLICT (key)
    DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now();
  `);

  if (key === "entry_fee_usd") {
    const fee = typeof value === "number" ? value : parseFloat(String(value));
    if (Number.isFinite(fee) && fee > 0) {
      await db.update(boardsTable)
        .set({
          entryFee: fee.toFixed(2),
          totalGain: (fee * 8).toFixed(2),
          nextBoardDeduction: fee.toFixed(2),
          withdrawable: (fee * 7).toFixed(2),
        })
        .where(eq(boardsTable.id, "F"));
    }
  }

  if (key === "board_financials" && value && typeof value === "object") {
    const asRecord = value as Record<string, unknown>;
    for (const [boardId, cfg] of Object.entries(asRecord)) {
      const c = cfg as Record<string, unknown>;
      const entryFee = Number.parseFloat(String(c.entryFee ?? ""));
      const totalGain = Number.parseFloat(String(c.totalGain ?? ""));
      const nextBoardDeduction = Number.parseFloat(String(c.nextBoardDeduction ?? ""));
      const withdrawable = Number.parseFloat(String(c.withdrawable ?? ""));
      if (!Number.isFinite(entryFee) || !Number.isFinite(totalGain) || !Number.isFinite(nextBoardDeduction) || !Number.isFinite(withdrawable)) {
        continue;
      }
      await db.update(boardsTable)
        .set({
          entryFee: entryFee.toFixed(2),
          totalGain: totalGain.toFixed(2),
          nextBoardDeduction: nextBoardDeduction.toFixed(2),
          withdrawable: withdrawable.toFixed(2),
        })
        .where(eq(boardsTable.id, boardId.toUpperCase()));
    }
  }

  await db.execute(sql`
    INSERT INTO system_settings_audit (key, old_value, new_value, changed_by)
    VALUES (${key}, ${JSON.stringify(oldValue)}::jsonb, ${JSON.stringify(value)}::jsonb, ${actor});
  `);
  invalidateSystemConfigCache();
  res.json({ message: "Config updated", key, value });
});

router.get("/admin/evolution/audit", requireAdmin as never, async (req: AuthRequest, res) => {
  await ensureEvolutionInfra();
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || "50"), 10) || 50));
  const rows = await db.execute(sql`
    SELECT a.id, a.key, a.old_value, a.new_value, a.changed_by, a.created_at, u.username AS actor_username
    FROM system_settings_audit a
    LEFT JOIN users u ON u.id = a.changed_by
    WHERE a.key <> ${PLATFORM_RESET_PIN_KEY}
      AND a.key NOT LIKE 'notif_%'
    ORDER BY a.created_at DESC
    LIMIT ${limit}
  `);
  const audit = (rows as unknown as { rows?: unknown[] }).rows || [];
  res.json({ audit });
});

router.get("/admin/evolution/board-path/:accountNumber", requireAdmin as never, async (req: AuthRequest, res) => {
  const accountNumber = parseInt(String(req.params.accountNumber || "0"), 10);
  if (!Number.isFinite(accountNumber) || accountNumber <= 0) {
    res.status(400).json({ error: "Bad Request", message: "Invalid account number" });
    return;
  }
  const tree = computeStrategicTree(accountNumber);
  res.json({
    accountNumber,
    strategy: tree,
    notes: {
      starterPairBranch: ["n4", "n5"],
      challengerPairBranch: ["n6", "n7"],
      upperBranch: ["n8", "n9", "n10", "n11"],
    },
  });
});

router.post("/admin/evolution/queue/sync", requireAdmin as never, async (_req: AuthRequest, res) => {
  const assigned = await backfillValidatedQueueNumbers();
  const validated = await fetchValidatedAccounts();
  res.json({
    message: "Queue synchronization completed",
    assigned,
    totalValidated: validated.length,
    preview: validated.slice(0, 20).map((u) => ({
      id: u.id,
      username: u.username,
      accountNumber: u.accountNumber,
      currentBoard: u.currentBoard,
    })),
  });
});

router.get("/admin/evolution/consistency", requireAdmin as never, async (_req: AuthRequest, res) => {
  const snapshot = await buildEvolutionConsistencySnapshot();
  res.json(snapshot);
});

router.post("/admin/evolution/consistency/repair", requireAdmin as never, async (_req: AuthRequest, res) => {
  const before = await buildEvolutionConsistencySnapshot();
  const assigned = await backfillValidatedQueueNumbers();

  const normalizedBoardRows = await db.execute(sql<{ id: string }>`
    UPDATE users u
    SET current_board = 'F'
    WHERE u.role <> 'ADMIN'
      AND u.account_number IS NOT NULL
      AND u.account_number > 0
      AND u.current_board IS NULL
    RETURNING u.id;
  `);
  const normalizedBoards = ((normalizedBoardRows as unknown as { rows?: Array<{ id: string }> }).rows || []).length;

  const clearedStaleRows = await db.execute(sql<{ id: string }>`
    UPDATE users u
    SET current_board = NULL
    WHERE u.role <> 'ADMIN'
      AND u.account_number IS NULL
      AND u.current_board IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM transactions p
        WHERE p.user_id = u.id
          AND p.type = 'BOARD_PAYMENT'
          AND p.status = 'COMPLETED'
      )
    RETURNING u.id;
  `);
  const clearedStaleBoards = ((clearedStaleRows as unknown as { rows?: Array<{ id: string }> }).rows || []).length;

  const promoted = await evaluateBoardProgressions(db as never);
  const after = await buildEvolutionConsistencySnapshot();

  res.json({
    message: "Automatic consistency repair completed",
    actions: {
      assignedQueueNumbers: assigned,
      normalizedBoards,
      clearedStaleBoards,
      promotedUsers: promoted,
    },
    before,
    after,
  });
});

router.get("/admin/evolution/board-flow", requireAdmin as never, async (req: AuthRequest, res) => {
  const boardId = String(req.query.boardId || "F").toUpperCase();
  const limit = Math.min(20, Math.max(1, parseInt(String(req.query.limit || "8"), 10) || 8));

  const validated = await fetchValidatedAccounts();
  const roots = validated
    .filter((u) => (u.currentBoard || "F").toUpperCase() === boardId)
    .sort((a, b) => a.accountNumber - b.accountNumber)
    .slice(0, limit);

  const byNumber = new Map(validated.map((u) => [u.accountNumber, u]));

  const mapped = roots.map((root) => {
    const numbers = computeStrategicLeafNumbers(root.accountNumber);
    const slots = [
      { slot: "N6*2+1", stage: "STARTER", strategicNumber: numbers.n8 },
      { slot: "N6*2", stage: "STARTER", strategicNumber: numbers.n9 },
      { slot: "N7*2+1", stage: "STARTER", strategicNumber: numbers.n10 },
      { slot: "N7*2", stage: "STARTER", strategicNumber: numbers.n11 },
      { slot: "N6", stage: "CHALLENGER", strategicNumber: numbers.n6 },
      { slot: "N7", stage: "CHALLENGER", strategicNumber: numbers.n7 },
      { slot: "N2", stage: "LEADER", strategicNumber: numbers.n2 },
      { slot: "N1", stage: "RANKER", strategicNumber: numbers.n1 },
      { slot: "N3", stage: "LEADER", strategicNumber: numbers.n3 },
      { slot: "N4", stage: "CHALLENGER", strategicNumber: numbers.n4 },
      { slot: "N5", stage: "CHALLENGER", strategicNumber: numbers.n5 },
      { slot: "N4*2", stage: "STARTER", strategicNumber: numbers.n4_2 },
      { slot: "N4*2+1", stage: "STARTER", strategicNumber: numbers.n4_2p1 },
      { slot: "N5*2", stage: "STARTER", strategicNumber: numbers.n5_2 },
      { slot: "N5*2+1", stage: "STARTER", strategicNumber: numbers.n5_2p1 },
    ];

    const nodes = slots.map((slot) => {
      const user = byNumber.get(slot.strategicNumber);
      return {
        ...slot,
        role: slot.stage,
        level: boardId,
        user: user ? {
          id: user.id,
          username: user.username,
          accountNumber: user.accountNumber,
          currentBoard: user.currentBoard,
          status: user.status,
          stage: slot.stage,
        } : null,
      };
    });

    const starterSlotsFilled = nodes.filter((n) => n.stage === "STARTER" && n.user).length;
    const coreSlotsFilled = nodes.filter((n) => n.stage !== "STARTER" && n.slot !== "N1" && n.user).length;
    const totalSlotsFilled = starterSlotsFilled + coreSlotsFilled;
    return {
      id: `virtual-${boardId}-${root.accountNumber}`,
      boardId,
      instanceNumber: root.accountNumber,
      status: "ACTIVE",
      slotsFilled: totalSlotsFilled,
      starterSlotsFilled,
      coreSlotsFilled,
      totalSlotsFilled,
      createdAt: root.activatedAt || root.createdAt,
      completedAt: null,
      rootNumber: root.accountNumber,
      nodes,
    };
  });

  res.json({ boardId, instances: mapped });
});

router.get("/admin/platform-reset/status", requireAdmin as never, async (_req: AuthRequest, res) => {
  await ensureEvolutionInfra();
  const rows = await db.execute(sql`
    SELECT updated_at
    FROM system_settings
    WHERE key = ${PLATFORM_RESET_PIN_KEY}
    LIMIT 1
  `);
  const row = (rows as unknown as { rows?: Array<{ updated_at?: string | Date }> }).rows?.[0];
  res.json({
    hasPin: Boolean(row),
    pinConfiguredAt: row?.updated_at || null,
  });
});

router.get("/admin/notif-link/config", requireAdmin as never, async (_req: AuthRequest, res) => {
  await ensureEvolutionInfra();
  const rows = await db.execute(sql`
    SELECT key, value, updated_at
    FROM system_settings
    WHERE key LIKE 'notif_%'
    ORDER BY key ASC
  `);
  const raw = (rows as unknown as { rows?: Array<{ key: string; value: unknown; updated_at: string }> }).rows || [];
  const byKey = new Map(raw.map((row) => [row.key, row]));

  const domains = Object.entries(NOTIF_LINK_DOMAIN_TO_KEY).reduce<Record<string, { key: string; value: unknown; updatedAt: string | null }>>((acc, [domain, key]) => {
    const row = byKey.get(key);
    acc[domain] = {
      key,
      value: row?.value ?? NOTIF_LINK_DEFAULTS[key],
      updatedAt: row?.updated_at ?? null,
    };
    return acc;
  }, {});

  res.json({ domains });
});

router.put("/admin/notif-link/config/:domain", requireAdmin as never, async (req: AuthRequest, res) => {
  await ensureEvolutionInfra();
  const domain = String(req.params.domain || "").trim() as keyof typeof NOTIF_LINK_DOMAIN_TO_KEY;
  const settingKey = NOTIF_LINK_DOMAIN_TO_KEY[domain];
  if (!settingKey) {
    res.status(400).json({ error: "Bad Request", message: "Unsupported notification/link domain" });
    return;
  }
  const value = req.body?.value;
  if (!value || typeof value !== "object") {
    res.status(400).json({ error: "Bad Request", message: "value object is required" });
    return;
  }

  const cfg = value as Record<string, unknown>;
  if (settingKey === "notif_sms_otp") {
    const body = String(cfg.body || "").trim();
    if (!body) {
      res.status(400).json({ error: "Bad Request", message: "sms_otp.body is required" });
      return;
    }
  }
  if (settingKey === "notif_email_otp" || settingKey === "notif_email_verification" || settingKey === "notif_email_notification") {
    const subject = String(cfg.subject || "").trim();
    const bodyHtml = String(cfg.bodyHtml || "").trim();
    if (!subject || !bodyHtml) {
      res.status(400).json({ error: "Bad Request", message: "subject and bodyHtml are required" });
      return;
    }
  }
  if (settingKey === "notif_referral_link") {
    const baseUrl = String(cfg.baseUrl || "").trim();
    const registerPath = String(cfg.registerPath || "").trim();
    const queryParam = String(cfg.queryParam || "").trim();
    const whatsappTemplate = String(cfg.whatsappTemplate || "").trim();
    const telegramTemplate = String(cfg.telegramTemplate || "").trim();
    const genericTemplate = String(cfg.genericTemplate || "").trim();
    if (!baseUrl || !registerPath || !queryParam || !whatsappTemplate || !telegramTemplate || !genericTemplate) {
      res.status(400).json({
        error: "Bad Request",
        message: "baseUrl, registerPath, queryParam, whatsappTemplate, telegramTemplate and genericTemplate are required",
      });
      return;
    }
  }

  const oldRows = await db.execute(sql`SELECT value FROM system_settings WHERE key = ${settingKey} LIMIT 1`);
  const oldValue = ((oldRows as unknown as { rows?: Array<{ value: unknown }> }).rows || [])[0]?.value ?? null;

  await db.execute(sql`
    INSERT INTO system_settings (key, value, updated_by, updated_at)
    VALUES (${settingKey}, ${JSON.stringify(value)}::jsonb, ${req.userId || null}, now())
    ON CONFLICT (key)
    DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
  `);
  await db.execute(sql`
    INSERT INTO system_settings_audit (key, old_value, new_value, changed_by)
    VALUES (${settingKey}, ${JSON.stringify(oldValue)}::jsonb, ${JSON.stringify(value)}::jsonb, ${req.userId || null})
  `);
  invalidateSystemConfigCache();

  res.json({ message: "Notif/Link config updated", domain, key: settingKey, value });
});

router.post("/admin/notif-link/defaults", requireAdmin as never, async (req: AuthRequest, res) => {
  await ensureEvolutionInfra();
  for (const settingKey of NOTIF_LINK_SETTING_KEYS) {
    const defaultValue = NOTIF_LINK_DEFAULTS[settingKey];
    const oldRows = await db.execute(sql`SELECT value FROM system_settings WHERE key = ${settingKey} LIMIT 1`);
    const oldValue = ((oldRows as unknown as { rows?: Array<{ value: unknown }> }).rows || [])[0]?.value ?? null;

    await db.execute(sql`
      INSERT INTO system_settings (key, value, updated_by, updated_at)
      VALUES (${settingKey}, ${JSON.stringify(defaultValue)}::jsonb, ${req.userId || null}, now())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
    `);
    await db.execute(sql`
      INSERT INTO system_settings_audit (key, old_value, new_value, changed_by)
      VALUES (${settingKey}, ${JSON.stringify(oldValue)}::jsonb, ${JSON.stringify(defaultValue)}::jsonb, ${req.userId || null})
    `);
  }
  invalidateSystemConfigCache();
  res.json({ message: "Exemplary default values applied", domains: Object.keys(NOTIF_LINK_DOMAIN_TO_KEY) });
});

router.post("/admin/platform-reset/pin", requireAdmin as never, async (req: AuthRequest, res) => {
  await ensureEvolutionInfra();
  const pin = String(req.body?.pin || "").trim();
  const confirmPin = String(req.body?.confirmPin || "").trim();
  const currentPin = String(req.body?.currentPin || "").trim();

  if (!/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: "Bad Request", message: "PIN must contain exactly 4 digits" });
    return;
  }
  if (confirmPin && confirmPin !== pin) {
    res.status(400).json({ error: "Bad Request", message: "PIN confirmation does not match" });
    return;
  }

  const existingHash = await readPlatformResetPinHash(db);
  if (existingHash) {
    if (!/^\d{4}$/.test(currentPin)) {
      res.status(400).json({ error: "Bad Request", message: "Current PIN is required to update the reset PIN" });
      return;
    }
    const ok = await bcrypt.compare(currentPin, existingHash);
    if (!ok) {
      res.status(403).json({ error: "Forbidden", message: "Current PIN is invalid" });
      return;
    }
  }

  const pinHash = await bcrypt.hash(pin, 12);
  await db.execute(sql`
    INSERT INTO system_settings (key, value, updated_by, updated_at)
    VALUES (${PLATFORM_RESET_PIN_KEY}, ${JSON.stringify(pinHash)}::jsonb, ${req.userId || null}, now())
    ON CONFLICT (key)
    DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
  `);
  invalidateSystemConfigCache();

  res.json({
    message: existingHash ? "Reset PIN updated successfully" : "Reset PIN configured successfully",
    hasPin: true,
  });
});

router.post("/admin/platform-reset/execute", requireAdmin as never, async (req: AuthRequest, res) => {
  await ensureEvolutionInfra();
  const pin = String(req.body?.pin || "").trim();
  if (!/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: "Bad Request", message: "PIN must contain exactly 4 digits" });
    return;
  }

  const hash = await readPlatformResetPinHash(db);
  if (!hash) {
    res.status(409).json({ error: "Conflict", message: "Reset PIN is not configured. Configure it first." });
    return;
  }

  const ok = await bcrypt.compare(pin, hash);
  if (!ok) {
    res.status(403).json({ error: "Forbidden", message: "Invalid reset PIN" });
    return;
  }

  try {
    const result = await executePlatformHardReset(req.userId || null);
    res.json({
      message: "Platform reset completed",
      keptUsers: result.keptUsers,
      deletedUsers: result.deletedUsers,
      pinResetRequired: true,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "RESET_FAILED";
    if (msg === "PROTECTED_USERS_MISSING") {
      res.status(409).json({
        error: "Conflict",
        message: "Protected users admin/ceo are required before running a full reset",
      });
      return;
    }
    throw error;
  }
});

function isProtectedSystemUser(user: { username: string }): boolean {
  const uname = user.username.toLowerCase();
  return uname === "admin" || uname === "ceo";
}

function generateReferralCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "ECF";
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function hardDeleteUserData(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const doomedAccounts = await tx.select({ id: ledgerAccountsTable.id })
      .from(ledgerAccountsTable)
      .where(eq(ledgerAccountsTable.userId, userId));
    const doomedAccountIds = doomedAccounts.map((a) => a.id);

    const doomedTx = await tx.select({ id: transactionsTable.id })
      .from(transactionsTable)
      .where(eq(transactionsTable.userId, userId));
    const doomedTxIds = doomedTx.map((t) => t.id);

    if (doomedTxIds.length) {
      await tx.delete(paymentEventsTable).where(inArray(paymentEventsTable.transactionId, doomedTxIds));
    }
    await tx.update(transactionsTable).set({ toUserId: null }).where(eq(transactionsTable.toUserId, userId));

    if (doomedTxIds.length) {
      await tx.delete(ledgerEntriesTable).where(or(
        inArray(ledgerEntriesTable.transactionId, doomedTxIds),
        doomedAccountIds.length
          ? or(
              inArray(ledgerEntriesTable.debitAccountId, doomedAccountIds),
              inArray(ledgerEntriesTable.creditAccountId, doomedAccountIds),
            )
          : sql`false`,
      ));
      await tx.delete(withdrawalsTable).where(inArray(withdrawalsTable.transactionId, doomedTxIds));
      await tx.delete(transactionsTable).where(inArray(transactionsTable.id, doomedTxIds));
    } else if (doomedAccountIds.length) {
      await tx.delete(ledgerEntriesTable).where(or(
        inArray(ledgerEntriesTable.debitAccountId, doomedAccountIds),
        inArray(ledgerEntriesTable.creditAccountId, doomedAccountIds),
      ));
    }

    await tx.delete(walletAuditLogsTable).where(eq(walletAuditLogsTable.userId, userId));
    await tx.delete(depositsTable).where(eq(depositsTable.userId, userId));
    await tx.delete(withdrawalsTable).where(eq(withdrawalsTable.userId, userId));
    await tx.delete(internalWalletBalancesTable).where(eq(internalWalletBalancesTable.userId, userId));
    await tx.delete(userWalletsTable).where(eq(userWalletsTable.userId, userId));

    await tx.update(boardInstancesTable).set({ rankerId: null }).where(eq(boardInstancesTable.rankerId, userId));
    await tx.delete(boardParticipantsTable).where(eq(boardParticipantsTable.userId, userId));
    await tx.delete(notificationsTable).where(eq(notificationsTable.userId, userId));
    await tx.delete(otpCodesTable).where(eq(otpCodesTable.userId, userId));
    await tx.delete(bonusesTable).where(eq(bonusesTable.userId, userId));
    await tx.delete(referralsTable).where(or(
      eq(referralsTable.referrerId, userId),
      eq(referralsTable.referredId, userId),
    ));
    await tx.delete(walletsTable).where(eq(walletsTable.userId, userId));
    await tx.delete(ledgerAccountsTable).where(eq(ledgerAccountsTable.userId, userId));
    await tx.delete(usersTable).where(eq(usersTable.id, userId));
  });
}

router.post("/admin/users/bulk-action", requireAdmin as never, async (req: AuthRequest, res) => {
  const { action, userIds, search, status } = req.body as {
    action?: "activate" | "suspend" | "delete";
    userIds?: string[] | "all";
    search?: string;
    status?: "PENDING" | "ACTIVE" | "SUSPENDED";
  };

  if (!action || !["activate", "suspend", "delete"].includes(action)) {
    res.status(400).json({ error: "Bad Request", message: "Invalid bulk action" });
    return;
  }

  let targets: { id: string; username: string }[] = [];
  if (userIds === "all") {
    const conditions = [];
    if (search) conditions.push(or(ilike(usersTable.username, `%${search}%`), ilike(usersTable.email, `%${search}%`)));
    if (status) conditions.push(eq(usersTable.status, status));
    targets = await db.select({ id: usersTable.id, username: usersTable.username })
      .from(usersTable)
      .where(conditions.length ? and(...conditions) : undefined);
  } else {
    const ids = (userIds || []).filter((id) => isValidId(String(id)));
    if (!ids.length) {
      res.status(400).json({ error: "Bad Request", message: "No valid users selected" });
      return;
    }
    targets = await db.select({ id: usersTable.id, username: usersTable.username })
      .from(usersTable)
      .where(inArray(usersTable.id, ids));
  }

  const actionable = targets.filter((u) => !isProtectedSystemUser(u));
  if (!actionable.length) {
    res.json({ message: "No actionable users found", affected: 0 });
    return;
  }

  if (action === "activate") {
    await db.update(usersTable)
      .set({ status: "ACTIVE", activatedAt: new Date() })
      .where(inArray(usersTable.id, actionable.map((u) => u.id)));
    res.json({ message: "Users activated", affected: actionable.length });
    return;
  }

  if (action === "suspend") {
    await db.update(usersTable)
      .set({ status: "SUSPENDED" })
      .where(inArray(usersTable.id, actionable.map((u) => u.id)));
    res.json({ message: "Users suspended", affected: actionable.length });
    return;
  }

  for (const user of actionable) {
    await hardDeleteUserData(user.id);
  }
  res.json({ message: "Users deleted", affected: actionable.length });
});

router.get("/admin/stats", requireAdmin as never, async (req: AuthRequest, res) => {
  const now = new Date();
  const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [totalUsers] = await db.select({ count: count() }).from(usersTable);
  const [activeUsers] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.status, "ACTIVE"));
  const [pendingUsers] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.status, "PENDING"));
  const [activeBoards] = await db.select({ count: count() }).from(boardInstancesTable).where(eq(boardInstancesTable.status, "ACTIVE"));
  const [pendingDeposits] = await db.select({ count: count() }).from(transactionsTable)
    .where(and(eq(transactionsTable.type, "DEPOSIT"), eq(transactionsTable.status, "PENDING")));
  const [pendingWithdrawals] = await db.select({ count: count() }).from(transactionsTable)
    .where(and(
      eq(transactionsTable.type, "WITHDRAWAL"),
      or(eq(transactionsTable.status, "PENDING"), eq(transactionsTable.status, "PROCESSING")),
    ));

  const platformRevenue = await db.select({ amount: transactionsTable.amountUsd })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.type, "SYSTEM_FEE"), eq(transactionsTable.status, "COMPLETED")));

  const totalRevenue = platformRevenue.reduce((sum, r) => sum + parseFloat(r.amount), 0);

  const volume24hRows = await db.select({ amount: transactionsTable.amountUsd })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.status, "COMPLETED"),
      gte(transactionsTable.createdAt, ago24h),
      or(eq(transactionsTable.type, "DEPOSIT"), eq(transactionsTable.type, "WITHDRAWAL"), eq(transactionsTable.type, "BOARD_PAYMENT"))
    ));

  const volume7dRows = await db.select({ amount: transactionsTable.amountUsd })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.status, "COMPLETED"),
      gte(transactionsTable.createdAt, ago7d),
      or(eq(transactionsTable.type, "DEPOSIT"), eq(transactionsTable.type, "WITHDRAWAL"), eq(transactionsTable.type, "BOARD_PAYMENT"))
    ));

  const totalVolume24h = volume24hRows.reduce((s, r) => s + parseFloat(r.amount), 0);
  const totalVolume7d = volume7dRows.reduce((s, r) => s + parseFloat(r.amount), 0);

  res.json({
    totalUsers: Number(totalUsers.count),
    activeUsers: Number(activeUsers.count),
    pendingUsers: Number(pendingUsers.count),
    totalVolume24h: parseFloat(totalVolume24h.toFixed(2)),
    totalVolume7d: parseFloat(totalVolume7d.toFixed(2)),
    activeBoards: Number(activeBoards.count),
    pendingDeposits: Number(pendingDeposits.count),
    pendingWithdrawals: Number(pendingWithdrawals.count),
    totalPlatformRevenue: parseFloat(totalRevenue.toFixed(2)),
  });
});

router.get("/admin/users", requireAdmin as never, async (req: AuthRequest, res) => {
  const { page = "1", limit = "20", search, status } = req.query as Record<string, string>;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];
  if (search) conditions.push(or(ilike(usersTable.username, `%${search}%`), ilike(usersTable.email, `%${search}%`)));
  if (status) conditions.push(eq(usersTable.status, status as "PENDING" | "ACTIVE" | "SUSPENDED"));

  const [totalResult] = await db.select({ count: count() })
    .from(usersTable)
    .where(conditions.length ? and(...conditions) : undefined);

  const users = await db.select({
    id: usersTable.id,
    accountNumber: usersTable.accountNumber,
    username: usersTable.username,
    email: usersTable.email,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
    status: usersTable.status,
    role: usersTable.role,
    currentBoard: usersTable.currentBoard,
    createdAt: usersTable.createdAt,
  })
  .from(usersTable)
  .where(conditions.length ? and(...conditions) : undefined)
  .orderBy(desc(usersTable.createdAt))
  .limit(limitNum)
  .offset(offset);

  const usersWithWallets = await Promise.all(users.map(async u => {
    const wallets = await db.select({ balance: walletsTable.balanceUsd })
      .from(walletsTable)
      .where(eq(walletsTable.userId, u.id))
      .limit(1);
    return {
      ...u,
      walletBalance: wallets.length ? parseFloat(wallets[0].balance) : 0,
    };
  }));

  res.json({
    users: usersWithWallets,
    total: Number(totalResult.count),
    page: pageNum,
    totalPages: Math.ceil(Number(totalResult.count) / limitNum),
  });
});

router.post("/admin/users/create", requireAdmin as never, async (req: AuthRequest, res) => {
  await ensureLedgerInfra();
  const {
    username,
    email,
    firstName,
    lastName,
    password,
    phone,
    referralCode,
    initialBalance,
  } = req.body as {
    username?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    password?: string;
    phone?: string;
    referralCode?: string;
    initialBalance?: number | string;
  };

  const usernameValue = String(username || "").trim();
  const emailValue = String(email || "").trim().toLowerCase();
  const firstNameValue = String(firstName || "").trim();
  const lastNameValue = String(lastName || "").trim();
  const passwordValue = String(password || "");

  if (!usernameValue || !emailValue || !firstNameValue || !lastNameValue || !passwordValue) {
    res.status(400).json({ error: "Bad Request", message: "username, email, firstName, lastName and password are required" });
    return;
  }
  if (passwordValue.length < 8) {
    res.status(400).json({ error: "Bad Request", message: "Password must contain at least 8 characters" });
    return;
  }

  const existing = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(or(
      eq(usersTable.username, usernameValue),
      eq(usersTable.email, emailValue),
    ))
    .limit(1);
  if (existing.length) {
    res.status(409).json({ error: "Conflict", message: "Username or email already exists" });
    return;
  }

  let referrerId: string | null = null;
  if (referralCode) {
    const ref = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.referralCode, String(referralCode).trim().toUpperCase()))
      .limit(1);
    if (!ref.length) {
      res.status(400).json({ error: "Bad Request", message: "Invalid referral code" });
      return;
    }
    referrerId = ref[0].id;
  }

  const initialBalanceNum = Number.parseFloat(String(initialBalance ?? 0));
  const seedBalance = Number.isFinite(initialBalanceNum) && initialBalanceNum > 0 ? initialBalanceNum : 0;
  const passwordHash = await bcrypt.hash(passwordValue, 12);

  const created = await db.transaction(async (tx) => {
    let uniqueCode = generateReferralCode();
    while (true) {
      const exists = await tx.select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.referralCode, uniqueCode))
        .limit(1);
      if (!exists.length) break;
      uniqueCode = generateReferralCode();
    }

    const [user] = await tx.insert(usersTable).values({
      firstName: firstNameValue,
      lastName: lastNameValue,
      username: usernameValue,
      email: emailValue,
      passwordHash,
      phone: phone ? String(phone).trim() : null,
      referralCode: uniqueCode,
      referredBy: referrerId,
      role: "USER",
      status: "ACTIVE",
      currentBoard: "F",
      activatedAt: new Date(),
      preferredLanguage: "fr",
    }).returning({
      id: usersTable.id,
      username: usersTable.username,
      email: usersTable.email,
      referralCode: usersTable.referralCode,
    });

    await ensureWalletAndLedgerAccounts(tx, user.id, "USD");

    if (seedBalance > 0) {
      const [seedTx] = await tx.insert(transactionsTable).values({
        userId: user.id,
        type: "SYSTEM_FEE",
        amount: seedBalance.toFixed(2),
        currency: "USD",
        amountUsd: seedBalance.toFixed(2),
        status: "COMPLETED",
        paymentMethod: "SYSTEM",
        adminNote: "Admin initial recharge",
        description: "Admin initial recharge",
      }).returning({ id: transactionsTable.id });

      await adjustAvailableWithTreasury(tx, {
        userId: user.id,
        deltaUsd: seedBalance,
        transactionId: seedTx.id,
        currency: "USD",
        idempotencyKey: `admin:create-user:seed:${seedTx.id}`,
        description: "Admin initial recharge",
        metadata: {
          source: "ADMIN_CREATE_USER",
          adminId: req.userId || null,
        },
      });
    }

    if (referrerId) {
      await tx.insert(referralsTable).values({
        referrerId,
        referredId: user.id,
        bonusPaid: false,
      }).onConflictDoNothing();
    }

    await tx.insert(notificationsTable).values({
      userId: user.id,
      type: "ACCOUNT_ACTIVATED",
      title: "Compte créé par l'administration",
      message: "Votre compte est actif. Connectez-vous pour commencer.",
      category: "system",
      actionUrl: "/auth/login",
      read: false,
    });

    return user;
  });

  res.status(201).json({
    message: "User created successfully",
    user: created,
    initialBalance: seedBalance,
  });
});

router.get("/admin/users/:id", requireAdmin as never, async (req: AuthRequest, res) => {
  const id = String(req.params.id);
  if (!isValidId(id)) { res.status(400).json({ error: "Bad Request", message: "Invalid ID" }); return; }

  const userList = await db.select({
    id: usersTable.id,
    username: usersTable.username,
    email: usersTable.email,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
    phone: usersTable.phone,
    status: usersTable.status,
    role: usersTable.role,
    referralCode: usersTable.referralCode,
    currentBoard: usersTable.currentBoard,
    createdAt: usersTable.createdAt,
  }).from(usersTable).where(eq(usersTable.id, id)).limit(1);

  if (!userList.length) {
    res.status(404).json({ error: "Not Found", message: "User not found" });
    return;
  }
  const user = userList[0];

  const wallets = await db.select({ balance: walletsTable.balanceUsd }).from(walletsTable).where(eq(walletsTable.userId, id)).limit(1);

  const [refCount] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.referredBy, id));

  const recentTxs = await db.select({
    id: transactionsTable.id,
    type: transactionsTable.type,
    amount: transactionsTable.amount,
    currency: transactionsTable.currency,
    status: transactionsTable.status,
    createdAt: transactionsTable.createdAt,
  }).from(transactionsTable).where(eq(transactionsTable.userId, id)).orderBy(desc(transactionsTable.createdAt)).limit(10);

  const boardParticipations = await db.select({
    boardId: boardInstancesTable.boardId,
    instanceNumber: boardInstancesTable.instanceNumber,
    position: boardParticipantsTable.position,
    joinedAt: boardParticipantsTable.createdAt,
  }).from(boardParticipantsTable)
    .innerJoin(boardInstancesTable, eq(boardParticipantsTable.boardInstanceId, boardInstancesTable.id))
    .where(eq(boardParticipantsTable.userId, id))
    .orderBy(desc(boardParticipantsTable.createdAt))
    .limit(10);

  res.json({
    ...user,
    walletBalance: wallets.length ? parseFloat(wallets[0].balance) : 0,
    totalReferrals: Number(refCount.count),
    recentTransactions: recentTxs.map(t => ({
      ...t,
      amount: parseFloat(t.amount),
    })),
    boardParticipations: boardParticipations.map(b => ({
      boardId: b.boardId,
      instanceNumber: b.instanceNumber,
      position: b.position ? String(b.position) : "unknown",
      joinedAt: b.joinedAt,
    })),
  });
});

router.put("/admin/users/:id/suspend", requireAdmin as never, async (req: AuthRequest, res) => {
  const id = String(req.params.id);
  await db.update(usersTable).set({ status: "SUSPENDED" }).where(eq(usersTable.id, id));

  await db.insert(notificationsTable).values({
    userId: id,
    type: "ACCOUNT_SUSPENDED",
    title: "Compte suspendu",
    message: "Votre compte a été suspendu par l'administration. Contactez le support.",
    category: "security",
    read: false,
  });

  res.json({ message: "User suspended" });
});

router.put("/admin/users/:id/activate", requireAdmin as never, async (req: AuthRequest, res) => {
  const id = String(req.params.id);
  await db.update(usersTable).set({ status: "ACTIVE", activatedAt: new Date() }).where(eq(usersTable.id, id));

  await db.insert(notificationsTable).values({
    userId: id,
    type: "ACCOUNT_ACTIVATED",
    title: "Compte activé !",
    message: "Votre compte a été activé avec succès. Vous pouvez maintenant rejoindre les boards.",
    category: "system",
    actionUrl: "/dashboard",
    read: false,
  });

  res.json({ message: "User activated" });
});

router.delete("/admin/users/:id", requireAdmin as never, async (req: AuthRequest, res) => {
  const id = String(req.params.id);
  if (!isValidId(id)) {
    res.status(400).json({ error: "Bad Request", message: "Invalid ID" });
    return;
  }

  const target = await db.select({ id: usersTable.id, username: usersTable.username })
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);

  if (!target.length) {
    res.status(404).json({ error: "Not Found", message: "User not found" });
    return;
  }
  if (isProtectedSystemUser(target[0])) {
    res.status(403).json({ error: "Forbidden", message: "Cannot delete protected system user" });
    return;
  }

  await hardDeleteUserData(id);
  res.json({ message: "User deleted" });
});

router.get("/admin/kyc/pending", requireAdmin as never, async (req: AuthRequest, res) => {
  const users = await db.select({
    id: usersTable.id,
    username: usersTable.username,
    email: usersTable.email,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
    createdAt: usersTable.createdAt,
  })
    .from(usersTable)
    .where(eq(usersTable.kycStatus, "PENDING"))
    .orderBy(desc(usersTable.updatedAt));

  res.json({
    users,
    total: users.length,
  });
});

router.put("/admin/users/:id/kyc/approve", requireAdmin as never, async (req: AuthRequest, res) => {
  const id = String(req.params.id);
  if (!isValidId(id)) { res.status(400).json({ error: "Bad Request", message: "Invalid ID" }); return; }

  const [user] = await db.update(usersTable)
    .set({ kycStatus: "APPROVED", updatedAt: new Date() })
    .where(eq(usersTable.id, id))
    .returning({ id: usersTable.id });

  if (!user) {
    res.status(404).json({ error: "Not Found", message: "User not found" });
    return;
  }

  await db.insert(notificationsTable).values({
    userId: id,
    type: "KYC_APPROVED",
    title: "KYC approuvé",
    message: "Votre vérification KYC est approuvée. Les retraits sont maintenant activés.",
    category: "security",
    actionUrl: "/wallet",
    read: false,
  });

  res.json({ message: "KYC approved" });
});

router.put("/admin/users/:id/kyc/reject", requireAdmin as never, async (req: AuthRequest, res) => {
  const id = String(req.params.id);
  const { reason } = req.body as { reason?: string };
  if (!isValidId(id)) { res.status(400).json({ error: "Bad Request", message: "Invalid ID" }); return; }
  if (!reason) {
    res.status(400).json({ error: "Bad Request", message: "Reason is required" });
    return;
  }

  const [user] = await db.update(usersTable)
    .set({ kycStatus: "REJECTED", updatedAt: new Date() })
    .where(eq(usersTable.id, id))
    .returning({ id: usersTable.id });

  if (!user) {
    res.status(404).json({ error: "Not Found", message: "User not found" });
    return;
  }

  await db.insert(notificationsTable).values({
    userId: id,
    type: "KYC_REJECTED",
    title: "KYC rejeté",
    message: `Votre vérification KYC a été rejetée. Raison: ${String(reason)}`,
    category: "security",
    actionUrl: "/profile",
    read: false,
  });

  res.json({ message: "KYC rejected" });
});

router.post("/admin/users/:id/adjust-balance", requireAdmin as never, async (req: AuthRequest, res) => {
  await ensureLedgerInfra();
  const id = String(req.params.id);
  const { amount, note } = req.body;
  if (!amount || !note) {
    res.status(400).json({ error: "Bad Request", message: "Amount and note required" });
    return;
  }
  const delta = parseFloat(amount);
  if (!Number.isFinite(delta) || delta === 0) {
    res.status(400).json({ error: "Bad Request", message: "Amount must be a non-zero number" });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      const [adjustTx] = await tx.insert(transactionsTable).values({
        userId: id,
        type: "SYSTEM_FEE",
        amount: Math.abs(delta).toFixed(2),
        currency: "USD",
        amountUsd: Math.abs(delta).toFixed(2),
        status: "COMPLETED",
        paymentMethod: "SYSTEM",
        adminNote: String(note),
        description: `${delta > 0 ? "Admin credit" : "Admin debit"}: ${String(note)}`,
      }).returning({
        id: transactionsTable.id,
      });

      await adjustAvailableWithTreasury(tx, {
        userId: id,
        deltaUsd: delta,
        transactionId: adjustTx.id,
        currency: "USD",
        idempotencyKey: `admin:adjust:${adjustTx.id}`,
        description: `${delta > 0 ? "Admin credit" : "Admin debit"}: ${String(note)}`,
        metadata: {
          adminId: req.userId || null,
          note: String(note),
          source: "ADMIN_PANEL",
        },
      });

      await tx.insert(notificationsTable).values({
        userId: id,
        type: "BALANCE_ADJUSTED",
        title: delta > 0 ? "Crédit reçu" : "Débit effectué",
        message: delta > 0
          ? `Votre solde a été crédité de $${delta.toFixed(2)}. Note: ${String(note)}`
          : `Votre solde a été débité de $${Math.abs(delta).toFixed(2)}. Note: ${String(note)}`,
        category: "financial",
        actionUrl: "/wallet",
        read: false,
      });
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg === "WALLET_NOT_FOUND") {
      res.status(404).json({ error: "Not Found", message: "Wallet not found" });
      return;
    }
    if (msg === "INSUFFICIENT_AVAILABLE_BALANCE") {
      res.status(400).json({ error: "Bad Request", message: "Adjustment would result in negative balance" });
      return;
    }
    throw error;
  }

  res.json({ message: "Balance adjusted successfully" });
});

router.post("/admin/users/:id/recharge", requireAdmin as never, async (req: AuthRequest, res) => {
  await ensureLedgerInfra();
  const id = String(req.params.id);
  const amount = Number.parseFloat(String(req.body?.amount ?? ""));
  const noteRaw = String(req.body?.note || "").trim();
  const note = noteRaw || "Admin wallet recharge";

  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "Bad Request", message: "amount must be a positive number" });
    return;
  }

  await db.transaction(async (tx) => {
    const [rechargeTx] = await tx.insert(transactionsTable).values({
      userId: id,
      type: "SYSTEM_FEE",
      amount: amount.toFixed(2),
      currency: "USD",
      amountUsd: amount.toFixed(2),
      status: "COMPLETED",
      paymentMethod: "SYSTEM",
      adminNote: note,
      description: `Admin recharge: ${note}`,
    }).returning({ id: transactionsTable.id });

    await adjustAvailableWithTreasury(tx, {
      userId: id,
      deltaUsd: amount,
      transactionId: rechargeTx.id,
      currency: "USD",
      idempotencyKey: `admin:recharge:${rechargeTx.id}`,
      description: `Admin recharge: ${note}`,
      metadata: {
        adminId: req.userId || null,
        source: "ADMIN_RECHARGE",
      },
    });
  });

  res.json({ message: "Wallet recharged successfully", amount: Number(amount.toFixed(2)) });
});

router.get("/admin/deposits/pending", requireAdmin as never, async (req: AuthRequest, res) => {
  const ago24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const pending = await db.select({
    id: transactionsTable.id,
    userId: transactionsTable.userId,
    amount: transactionsTable.amount,
    currency: transactionsTable.currency,
    paymentMethod: transactionsTable.paymentMethod,
    referenceId: transactionsTable.referenceId,
    screenshotUrl: transactionsTable.screenshotUrl,
    createdAt: transactionsTable.createdAt,
    username: usersTable.username,
  })
  .from(transactionsTable)
  .innerJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
  .where(and(eq(transactionsTable.type, "DEPOSIT"), eq(transactionsTable.status, "PENDING")))
  .orderBy(desc(transactionsTable.createdAt));

  const deposits = pending.map(d => ({
    id: d.id,
    userId: d.userId,
    username: d.username,
    amount: parseFloat(d.amount),
    currency: d.currency,
    amountHtg: d.currency === "HTG" ? parseFloat(d.amount) : null,
    paymentMethod: d.paymentMethod || "UNKNOWN",
    reference: d.referenceId,
    screenshotUrl: d.screenshotUrl,
    createdAt: d.createdAt,
    overdue: d.createdAt < ago24h,
  }));

  res.json({
    deposits,
    total: deposits.length,
    overdueCount: deposits.filter(d => d.overdue).length,
  });
});

router.put("/admin/deposits/:id/approve", requireAdmin as never, async (req: AuthRequest, res) => {
  await ensureLedgerInfra();
  const id = String(req.params.id);
  if (!isValidId(id)) { res.status(400).json({ error: "Bad Request", message: "Invalid ID" }); return; }
  try {
    await db.transaction(async (txDb) => {
      const txRows = await txDb.select().from(transactionsTable)
        .where(and(eq(transactionsTable.id, id), eq(transactionsTable.type, "DEPOSIT")))
        .for("update")
        .limit(1);
      if (!txRows.length) throw new Error("NOT_FOUND");
      const row = txRows[0];

      if (row.status !== "PENDING") throw new Error(`BAD_STATUS:${row.status}`);

      await creditAvailableFromTreasury(txDb, {
        userId: row.userId,
        transactionId: row.id,
        amountUsd: parseFloat(row.amountUsd),
        currency: "USD",
        idempotencyKey: `deposit:settle:${row.id}`,
        description: `Deposit approved ${row.referenceId || row.id}`,
        metadata: {
          source: "ADMIN_APPROVAL",
          adminId: req.userId || null,
        },
      });

      await txDb.update(transactionsTable)
        .set({ status: "COMPLETED", updatedAt: new Date() })
        .where(eq(transactionsTable.id, id));

      await txDb.insert(notificationsTable).values({
        userId: row.userId,
        type: "DEPOSIT_APPROVED",
        title: "Dépôt approuvé !",
        message: `Votre dépôt de ${row.amount} ${row.currency} a été approuvé et crédité à votre wallet.`,
        category: "financial",
        actionUrl: "/wallet",
        read: false,
      });
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg === "NOT_FOUND") {
      res.status(404).json({ error: "Not Found", message: "Deposit not found" });
      return;
    }
    if (msg.startsWith("BAD_STATUS:")) {
      res.status(409).json({ error: "Conflict", message: `Deposit is already in status ${msg.split(":")[1]}` });
      return;
    }
    throw error;
  }

  res.json({ message: "Deposit approved" });
});

router.put("/admin/deposits/:id/reject", requireAdmin as never, async (req: AuthRequest, res) => {
  const id = String(req.params.id);
  if (!isValidId(id)) { res.status(400).json({ error: "Bad Request", message: "Invalid ID" }); return; }
  const { reason } = req.body;
  if (!reason) {
    res.status(400).json({ error: "Bad Request", message: "Reason is required" });
    return;
  }
  try {
    await db.transaction(async (txDb) => {
      const txRows = await txDb.select().from(transactionsTable)
        .where(and(eq(transactionsTable.id, id), eq(transactionsTable.type, "DEPOSIT")))
        .for("update")
        .limit(1);
      if (!txRows.length) throw new Error("NOT_FOUND");
      const row = txRows[0];
      if (row.status !== "PENDING") throw new Error(`BAD_STATUS:${row.status}`);

      await txDb.update(transactionsTable)
        .set({ status: "CANCELLED", adminNote: reason, updatedAt: new Date() })
        .where(eq(transactionsTable.id, id));

      await txDb.insert(notificationsTable).values({
        userId: row.userId,
        type: "DEPOSIT_REJECTED",
        title: "Dépôt rejeté",
        message: `Votre dépôt de ${row.amount} ${row.currency} a été rejeté. Raison: ${reason}`,
        category: "financial",
        actionUrl: "/wallet",
        read: false,
      });
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg === "NOT_FOUND") {
      res.status(404).json({ error: "Not Found", message: "Deposit not found" });
      return;
    }
    if (msg.startsWith("BAD_STATUS:")) {
      res.status(409).json({ error: "Conflict", message: `Deposit is already in status ${msg.split(":")[1]}` });
      return;
    }
    throw error;
  }

  res.json({ message: "Deposit rejected" });
});

router.post("/admin/deposits/:id/sync-moncash", requireAdmin as never, async (req: AuthRequest, res) => {
  await ensureLedgerInfra();
  const id = String(req.params.id);
  if (!isValidId(id)) { res.status(400).json({ error: "Bad Request", message: "Invalid ID" }); return; }

  const rows = await db.select().from(transactionsTable)
    .where(and(eq(transactionsTable.id, id), eq(transactionsTable.type, "DEPOSIT")))
    .limit(1);
  if (!rows.length) {
    res.status(404).json({ error: "Not Found", message: "Deposit not found" });
    return;
  }
  const row = rows[0];

  if ((row.paymentMethod || "").toUpperCase() !== "MONCASH") {
    res.status(400).json({ error: "Bad Request", message: "This action is only available for MonCash deposits" });
    return;
  }
  if (!row.referenceId) {
    res.status(400).json({ error: "Bad Request", message: "Missing reference ID" });
    return;
  }
  if (row.status === "COMPLETED") {
    res.json({ ok: true, status: "COMPLETED", message: "Deposit already settled" });
    return;
  }
  if (row.status !== "PENDING") {
    res.status(409).json({ error: "Conflict", message: `Deposit is in status ${row.status}` });
    return;
  }

  let moncashResult;
  try {
    moncashResult = await moncashRetrieveOrderPayment(row.referenceId);
  } catch (error) {
    res.status(502).json({
      error: "Bad Gateway",
      message: "Unable to verify MonCash transaction",
      detail: error instanceof Error ? error.message : "MONCASH_SYNC_FAILED",
    });
    return;
  }

  if (!moncashResult.successful) {
    res.status(409).json({
      error: "Conflict",
      message: "MonCash transaction is not settled yet",
      providerMessage: moncashResult.message,
    });
    return;
  }

  await db.transaction(async (txDb) => {
    const txRows = await txDb.select().from(transactionsTable)
      .where(eq(transactionsTable.id, row.id))
      .for("update")
      .limit(1);
    if (!txRows.length) throw new Error("NOT_FOUND");
    const current = txRows[0];
    if (current.status === "COMPLETED") return;
    if (current.status !== "PENDING") throw new Error(`BAD_STATUS:${current.status}`);

    await creditAvailableFromTreasury(txDb, {
      userId: current.userId,
      transactionId: current.id,
      amountUsd: parseFloat(current.amountUsd),
      currency: "USD",
      idempotencyKey: `deposit:settle:${current.id}`,
      description: `Deposit synced from MonCash ${current.referenceId || current.id}`,
      metadata: {
        source: "ADMIN_SYNC_MONCASH",
        provider: "MONCASH",
        providerTxId: moncashResult.transactionId,
        payer: moncashResult.payer,
        adminId: req.userId || null,
      },
    });

    const nextMeta = {
      ...(current.metadata && typeof current.metadata === "object" ? current.metadata as Record<string, unknown> : {}),
      provider: "MONCASH",
      providerTxId: moncashResult.transactionId,
      payer: moncashResult.payer,
      syncedByAdminAt: new Date().toISOString(),
      syncedByAdminId: req.userId || null,
    };

    await txDb.update(transactionsTable)
      .set({ status: "COMPLETED", updatedAt: new Date(), metadata: nextMeta })
      .where(eq(transactionsTable.id, current.id));

    await txDb.insert(notificationsTable).values({
      userId: current.userId,
      type: "DEPOSIT_APPROVED",
      title: "Dépôt confirmé",
      message: `Votre dépôt ${current.referenceId || current.id} a été confirmé via MonCash.`,
      category: "financial",
      actionUrl: "/wallet",
      read: false,
    });
  });

  res.json({
    ok: true,
    status: "COMPLETED",
    provider: "MONCASH",
    providerTxId: moncashResult.transactionId,
  });
});

router.get("/admin/withdrawals/pending", requireAdmin as never, async (req: AuthRequest, res) => {
  const ago24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const pending = await db.select({
    id: transactionsTable.id,
    userId: transactionsTable.userId,
    amount: transactionsTable.amount,
    currency: transactionsTable.currency,
    paymentMethod: transactionsTable.paymentMethod,
    destination: transactionsTable.description,
    createdAt: transactionsTable.createdAt,
    username: usersTable.username,
  })
  .from(transactionsTable)
  .innerJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
  .where(and(eq(transactionsTable.type, "WITHDRAWAL"), eq(transactionsTable.status, "PENDING")))
  .orderBy(desc(transactionsTable.createdAt));

  const withdrawals = pending.map(w => ({
    id: w.id,
    userId: w.userId,
    username: w.username,
    amount: parseFloat(w.amount),
    currency: w.currency,
    paymentMethod: w.paymentMethod || "UNKNOWN",
    destination: w.destination,
    createdAt: w.createdAt,
    overdue: w.createdAt < ago24h,
  }));

  res.json({
    withdrawals,
    total: withdrawals.length,
    overdueCount: withdrawals.filter(w => w.overdue).length,
  });
});

router.put("/admin/withdrawals/:id/approve", requireAdmin as never, async (req: AuthRequest, res) => {
  await ensureLedgerInfra();
  const id = String(req.params.id);
  if (!isValidId(id)) { res.status(400).json({ error: "Bad Request", message: "Invalid ID" }); return; }

  const preRows = await db.select({
    paymentMethod: transactionsTable.paymentMethod,
    status: transactionsTable.status,
  }).from(transactionsTable)
    .where(and(eq(transactionsTable.id, id), eq(transactionsTable.type, "WITHDRAWAL")))
    .limit(1);

  if (!preRows.length) {
    res.status(404).json({ error: "Not Found", message: "Withdrawal not found" });
    return;
  }

  const isCryptoSemiAuto = (preRows[0].paymentMethod || "").toUpperCase() === "CRYPTO"
    && getCryptoWithdrawMode() === "SEMI_AUTO";

  if (isCryptoSemiAuto) {
    try {
      const outcome = await dispatchCryptoWithdrawal({
        transactionId: id,
        actorId: req.userId || null,
        source: "ADMIN_APPROVAL",
      });
      res.json({
        message: "Withdrawal approved",
        mode: outcome.mode,
        status: outcome.status,
        provider: "NOWPAYMENTS",
        payoutId: outcome.payoutId,
        withdrawalId: outcome.withdrawalId,
      });
      return;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      if (msg === "NOT_FOUND") {
        res.status(404).json({ error: "Not Found", message: "Withdrawal not found" });
        return;
      }
      if (msg.startsWith("BAD_STATUS:")) {
        res.status(409).json({ error: "Conflict", message: `Withdrawal is already in status ${msg.split(":")[1]}` });
        return;
      }
      if (msg === "MISSING_DESTINATION") {
        res.status(400).json({ error: "Bad Request", message: "Withdrawal destination is missing" });
        return;
      }
      if (msg === "INVALID_CRYPTO_ASSET") {
        res.status(400).json({ error: "Bad Request", message: "Invalid crypto asset on withdrawal transaction" });
        return;
      }
      if (msg === "CRYPTO_PAYOUT_NOT_CONFIGURED") {
        res.status(503).json({ error: "Service Unavailable", message: "Crypto payout provider is not configured" });
        return;
      }
      if (msg === "NOWPAYMENTS_AUTH_TOKEN_MISSING" || msg.startsWith("NOWPAYMENTS_AUTH_FAILED")) {
        res.status(502).json({ error: "Bad Gateway", message: "Crypto provider auth failed" });
        return;
      }
      if (msg.startsWith("NOWPAYMENTS_CREATE_PAYOUT_FAILED")) {
        res.status(502).json({ error: "Bad Gateway", message: "Crypto payout dispatch failed" });
        return;
      }
      throw error;
    }
  }

  let approvalOutcome: { mode: "manual" | "moncash-auto"; status: "COMPLETED" | "FAILED" } | null = null;
  try {
    approvalOutcome = await db.transaction(async (txDb) => {
      const txRows = await txDb.select().from(transactionsTable)
        .where(and(eq(transactionsTable.id, id), eq(transactionsTable.type, "WITHDRAWAL")))
        .for("update")
        .limit(1);
      if (!txRows.length) throw new Error("NOT_FOUND");
      const row = txRows[0];
      if (row.status !== "PENDING" && row.status !== "PROCESSING") throw new Error(`BAD_STATUS:${row.status}`);

      const amountUsd = parseFloat(row.amountUsd);
      const baseMeta = (row.metadata && typeof row.metadata === "object")
        ? row.metadata as Record<string, unknown>
        : {};

      const pilot = evaluateAutoPayoutPilot({
        userId: row.userId,
        amountUsd,
        paymentMethod: row.paymentMethod,
        currency: row.currency,
      });
      const autoMoncashEligible = isMoncashAutoWithdrawEnabled()
        && row.status === "PENDING"
        && row.paymentMethod === "MONCASH"
        && pilot.allowed;

      if (autoMoncashEligible) {
        const destination = parseDestination(row.metadata, row.description);
        if (!destination) throw new Error("MISSING_DESTINATION");

        let transferResult;
        try {
          transferResult = await moncashTransfer({
            reference: moncashReferenceForWithdrawal(row.id),
            receiver: destination,
            amount: parseFloat(row.amount),
            description: `Withdrawal ${row.referenceId || row.id}`,
          });
        } catch (error) {
          const nextMeta = {
            ...baseMeta,
            provider: "MONCASH",
            autoPayoutError: error instanceof Error ? error.message : "MONCASH_TRANSFER_FAILED",
            autoPayoutTriedAt: new Date().toISOString(),
          };
          await txDb.update(transactionsTable)
            .set({ metadata: nextMeta, adminNote: "Auto payout dispatch failed. Retry required.", updatedAt: new Date() })
            .where(eq(transactionsTable.id, row.id));
          throw new Error("AUTO_PAYOUT_DISPATCH_FAILED");
        }

        if (!transferResult.successful) {
          await releaseBlockedToAvailable(txDb, {
            userId: row.userId,
            transactionId: row.id,
            amountUsd,
            currency: "USD",
            idempotencyKey: `withdraw:release:${row.id}`,
            description: `Withdrawal auto payout failed ${row.referenceId || row.id}`,
            metadata: {
              source: "MONCASH_AUTO_PAYOUT_FAILED",
              adminId: req.userId || null,
              providerMessage: transferResult.message,
            },
          });

          await txDb.update(transactionsTable)
            .set({
              status: "FAILED",
              updatedAt: new Date(),
              metadata: {
                ...baseMeta,
                provider: "MONCASH",
                providerTxId: transferResult.transactionId,
                providerMessage: transferResult.message,
                autoPayout: "FAILED",
              },
              adminNote: "Auto payout failed. Funds released to available balance.",
            })
            .where(eq(transactionsTable.id, row.id));

          await txDb.insert(notificationsTable).values({
            userId: row.userId,
            type: "WITHDRAWAL_REJECTED",
            title: "Retrait non exécuté",
            message: `Le retrait de ${row.amount} ${row.currency} n'a pas pu être exécuté automatiquement et a été remboursé.`,
            category: "financial",
            actionUrl: "/wallet",
            read: false,
          });

          return { mode: "moncash-auto" as const, status: "FAILED" as const };
        }

        await settleBlockedToTreasury(txDb, {
          userId: row.userId,
          transactionId: row.id,
          amountUsd,
          currency: "USD",
          idempotencyKey: `withdraw:settle:${row.id}`,
          description: `Withdrawal auto paid ${row.referenceId || row.id}`,
          metadata: {
            source: "MONCASH_AUTO_PAYOUT",
            adminId: req.userId || null,
            providerTxId: transferResult.transactionId,
          },
        });

        await txDb.update(transactionsTable)
          .set({
            status: "COMPLETED",
            updatedAt: new Date(),
            metadata: {
              ...baseMeta,
              provider: "MONCASH",
              providerTxId: transferResult.transactionId,
              providerMessage: transferResult.message,
              autoPayout: "COMPLETED",
              autoPayoutAt: new Date().toISOString(),
            },
          })
          .where(eq(transactionsTable.id, row.id));

        await txDb.insert(notificationsTable).values({
          userId: row.userId,
          type: "WITHDRAWAL_APPROVED",
          title: "Retrait approuvé !",
          message: `Votre retrait de ${row.amount} ${row.currency} a été exécuté via MonCash.`,
          category: "financial",
          actionUrl: "/wallet",
          read: false,
        });

        return { mode: "moncash-auto" as const, status: "COMPLETED" as const };
      }

      try {
        await settleBlockedToTreasury(txDb, {
          userId: row.userId,
          transactionId: row.id,
          amountUsd,
          currency: "USD",
          idempotencyKey: `withdraw:settle:${row.id}`,
          description: `Withdrawal approved ${row.referenceId || row.id}`,
          metadata: {
            source: "ADMIN_APPROVAL",
            adminId: req.userId || null,
            pilotReason: pilot.allowed ? null : pilot.reason || "AUTO_PAYOUT_PILOT_RESTRICTED",
          },
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : "WITHDRAW_SETTLE_FAILED";
        if (reason !== "INSUFFICIENT_BLOCKED_BALANCE") throw error;
      }

      await txDb.update(transactionsTable)
        .set({
          status: "COMPLETED",
          updatedAt: new Date(),
          ...(pilot.allowed ? {} : { adminNote: `Auto payout skipped by pilot policy: ${pilot.reason}` }),
        })
        .where(eq(transactionsTable.id, id));

      await txDb.insert(notificationsTable).values({
        userId: row.userId,
        type: "WITHDRAWAL_APPROVED",
        title: "Retrait approuvé !",
        message: `Votre retrait de ${row.amount} ${row.currency} a été approuvé et sera traité sous 24h.`,
        category: "financial",
        actionUrl: "/wallet",
        read: false,
      });

      return { mode: "manual" as const, status: "COMPLETED" as const };
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg === "NOT_FOUND") {
      res.status(404).json({ error: "Not Found", message: "Withdrawal not found" });
      return;
    }
    if (msg.startsWith("BAD_STATUS:")) {
      res.status(409).json({ error: "Conflict", message: `Withdrawal is already in status ${msg.split(":")[1]}` });
      return;
    }
    if (msg === "MISSING_DESTINATION") {
      res.status(400).json({ error: "Bad Request", message: "Withdrawal destination is missing" });
      return;
    }
    if (msg === "AUTO_PAYOUT_DISPATCH_FAILED") {
      res.status(502).json({ error: "Bad Gateway", message: "Auto payout dispatch failed. Transaction remains pending for retry." });
      return;
    }
    throw error;
  }

  res.json({ message: "Withdrawal approved", mode: approvalOutcome?.mode || "manual", status: approvalOutcome?.status || "COMPLETED" });
});

router.put("/admin/withdrawals/:id/reject", requireAdmin as never, async (req: AuthRequest, res) => {
  await ensureLedgerInfra();
  const id = String(req.params.id);
  if (!isValidId(id)) { res.status(400).json({ error: "Bad Request", message: "Invalid ID" }); return; }
  const { reason } = req.body;
  if (!reason) {
    res.status(400).json({ error: "Bad Request", message: "Reason is required" });
    return;
  }
  try {
    await db.transaction(async (txDb) => {
      const txRows = await txDb.select().from(transactionsTable)
        .where(and(eq(transactionsTable.id, id), eq(transactionsTable.type, "WITHDRAWAL")))
        .for("update")
        .limit(1);
      if (!txRows.length) throw new Error("NOT_FOUND");
      const row = txRows[0];
      if (row.status !== "PENDING" && row.status !== "PROCESSING") throw new Error(`BAD_STATUS:${row.status}`);

      try {
        await releaseBlockedToAvailable(txDb, {
          userId: row.userId,
          transactionId: row.id,
          amountUsd: parseFloat(row.amountUsd),
          currency: "USD",
          idempotencyKey: `withdraw:release:${row.id}`,
          description: `Withdrawal rejected ${row.referenceId || row.id}`,
          metadata: {
            source: "ADMIN_REJECTION",
            reason: String(reason),
            adminId: req.userId || null,
          },
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "WITHDRAW_RELEASE_FAILED";
        if (errMsg !== "INSUFFICIENT_BLOCKED_BALANCE") throw error;
        await creditAvailableFromTreasury(txDb, {
          userId: row.userId,
          transactionId: row.id,
          amountUsd: parseFloat(row.amountUsd),
          currency: "USD",
          idempotencyKey: `withdraw:legacy-refund:${row.id}`,
          description: `Legacy withdrawal refund ${row.referenceId || row.id}`,
          metadata: {
            source: "ADMIN_REJECTION_LEGACY",
            reason: String(reason),
            adminId: req.userId || null,
          },
        });
      }

      await txDb.update(transactionsTable)
        .set({ status: "CANCELLED", adminNote: reason, updatedAt: new Date() })
        .where(eq(transactionsTable.id, id));

      await txDb.insert(notificationsTable).values({
        userId: row.userId,
        type: "WITHDRAWAL_REJECTED",
        title: "Retrait rejeté",
        message: `Votre retrait de ${row.amount} ${row.currency} a été rejeté et remboursé. Raison: ${reason}`,
        category: "financial",
        actionUrl: "/wallet",
        read: false,
      });
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg === "NOT_FOUND") {
      res.status(404).json({ error: "Not Found", message: "Withdrawal not found" });
      return;
    }
    if (msg === "WALLET_NOT_FOUND") {
      res.status(404).json({ error: "Not Found", message: "Wallet not found" });
      return;
    }
    if (msg.startsWith("BAD_STATUS:")) {
      res.status(409).json({ error: "Conflict", message: `Withdrawal is already in status ${msg.split(":")[1]}` });
      return;
    }
    throw error;
  }

  res.json({ message: "Withdrawal rejected and refunded" });
});

router.get("/admin/ledger/journal", requireAdmin as never, async (req: AuthRequest, res) => {
  await ensureLedgerInfra();
  const { page = "1", limit = "50", userId, status, transactionId } = req.query as Record<string, string>;
  const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 50));
  const offset = (pageNum - 1) * limitNum;

  if (userId && !isValidId(userId)) {
    res.status(400).json({ error: "Bad Request", message: "Invalid userId" });
    return;
  }
  if (transactionId && !isValidId(transactionId)) {
    res.status(400).json({ error: "Bad Request", message: "Invalid transactionId" });
    return;
  }

  const statusFilter = String(status || "").trim().toUpperCase();
  if (statusFilter && statusFilter !== "POSTED" && statusFilter !== "REVERSED") {
    res.status(400).json({ error: "Bad Request", message: "Invalid status filter" });
    return;
  }

  const debitAccount = aliasedTable(ledgerAccountsTable, "debit_account");
  const creditAccount = aliasedTable(ledgerAccountsTable, "credit_account");
  const debitUser = aliasedTable(usersTable, "debit_user");
  const creditUser = aliasedTable(usersTable, "credit_user");

  const whereClause = and(
    statusFilter ? eq(ledgerEntriesTable.status, statusFilter as "POSTED" | "REVERSED") : undefined,
    transactionId ? eq(ledgerEntriesTable.transactionId, transactionId) : undefined,
    userId ? or(eq(debitAccount.userId, userId), eq(creditAccount.userId, userId)) : undefined,
  );

  const [totalResult] = await db.select({ count: count() })
    .from(ledgerEntriesTable)
    .innerJoin(debitAccount, eq(ledgerEntriesTable.debitAccountId, debitAccount.id))
    .innerJoin(creditAccount, eq(ledgerEntriesTable.creditAccountId, creditAccount.id))
    .where(whereClause);

  const entries = await db.select({
    id: ledgerEntriesTable.id,
    createdAt: ledgerEntriesTable.createdAt,
    transactionId: ledgerEntriesTable.transactionId,
    amount: ledgerEntriesTable.amount,
    currency: ledgerEntriesTable.currency,
    status: ledgerEntriesTable.status,
    description: ledgerEntriesTable.description,
    metadata: ledgerEntriesTable.metadata,
    idempotencyKey: ledgerEntriesTable.idempotencyKey,
    debitCode: debitAccount.code,
    debitType: debitAccount.type,
    debitUserId: debitAccount.userId,
    debitUsername: debitUser.username,
    creditCode: creditAccount.code,
    creditType: creditAccount.type,
    creditUserId: creditAccount.userId,
    creditUsername: creditUser.username,
  })
    .from(ledgerEntriesTable)
    .innerJoin(debitAccount, eq(ledgerEntriesTable.debitAccountId, debitAccount.id))
    .innerJoin(creditAccount, eq(ledgerEntriesTable.creditAccountId, creditAccount.id))
    .leftJoin(debitUser, eq(debitAccount.userId, debitUser.id))
    .leftJoin(creditUser, eq(creditAccount.userId, creditUser.id))
    .where(whereClause)
    .orderBy(desc(ledgerEntriesTable.createdAt))
    .limit(limitNum)
    .offset(offset);

  res.json({
    entries: entries.map((entry) => ({
      ...entry,
      amount: parseFloat(entry.amount),
    })),
    total: Number(totalResult.count),
    page: pageNum,
    totalPages: Math.ceil(Number(totalResult.count) / limitNum),
  });
});

router.get("/admin/ledger/reconciliation", requireAdmin as never, async (req: AuthRequest, res) => {
  await ensureLedgerInfra();
  const tolerance = Number.parseFloat(String((req.query as Record<string, string>).tolerance || process.env.RECON_TOLERANCE_USD || "0.01"));
  const toleranceValue = Number.isFinite(tolerance) && tolerance >= 0 ? tolerance : 0.01;

  const walletRows = await db.select({
    userId: walletsTable.userId,
    username: usersTable.username,
    walletAvailable: walletsTable.balanceUsd,
    walletBlocked: walletsTable.balanceReserved,
  })
    .from(walletsTable)
    .innerJoin(usersTable, eq(walletsTable.userId, usersTable.id));

  const ledgerResult = await db.execute(sql`
    SELECT
      a.user_id::text AS user_id,
      a.type::text AS type,
      (
        COALESCE(SUM(CASE WHEN le.credit_account_id = a.id AND le.status = 'POSTED' THEN le.amount ELSE 0 END), 0)
        -
        COALESCE(SUM(CASE WHEN le.debit_account_id = a.id AND le.status = 'POSTED' THEN le.amount ELSE 0 END), 0)
      )::numeric(18,2) AS ledger_balance
    FROM ledger_accounts a
    LEFT JOIN ledger_entries le
      ON le.credit_account_id = a.id OR le.debit_account_id = a.id
    WHERE a.user_id IS NOT NULL
      AND a.type IN ('USER_AVAILABLE', 'USER_BLOCKED')
    GROUP BY a.user_id, a.type
  `);

  const ledgerByUser = new Map<string, { available: number; blocked: number }>();
  for (const row of ledgerResult.rows as Array<Record<string, unknown>>) {
    const userId = String(row.user_id || "");
    const type = String(row.type || "");
    const balance = Number.parseFloat(String(row.ledger_balance || "0"));
    if (!userId) continue;
    const current = ledgerByUser.get(userId) || { available: 0, blocked: 0 };
    if (type === "USER_AVAILABLE") current.available = Number.isFinite(balance) ? balance : 0;
    if (type === "USER_BLOCKED") current.blocked = Number.isFinite(balance) ? balance : 0;
    ledgerByUser.set(userId, current);
  }

  const mismatches: Array<Record<string, unknown>> = [];
  for (const row of walletRows) {
    const expected = ledgerByUser.get(row.userId) || { available: 0, blocked: 0 };
    const walletAvailable = Number.parseFloat(row.walletAvailable);
    const walletBlocked = Number.parseFloat(row.walletBlocked);
    const deltaAvailable = Number.parseFloat((walletAvailable - expected.available).toFixed(2));
    const deltaBlocked = Number.parseFloat((walletBlocked - expected.blocked).toFixed(2));

    if (Math.abs(deltaAvailable) > toleranceValue || Math.abs(deltaBlocked) > toleranceValue) {
      mismatches.push({
        userId: row.userId,
        username: row.username,
        walletAvailable: Number.parseFloat(walletAvailable.toFixed(2)),
        ledgerAvailable: Number.parseFloat(expected.available.toFixed(2)),
        walletBlocked: Number.parseFloat(walletBlocked.toFixed(2)),
        ledgerBlocked: Number.parseFloat(expected.blocked.toFixed(2)),
        deltaAvailable,
        deltaBlocked,
      });
    }
  }

  const totals = walletRows.reduce((acc, row) => {
    acc.walletAvailable += Number.parseFloat(row.walletAvailable);
    acc.walletBlocked += Number.parseFloat(row.walletBlocked);
    const ledger = ledgerByUser.get(row.userId) || { available: 0, blocked: 0 };
    acc.ledgerAvailable += ledger.available;
    acc.ledgerBlocked += ledger.blocked;
    return acc;
  }, { walletAvailable: 0, walletBlocked: 0, ledgerAvailable: 0, ledgerBlocked: 0 });

  if (mismatches.length > 0 && String((req.query as Record<string, string>).notify || "false").toLowerCase() === "true") {
    const admins = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "ADMIN"));
    if (admins.length) {
      await db.insert(notificationsTable).values(
        admins.map((a) => ({
          userId: a.id,
          type: "SYSTEM_ALERT",
          title: "Alerte réconciliation ledger",
          message: `${mismatches.length} compte(s) présentent un écart wallet/ledger.`,
          category: "security" as const,
          actionUrl: "/admin",
          read: false,
        })),
      );
    }
  }

  res.json({
    ok: mismatches.length === 0,
    tolerance: toleranceValue,
    checkedUsers: walletRows.length,
    mismatchCount: mismatches.length,
    totals: {
      walletAvailable: Number.parseFloat(totals.walletAvailable.toFixed(2)),
      walletBlocked: Number.parseFloat(totals.walletBlocked.toFixed(2)),
      ledgerAvailable: Number.parseFloat(totals.ledgerAvailable.toFixed(2)),
      ledgerBlocked: Number.parseFloat(totals.ledgerBlocked.toFixed(2)),
    },
    mismatches,
  });
});

router.get("/admin/boards", requireAdmin as never, async (req: AuthRequest, res) => {
  const instances = await db.select({
    id: boardInstancesTable.id,
    boardId: boardInstancesTable.boardId,
    instanceNumber: boardInstancesTable.instanceNumber,
    status: boardInstancesTable.status,
    slotsFilled: boardInstancesTable.slotsFilled,
    totalCollected: boardInstancesTable.totalCollected,
    rankerId: boardInstancesTable.rankerId,
    createdAt: boardInstancesTable.createdAt,
    completedAt: boardInstancesTable.completedAt,
  })
  .from(boardInstancesTable)
  .orderBy(desc(boardInstancesTable.createdAt))
  .limit(100);

  const instancesWithRankers = await Promise.all(instances.map(async inst => {
    let rankerUsername: string | null = null;
    if (inst.rankerId) {
      const rankers = await db.select({ username: usersTable.username })
        .from(usersTable)
        .where(eq(usersTable.id, inst.rankerId))
        .limit(1);
      if (rankers.length) rankerUsername = rankers[0].username;
    }
    return {
      id: inst.id,
      boardId: inst.boardId,
      instanceNumber: inst.instanceNumber,
      status: inst.status,
      slotsFilled: inst.slotsFilled,
      totalCollected: parseFloat(inst.totalCollected),
      rankerUsername,
      createdAt: inst.createdAt,
      completedAt: inst.completedAt,
    };
  }));

  res.json({
    instances: instancesWithRankers,
    total: instancesWithRankers.length,
  });
});

router.get("/admin/reports", requireAdmin as never, async (req: AuthRequest, res) => {
  const { period = "30d" } = req.query as { period: string };

  const periodDays: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
  const days = periodDays[period] ?? null;
  const dateFilter = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;

  const revenueFilter = and(
    eq(transactionsTable.type, "SYSTEM_FEE"),
    eq(transactionsTable.status, "COMPLETED"),
    dateFilter ? gte(transactionsTable.createdAt, dateFilter) : undefined,
  );

  const revenueRows = await db.select({ amount: transactionsTable.amountUsd })
    .from(transactionsTable)
    .where(revenueFilter);

  const totalRevenue = revenueRows.reduce((s, r) => s + parseFloat(r.amount), 0);

  const depositFilter = and(
    eq(transactionsTable.type, "DEPOSIT"),
    eq(transactionsTable.status, "COMPLETED"),
    dateFilter ? gte(transactionsTable.createdAt, dateFilter) : undefined,
  );
  const depositRows = await db.select({ amount: transactionsTable.amountUsd }).from(transactionsTable).where(depositFilter);
  const totalDeposits = depositRows.reduce((s, r) => s + parseFloat(r.amount), 0);

  const withdrawalFilter = and(
    eq(transactionsTable.type, "WITHDRAWAL"),
    eq(transactionsTable.status, "COMPLETED"),
    dateFilter ? gte(transactionsTable.createdAt, dateFilter) : undefined,
  );
  const withdrawalRows = await db.select({ amount: transactionsTable.amountUsd }).from(transactionsTable).where(withdrawalFilter);
  const totalWithdrawals = withdrawalRows.reduce((s, r) => s + parseFloat(r.amount), 0);

  const userFilter = dateFilter ? gte(usersTable.createdAt, dateFilter) : undefined;
  const [newUsersResult] = await db.select({ count: count() }).from(usersTable).where(userFilter);
  const newUsers = Number(newUsersResult.count);

  const completedBoardFilter = and(
    eq(boardInstancesTable.status, "COMPLETED"),
    dateFilter ? gte(boardInstancesTable.completedAt, dateFilter) : undefined,
  );
  const [completedBoardsResult] = await db.select({ count: count() }).from(boardInstancesTable).where(completedBoardFilter);
  const completedBoards = Number(completedBoardsResult.count);

  const boards = await db.select().from(boardsTable);
  const boardRevenue = await Promise.all(boards.map(async b => {
    const instances = await db.select({
      status: boardInstancesTable.status,
      totalCollected: boardInstancesTable.totalCollected,
    })
    .from(boardInstancesTable)
    .where(and(
      eq(boardInstancesTable.boardId, b.id),
      dateFilter ? gte(boardInstancesTable.createdAt, dateFilter) : undefined,
    ));

    const totalCollected = instances.reduce((s, i) => s + parseFloat(i.totalCollected), 0);
    const completedInstances = instances.filter(i => i.status === "COMPLETED").length;
    const activeInstances = instances.filter(i => i.status === "ACTIVE").length;

    return {
      boardId: b.id,
      totalCollected: parseFloat(totalCollected.toFixed(2)),
      completedInstances,
      activeInstances,
    };
  }));

  const userGrowthDays = Math.min(days ?? 30, 30);
  const userGrowth: Array<{ date: string; newUsers: number; activeUsers: number }> = [];
  for (let i = userGrowthDays - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dayStr = day.toISOString().split("T")[0];
    const dayStart = new Date(`${dayStr}T00:00:00Z`);
    const dayEnd = new Date(`${dayStr}T23:59:59Z`);
    const [dayNewUsers] = await db.select({ count: count() })
      .from(usersTable)
      .where(and(gte(usersTable.createdAt, dayStart), sql`${usersTable.createdAt} <= ${dayEnd}`));
    const [dayActiveUsers] = await db.select({ count: count() })
      .from(usersTable)
      .where(and(eq(usersTable.status, "ACTIVE"), gte(usersTable.createdAt, dayStart), sql`${usersTable.createdAt} <= ${dayEnd}`));
    userGrowth.push({
      date: dayStr,
      newUsers: Number(dayNewUsers.count),
      activeUsers: Number(dayActiveUsers.count),
    });
  }

  res.json({
    period,
    totalRevenue: parseFloat(totalRevenue.toFixed(2)),
    totalDeposits: parseFloat(totalDeposits.toFixed(2)),
    totalWithdrawals: parseFloat(totalWithdrawals.toFixed(2)),
    newUsers,
    completedBoards,
    boardRevenue,
    userGrowth,
  });
});

export default router;
