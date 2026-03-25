import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  walletsTable,
  transactionsTable,
  notificationsTable,
  otpCodesTable,
  usersTable,
  ledgerEntriesTable,
  ledgerAccountsTable,
} from "@workspace/db";
import { eq, desc, and, gte, lte, sql, isNull, or, aliasedTable, count } from "drizzle-orm";
import { requireActiveAuth as requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { createHash, randomUUID } from "crypto";
import { ensureLedgerInfra, ensureWalletAndLedgerAccounts, moveAvailableToBlocked } from "../lib/ledger.js";

type PaymentMethodValue = "MONCASH" | "NATCASH" | "CARD" | "BANK_TRANSFER" | "CRYPTO" | "PAYPAL" | "SYSTEM";

const router: IRouter = Router();
let otpInfraReady = false;
let otpInfraPromise: Promise<void> | null = null;

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOtp(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

function operationRef(prefix: "DEP" | "WDR"): string {
  return `${prefix}-${randomUUID()}`;
}

function amountLimit(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (!raw) return fallback;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const MIN_DEPOSIT_USD = amountLimit("MIN_DEPOSIT_USD", 3);
const MAX_DEPOSIT_USD = amountLimit("MAX_DEPOSIT_USD", 10000);
const MIN_WITHDRAW_USD = amountLimit("MIN_WITHDRAW_USD", 3);
const MAX_WITHDRAW_USD = amountLimit("MAX_WITHDRAW_USD", 5000);

const SUPPORTED_CURRENCIES = new Set(["USD", "HTG", "EUR", "GBP", "CAD", "BTC", "ETH", "USDT"]);
const SUPPORTED_DEPOSIT_METHODS = new Set(["MONCASH", "NATCASH", "BANK_TRANSFER", "CARD", "CRYPTO"]);
const SUPPORTED_WITHDRAW_METHODS = new Set(["MONCASH", "NATCASH", "BANK_TRANSFER", "CRYPTO"]);

const FIXED_RATES: Record<string, number> = {
  USD: 1,
  HTG: 140,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.36,
  BTC: 0.000015,
  ETH: 0.00044,
  USDT: 1,
};

function parsePositiveAmount(value: unknown): number | null {
  const num = typeof value === "string" ? parseFloat(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

async function ensureOtpInfra(): Promise<void> {
  if (otpInfraReady) return;
  if (otpInfraPromise) return otpInfraPromise;
  otpInfraPromise = (async () => {
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE otp_purpose AS ENUM ('EMAIL_VERIFICATION','WITHDRAWAL');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS otp_codes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id),
        purpose otp_purpose NOT NULL,
        code_hash varchar(128) NOT NULL,
        amount_usd numeric(18,2),
        attempts integer NOT NULL DEFAULT 0,
        max_attempts integer NOT NULL DEFAULT 5,
        expires_at timestamptz NOT NULL,
        consumed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_otp_user_purpose_created ON otp_codes(user_id, purpose, created_at);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_otp_expires_at ON otp_codes(expires_at);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_otp_consumed_at ON otp_codes(consumed_at);`);
    otpInfraReady = true;
  })();
  try {
    await otpInfraPromise;
  } finally {
    otpInfraPromise = null;
  }
}

async function requireWithdrawKycApproved(userId: string): Promise<null | { status: 403; message: string }> {
  const users = await db.select({ kycStatus: usersTable.kycStatus })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!users.length) return { status: 403, message: "User not found" };
  if (users[0].kycStatus !== "APPROVED") {
    return { status: 403, message: "KYC approval is required before any withdrawal." };
  }
  return null;
}

router.get("/wallet", requireAuth as never, async (req: AuthRequest, res) => {
  await ensureLedgerInfra();
  const w = await db.transaction(async (tx) => {
    await ensureWalletAndLedgerAccounts(tx, req.userId!, "USD");
    const wallets = await tx.select().from(walletsTable).where(eq(walletsTable.userId, req.userId!)).limit(1);
    if (!wallets.length) throw new Error("WALLET_NOT_FOUND");
    return wallets[0];
  });

  const balanceUsd = parseFloat(w.balanceUsd);
  const balancePending = parseFloat(w.balancePending);
  const balanceReserved = parseFloat(w.balanceReserved);
  const accountingTotal = balanceUsd + balanceReserved;
  res.json({
    balanceUsd,
    balancePending,
    balanceReserved,
    availableBalance: balanceUsd,
    blockedBalance: balanceReserved,
    accountingTotal,
    totalBalance: balanceUsd + balancePending + balanceReserved,
  });
});

router.get("/wallet/rates", requireAuth as never, async (req: AuthRequest, res) => {
  res.json({
    base: "USD",
    rates: FIXED_RATES,
    updatedAt: new Date().toISOString(),
  });
});

router.get("/wallet/ledger", requireAuth as never, async (req: AuthRequest, res) => {
  await ensureLedgerInfra();
  const { page = "1", limit = "25" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 25));
  const offset = (pageNum - 1) * limitNum;

  const debitAccount = aliasedTable(ledgerAccountsTable, "wallet_debit_account");
  const creditAccount = aliasedTable(ledgerAccountsTable, "wallet_credit_account");
  const whereClause = or(
    eq(debitAccount.userId, req.userId!),
    eq(creditAccount.userId, req.userId!),
  );

  const [totalResult] = await db.select({ count: count() })
    .from(ledgerEntriesTable)
    .innerJoin(debitAccount, eq(ledgerEntriesTable.debitAccountId, debitAccount.id))
    .innerJoin(creditAccount, eq(ledgerEntriesTable.creditAccountId, creditAccount.id))
    .where(whereClause);

  const entries = await db.select({
    id: ledgerEntriesTable.id,
    transactionId: ledgerEntriesTable.transactionId,
    amount: ledgerEntriesTable.amount,
    currency: ledgerEntriesTable.currency,
    status: ledgerEntriesTable.status,
    description: ledgerEntriesTable.description,
    metadata: ledgerEntriesTable.metadata,
    createdAt: ledgerEntriesTable.createdAt,
    debitType: debitAccount.type,
    debitUserId: debitAccount.userId,
    creditType: creditAccount.type,
    creditUserId: creditAccount.userId,
  })
    .from(ledgerEntriesTable)
    .innerJoin(debitAccount, eq(ledgerEntriesTable.debitAccountId, debitAccount.id))
    .innerJoin(creditAccount, eq(ledgerEntriesTable.creditAccountId, creditAccount.id))
    .where(whereClause)
    .orderBy(desc(ledgerEntriesTable.createdAt))
    .limit(limitNum)
    .offset(offset);

  res.json({
    entries: entries.map((entry) => {
      const isDebitUser = entry.debitUserId === req.userId!;
      const isCreditUser = entry.creditUserId === req.userId!;
      const direction = isDebitUser && isCreditUser ? "INTERNAL" : isCreditUser ? "IN" : "OUT";
      return {
        ...entry,
        amount: parseFloat(entry.amount),
        direction,
      };
    }),
    total: Number(totalResult.count),
    page: pageNum,
    totalPages: Math.ceil(Number(totalResult.count) / limitNum),
  });
});

router.post("/wallet/deposit", requireAuth as never, async (req: AuthRequest, res) => {
  await ensureLedgerInfra();
  const { amount, currency, paymentMethod, reference, notes, evidenceUrl } = req.body;

  if (!amount || !currency || !paymentMethod) {
    res.status(400).json({ error: "Bad Request", message: "Missing required fields" });
    return;
  }

  if (!SUPPORTED_CURRENCIES.has(String(currency))) {
    res.status(400).json({ error: "Bad Request", message: "Unsupported currency" });
    return;
  }

  if (!SUPPORTED_DEPOSIT_METHODS.has(String(paymentMethod))) {
    res.status(400).json({ error: "Bad Request", message: "Unsupported payment method" });
    return;
  }

  const amountNum = parsePositiveAmount(amount);
  if (amountNum === null) {
    res.status(400).json({ error: "Bad Request", message: "Amount must be a positive finite number" });
    return;
  }

  const rate = FIXED_RATES[String(currency)] ?? 1;
  const amountUsd = amountNum / rate;
  if (amountUsd < MIN_DEPOSIT_USD || amountUsd > MAX_DEPOSIT_USD) {
    res.status(400).json({
      error: "Bad Request",
      message: `Deposit amount must be between $${MIN_DEPOSIT_USD} and $${MAX_DEPOSIT_USD} (USD equivalent)`,
    });
    return;
  }

  const referenceId = reference ? String(reference).trim() : operationRef("DEP");
  if (!referenceId || referenceId.length > 100) {
    res.status(400).json({ error: "Bad Request", message: "Invalid reference format" });
    return;
  }

  let tx: typeof transactionsTable.$inferSelect;
  try {
    tx = await db.transaction(async (txDb) => {
      await ensureWalletAndLedgerAccounts(txDb, req.userId!, "USD");
      if (reference) {
        // Serialize same external reference to guarantee idempotent deposit creation.
        await txDb.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${referenceId}))`);
        const existing = await txDb.select({ id: transactionsTable.id })
          .from(transactionsTable)
          .where(eq(transactionsTable.referenceId, referenceId))
          .limit(1);
        if (existing.length) throw new Error("REFERENCE_CONFLICT");
      }

      const [created] = await txDb.insert(transactionsTable).values({
        userId: req.userId!,
        type: "DEPOSIT",
        amount: amountNum.toFixed(2),
        currency: String(currency),
        amountUsd: amountUsd.toFixed(2),
        status: "PENDING",
        paymentMethod: String(paymentMethod) as PaymentMethodValue,
        referenceId,
        description: notes ? String(notes) : `Deposit via ${paymentMethod}`,
        screenshotUrl: evidenceUrl ? String(evidenceUrl) : null,
        metadata: {
          clientIp: req.ip || null,
          userAgent: req.get("user-agent") || null,
        },
      }).returning();

      await txDb.insert(notificationsTable).values({
        userId: req.userId!,
        type: "DEPOSIT_CREATED",
        title: "Demande de dépôt reçue",
        message: `Votre demande de dépôt de ${amountNum} ${currency} est en cours de traitement.`,
        category: "financial",
        actionUrl: "/history",
        read: false,
      });
      return created;
    });
  } catch (error) {
    const err = error as { code?: string; constraint?: string; message?: string } | undefined;
    const msg = err?.message || "";
    if (msg === "REFERENCE_CONFLICT" || err?.code === "23505" || err?.constraint === "uq_transactions_reference_id" || msg.toLowerCase().includes("uq_transactions_reference_id")) {
      res.status(409).json({ error: "Conflict", message: "This payment reference already exists" });
      return;
    }
    throw error;
  }

  res.status(201).json({
    id: tx.id,
    type: tx.type,
    amount: parseFloat(tx.amount),
    currency: tx.currency,
    amountUsd: parseFloat(tx.amountUsd),
    status: tx.status,
    paymentMethod: tx.paymentMethod,
    referenceId: tx.referenceId,
    fromBoard: tx.fromBoard,
    description: tx.description,
    createdAt: tx.createdAt,
    updatedAt: tx.updatedAt,
  });
});

router.post("/wallet/withdraw/request-otp", requireAuth as never, async (req: AuthRequest, res) => {
  await ensureOtpInfra();
  await ensureLedgerInfra();
  const { amount, currency } = req.body;
  const kycGate = await requireWithdrawKycApproved(req.userId!);
  if (kycGate) {
    res.status(kycGate.status).json({ error: "Forbidden", message: kycGate.message, code: "KYC_REQUIRED_FOR_WITHDRAWAL" });
    return;
  }

  if (!amount || !currency) {
    res.status(400).json({ error: "Bad Request", message: "Missing required fields" });
    return;
  }
  if (!SUPPORTED_CURRENCIES.has(String(currency))) {
    res.status(400).json({ error: "Bad Request", message: "Unsupported currency" });
    return;
  }
  const amountNum = parsePositiveAmount(amount);
  if (amountNum === null) {
    res.status(400).json({ error: "Bad Request", message: "Amount must be a positive finite number" });
    return;
  }
  const rate = FIXED_RATES[String(currency)] ?? 1;
  const amountUsd = amountNum / rate;
  if (amountUsd < MIN_WITHDRAW_USD || amountUsd > MAX_WITHDRAW_USD) {
    res.status(400).json({
      error: "Bad Request",
      message: `Withdrawal amount must be between $${MIN_WITHDRAW_USD} and $${MAX_WITHDRAW_USD} (USD equivalent)`,
    });
    return;
  }

  await db.transaction(async (tx) => {
    await ensureWalletAndLedgerAccounts(tx, req.userId!, "USD");
  });

  const wallets = await db.select().from(walletsTable).where(eq(walletsTable.userId, req.userId!)).limit(1);
  if (!wallets.length || parseFloat(wallets[0].balanceUsd) < amountUsd) {
    res.status(400).json({ error: "Bad Request", message: "Insufficient funds" });
    return;
  }

  const code = generateOtp();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(otpCodesTable)
      .set({ consumedAt: now })
      .where(and(
        eq(otpCodesTable.userId, req.userId!),
        eq(otpCodesTable.purpose, "WITHDRAWAL"),
        isNull(otpCodesTable.consumedAt),
      ));

    await tx.insert(otpCodesTable).values({
      userId: req.userId!,
      purpose: "WITHDRAWAL",
      codeHash: hashOtp(code),
      amountUsd: amountUsd.toFixed(2),
      attempts: 0,
      maxAttempts: 5,
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
    });
  });

  // In production send via SMS/email; in development/demo mode return in response for testing
  const isDemoMode = process.env.NODE_ENV !== "production";
  res.json({
    message: isDemoMode ? "OTP sent (demo mode)" : "OTP sent to your registered contact",
    ...(isDemoMode ? { otp: code } : {}),
    expiresInSeconds: 600,
  });
});

router.post("/wallet/withdraw", requireAuth as never, async (req: AuthRequest, res) => {
  await ensureOtpInfra();
  await ensureLedgerInfra();
  const { amount, currency, paymentMethod, destination, otp } = req.body;
  const kycGate = await requireWithdrawKycApproved(req.userId!);
  if (kycGate) {
    res.status(kycGate.status).json({ error: "Forbidden", message: kycGate.message, code: "KYC_REQUIRED_FOR_WITHDRAWAL" });
    return;
  }

  if (!otp) {
    res.status(400).json({ error: "Bad Request", message: "OTP is required" });
    return;
  }

  if (!amount || !currency || !paymentMethod || !destination) {
    res.status(400).json({ error: "Bad Request", message: "Missing required fields" });
    return;
  }

  if (!SUPPORTED_CURRENCIES.has(String(currency))) {
    res.status(400).json({ error: "Bad Request", message: "Unsupported currency" });
    return;
  }

  if (!SUPPORTED_WITHDRAW_METHODS.has(String(paymentMethod))) {
    res.status(400).json({ error: "Bad Request", message: "Unsupported payment method" });
    return;
  }

  const amountNum = parsePositiveAmount(amount);
  if (amountNum === null) {
    res.status(400).json({ error: "Bad Request", message: "Amount must be a positive finite number" });
    return;
  }
  const destinationValue = String(destination).trim();
  if (!destinationValue || destinationValue.length > 200) {
    res.status(400).json({ error: "Bad Request", message: "Invalid destination format" });
    return;
  }

  const rate = FIXED_RATES[String(currency)] ?? 1;
  const amountUsd = amountNum / rate;
  if (amountUsd < MIN_WITHDRAW_USD || amountUsd > MAX_WITHDRAW_USD) {
    res.status(400).json({
      error: "Bad Request",
      message: `Withdrawal amount must be between $${MIN_WITHDRAW_USD} and $${MAX_WITHDRAW_USD} (USD equivalent)`,
    });
    return;
  }
  let createdTransaction: typeof transactionsTable.$inferSelect | null = null;
  try {
    createdTransaction = await db.transaction(async (tx) => {
      const otpRows = await tx.select()
        .from(otpCodesTable)
        .where(and(
          eq(otpCodesTable.userId, req.userId!),
          eq(otpCodesTable.purpose, "WITHDRAWAL"),
          isNull(otpCodesTable.consumedAt),
        ))
        .orderBy(desc(otpCodesTable.createdAt))
        .for("update")
        .limit(1);

      if (!otpRows.length) throw new Error("NO_OTP");
      const otpRow = otpRows[0];
      const now = new Date();

      if (now > otpRow.expiresAt) {
        await tx.update(otpCodesTable).set({ consumedAt: now }).where(eq(otpCodesTable.id, otpRow.id));
        throw new Error("OTP_EXPIRED");
      }

      const attemptsAfter = otpRow.attempts + 1;
      if (attemptsAfter > otpRow.maxAttempts) {
        await tx.update(otpCodesTable)
          .set({ attempts: attemptsAfter, consumedAt: now })
          .where(eq(otpCodesTable.id, otpRow.id));
        throw new Error("OTP_TOO_MANY_ATTEMPTS");
      }

      if (otpRow.codeHash !== hashOtp(String(otp))) {
        await tx.update(otpCodesTable)
          .set({ attempts: attemptsAfter })
          .where(eq(otpCodesTable.id, otpRow.id));
        throw new Error("OTP_INVALID");
      }

      if (otpRow.amountUsd === null || Math.abs(amountUsd - parseFloat(otpRow.amountUsd)) > 0.01) {
        await tx.update(otpCodesTable)
          .set({ attempts: attemptsAfter, consumedAt: now })
          .where(eq(otpCodesTable.id, otpRow.id));
        throw new Error("OTP_AMOUNT_MISMATCH");
      }

      await ensureWalletAndLedgerAccounts(tx, req.userId!, "USD");

      const wallets = await tx.select()
        .from(walletsTable)
        .where(eq(walletsTable.userId, req.userId!))
        .for("update")
        .limit(1);
      if (!wallets.length) throw new Error("WALLET_NOT_FOUND");

      const currentBalance = parseFloat(wallets[0].balanceUsd);
      if (currentBalance < amountUsd) throw new Error("INSUFFICIENT_FUNDS");

      const [insertedTx] = await tx.insert(transactionsTable).values({
        userId: req.userId!,
        type: "WITHDRAWAL",
        amount: amountNum.toFixed(2),
        currency: String(currency),
        amountUsd: amountUsd.toFixed(2),
        status: "PROCESSING",
        paymentMethod: String(paymentMethod) as PaymentMethodValue,
        referenceId: operationRef("WDR"),
        description: `Withdrawal to ${destinationValue}`,
        metadata: {
          destination: destinationValue,
          clientIp: req.ip || null,
          userAgent: req.get("user-agent") || null,
        },
      }).returning();

      await moveAvailableToBlocked(tx, {
        userId: req.userId!,
        transactionId: insertedTx.id,
        amountUsd,
        currency: "USD",
        idempotencyKey: `withdraw:hold:${insertedTx.id}`,
        description: `Withdrawal hold for ${insertedTx.referenceId || insertedTx.id}`,
        metadata: {
          destination: destinationValue,
          phase: "WITHDRAW_HOLD",
        },
      });

      await tx.insert(notificationsTable).values({
        userId: req.userId!,
        type: "WITHDRAWAL_CREATED",
        title: "Retrait en cours",
        message: `Votre retrait de ${amountNum} ${currency} est en cours de traitement.`,
        category: "financial",
        actionUrl: "/history",
        read: false,
      });

      await tx.update(otpCodesTable)
        .set({ attempts: attemptsAfter, consumedAt: now })
        .where(eq(otpCodesTable.id, otpRow.id));

      return insertedTx;
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "WITHDRAW_FAILED";
    if (reason === "NO_OTP") {
      res.status(400).json({ error: "Bad Request", message: "No pending OTP. Request a new one." });
      return;
    }
    if (reason === "OTP_EXPIRED") {
      res.status(400).json({ error: "Bad Request", message: "OTP expired. Request a new one." });
      return;
    }
    if (reason === "OTP_TOO_MANY_ATTEMPTS") {
      res.status(429).json({ error: "Too Many Requests", message: "Too many OTP attempts. Request a new one." });
      return;
    }
    if (reason === "OTP_INVALID") {
      res.status(400).json({ error: "Bad Request", message: "Invalid OTP" });
      return;
    }
    if (reason === "OTP_AMOUNT_MISMATCH") {
      res.status(400).json({ error: "Bad Request", message: "Withdrawal amount does not match OTP request. Please request a new OTP." });
      return;
    }
    if (reason === "WALLET_NOT_FOUND") {
      res.status(400).json({ error: "Bad Request", message: "Wallet not found" });
      return;
    }
    if (reason === "INSUFFICIENT_FUNDS") {
      res.status(400).json({ error: "Bad Request", message: "Insufficient funds" });
      return;
    }
    throw error;
  }

  const tx = createdTransaction!;

  res.status(201).json({
    id: tx.id,
    type: tx.type,
    amount: parseFloat(tx.amount),
    currency: tx.currency,
    amountUsd: parseFloat(tx.amountUsd),
    status: tx.status,
    paymentMethod: tx.paymentMethod,
    referenceId: tx.referenceId,
    fromBoard: tx.fromBoard,
    description: tx.description,
    createdAt: tx.createdAt,
    updatedAt: tx.updatedAt,
  });
});

router.post("/wallet/convert", requireAuth as never, async (req: AuthRequest, res) => {
  const { amount, fromCurrency, toCurrency } = req.body;

  if (!amount || !fromCurrency || !toCurrency) {
    res.status(400).json({ error: "Bad Request", message: "Missing fields" });
    return;
  }

  if (!SUPPORTED_CURRENCIES.has(String(fromCurrency)) || !SUPPORTED_CURRENCIES.has(String(toCurrency))) {
    res.status(400).json({ error: "Bad Request", message: "Unsupported currency" });
    return;
  }

  if (String(fromCurrency) === String(toCurrency)) {
    res.status(400).json({ error: "Bad Request", message: "Cannot convert to the same currency" });
    return;
  }

  const amountNum = parsePositiveAmount(amount);
  if (amountNum === null) {
    res.status(400).json({ error: "Bad Request", message: "Amount must be a positive finite number" });
    return;
  }

  const fromRate = FIXED_RATES[String(fromCurrency)] ?? 1;
  const toRate = FIXED_RATES[String(toCurrency)] ?? 1;
  const amountUsd = amountNum / fromRate;
  const fee = amountUsd * 0.01;
  const convertedAmountUsd = amountUsd - fee;
  const convertedAmount = convertedAmountUsd * toRate;

  try {
    await db.transaction(async (tx) => {
      const wallets = await tx.select().from(walletsTable)
        .where(eq(walletsTable.userId, req.userId!))
        .for("update")
        .limit(1);
      if (!wallets.length) throw new Error("WALLET_NOT_FOUND");

      const wallet = wallets[0];
      const currentBalance = parseFloat(wallet.balanceUsd);
      if (currentBalance < amountUsd) throw new Error("INSUFFICIENT_FUNDS");

      await tx.update(walletsTable)
        .set({ balanceUsd: (currentBalance - amountUsd + convertedAmountUsd).toFixed(2) })
        .where(eq(walletsTable.userId, req.userId!));

      await tx.insert(transactionsTable).values({
        userId: req.userId!,
        type: "CONVERSION",
        amount: amountNum.toFixed(2),
        currency: String(fromCurrency),
        amountUsd: amountUsd.toFixed(2),
        status: "COMPLETED",
        paymentMethod: "SYSTEM",
        description: `Converted ${amountNum} ${fromCurrency} → ${convertedAmount.toFixed(6)} ${toCurrency} (fee: $${fee.toFixed(2)})`,
      });
    });

    res.json({
      success: true,
      convertedAmount: parseFloat(convertedAmount.toFixed(6)),
      fromCurrency: String(fromCurrency),
      toCurrency: String(toCurrency),
      rate: toRate / fromRate,
      fee: parseFloat(fee.toFixed(2)),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "WALLET_NOT_FOUND") {
      res.status(400).json({ error: "Bad Request", message: "Wallet not found" });
    } else if (msg === "INSUFFICIENT_FUNDS") {
      res.status(400).json({ error: "Bad Request", message: "Insufficient funds for conversion" });
    } else {
      console.error("Conversion error:", err);
      res.status(500).json({ error: "Internal Server Error", message: "Conversion failed" });
    }
  }
});

export default router;
