import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  walletsTable,
  transactionsTable,
  notificationsTable,
  ledgerEntriesTable,
  ledgerAccountsTable,
} from "@workspace/db";
import { eq, desc, and, sql, or, aliasedTable, count } from "drizzle-orm";
import { requireActiveAuth as requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { randomUUID } from "crypto";
import {
  ensureLedgerInfra,
  ensureWalletAndLedgerAccounts,
  moveAvailableToBlocked,
} from "../lib/ledger.js";
import { getNumberSetting, getSystemSetting } from "../services/system-config.js";
import {
  enabledDepositMethods,
  enabledWithdrawMethods,
  normalizePaymentRuntimeConfig,
  PAYMENT_RUNTIME_DEFAULTS,
} from "../services/payment-config.js";

type PaymentMethodValue = "MONCASH" | "NATCASH" | "CARD" | "BANK_TRANSFER" | "CRYPTO" | "PAYPAL" | "SYSTEM";

const router: IRouter = Router();

function operationRef(prefix: "DEP" | "WDR"): string {
  return `${prefix}-${randomUUID()}`;
}

function amountLimit(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (!raw) return fallback;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const MIN_DEPOSIT_USD = amountLimit("MIN_DEPOSIT_USD", 2);
const MAX_DEPOSIT_USD = amountLimit("MAX_DEPOSIT_USD", 10000);
const MIN_WITHDRAW_USD = amountLimit("MIN_WITHDRAW_USD", 3);
const MAX_WITHDRAW_USD = amountLimit("MAX_WITHDRAW_USD", 5000);

const SUPPORTED_CURRENCIES = new Set(["USD", "HTG", "EUR", "GBP", "CAD", "BTC", "ETH", "USDT", "USDC", "MATIC", "BNB"]);
const BASE_DEPOSIT_METHODS = ["MONCASH", "NATCASH", "CARD", "CRYPTO"] as const;
const BASE_WITHDRAW_METHODS = ["MONCASH", "NATCASH", "CRYPTO"] as const;
const MATIC_PER_USD = Number.parseFloat(process.env.MATIC_PER_USD || "1.1");

const FIXED_RATES: Record<string, number> = {
  USD: 1,
  HTG: 140,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.36,
  BTC: 0.000015,
  ETH: 0.00044,
  USDT: 1,
  USDC: 1,
  MATIC: Number.isFinite(MATIC_PER_USD) && MATIC_PER_USD > 0 ? MATIC_PER_USD : 1.1,
};

function parsePositiveAmount(value: unknown): number | null {
  const num = typeof value === "string" ? parseFloat(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

async function getPaymentRuntimeConfig() {
  const raw = await getSystemSetting<unknown>("payment_runtime_config", PAYMENT_RUNTIME_DEFAULTS);
  return normalizePaymentRuntimeConfig(raw);
}

async function getEnabledDepositMethods(): Promise<Set<string>> {
  const config = await getPaymentRuntimeConfig();
  const defaults = new Set(BASE_DEPOSIT_METHODS);
  const list = enabledDepositMethods(config).filter((m) => defaults.has(m as (typeof BASE_DEPOSIT_METHODS)[number]));
  return new Set(list);
}

async function getEnabledWithdrawMethods(): Promise<Set<string>> {
  const config = await getPaymentRuntimeConfig();
  const defaults = new Set(BASE_WITHDRAW_METHODS);
  const list = enabledWithdrawMethods(config).filter((m) => defaults.has(m as (typeof BASE_WITHDRAW_METHODS)[number]));
  return new Set(list);
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

router.get("/wallet/payment-methods", requireAuth as never, async (_req: AuthRequest, res) => {
  const depositMethods = [...await getEnabledDepositMethods()];
  const withdrawMethods = [...await getEnabledWithdrawMethods()];
  res.json({
    depositMethods,
    withdrawMethods,
  });
});

router.get("/wallet/payment-config", requireAuth as never, async (_req: AuthRequest, res) => {
  const config = await getPaymentRuntimeConfig();
  res.json({
    config,
    depositMethods: [...await getEnabledDepositMethods()],
    withdrawMethods: [...await getEnabledWithdrawMethods()],
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
  const { amount, currency, paymentMethod, reference, notes, evidenceUrl, cryptoAsset } = req.body;

  if (!amount || !currency || !paymentMethod) {
    res.status(400).json({ error: "Bad Request", message: "Missing required fields" });
    return;
  }

  if (!SUPPORTED_CURRENCIES.has(String(currency))) {
    res.status(400).json({ error: "Bad Request", message: "Unsupported currency" });
    return;
  }

  const paymentMethodNormalized = String(paymentMethod).toUpperCase();
  const enabledDepositMethods = await getEnabledDepositMethods();
  if (!enabledDepositMethods.has(paymentMethodNormalized)) {
    res.status(400).json({ error: "Bad Request", message: "Unsupported payment method" });
    return;
  }
  const paymentRuntime = await getPaymentRuntimeConfig();
  const methodRuntime = paymentRuntime.deposit[paymentMethodNormalized];
  if (!methodRuntime) {
    res.status(400).json({ error: "Bad Request", message: "Unsupported payment method configuration" });
    return;
  }
  if (paymentMethodNormalized === "CARD") {
    res.status(400).json({
      error: "Bad Request",
      message: "Card deposits must be completed from the external payment link.",
    });
    return;
  }

  const evidenceValue = String(evidenceUrl || "").trim();
  const referenceValue = String(reference || "").trim();
  if (methodRuntime.requireReference && !referenceValue) {
    res.status(400).json({ error: "Bad Request", message: "Transaction ID / reference is required for this deposit method" });
    return;
  }
  if (methodRuntime.requireScreenshot && !evidenceValue) {
    res.status(400).json({ error: "Bad Request", message: "Screenshot upload is required for this deposit method" });
    return;
  }

  let cryptoSelection: { symbol: string; network: string; address?: string } | null = null;
  if (paymentMethodNormalized === "CRYPTO") {
    if (String(currency).toUpperCase() !== "USD") {
      res.status(400).json({
        error: "Bad Request",
        message: "For crypto deposits, amount currency must be USD.",
      });
      return;
    }
    const assets = methodRuntime.assets || [];
    if (!assets.length) {
      res.status(400).json({ error: "Bad Request", message: "No crypto network configured by admin for manual deposits" });
      return;
    }
    const requested = String(cryptoAsset || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const preferred = assets.find((a) => `${a.symbol}_${a.network}`.toUpperCase() === requested) || assets[0];
    cryptoSelection = preferred ? { ...preferred } : null;
  }

  const amountNum = parsePositiveAmount(amount);
  if (amountNum === null) {
    res.status(400).json({ error: "Bad Request", message: "Amount must be a positive finite number" });
    return;
  }

  const rate = FIXED_RATES[String(currency)] ?? 1;
  const amountUsd = amountNum / rate;
  const minDepositUsd = await getNumberSetting("min_deposit_usd", MIN_DEPOSIT_USD);
  if (amountUsd < minDepositUsd || amountUsd > MAX_DEPOSIT_USD) {
    res.status(400).json({
      error: "Bad Request",
      message: `Deposit amount must be between $${minDepositUsd} and $${MAX_DEPOSIT_USD} (USD equivalent)`,
    });
    return;
  }

  const referenceId = referenceValue || operationRef("DEP");
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
        paymentMethod: paymentMethodNormalized as PaymentMethodValue,
        referenceId,
        description: notes ? String(notes) : `Deposit via ${paymentMethod}`,
        screenshotUrl: evidenceValue || null,
        metadata: {
          clientIp: req.ip || null,
          userAgent: req.get("user-agent") || null,
          ...(cryptoSelection ? { cryptoAsset: `${cryptoSelection.symbol}_${cryptoSelection.network}`, cryptoAddress: cryptoSelection.address || null } : {}),
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

  let checkoutUrl: string | null = null;
  let cryptoInstructions: Record<string, unknown> | null = null;
  if (paymentMethodNormalized === "CRYPTO" && cryptoSelection) {
    cryptoInstructions = {
      mode: "manual",
      symbol: cryptoSelection.symbol,
      network: cryptoSelection.network,
      address: cryptoSelection.address || "",
      note: "Manual crypto deposit: submit tx id + screenshot, admin confirms.",
    };
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
    checkoutUrl,
    cryptoInstructions,
    createdAt: tx.createdAt,
    updatedAt: tx.updatedAt,
  });
});

router.post("/wallet/withdraw", requireAuth as never, async (req: AuthRequest, res) => {
  await ensureLedgerInfra();
  const { amount, currency, paymentMethod, destination, cryptoAsset, recipientName, recipientPhone, destinationAddress } = req.body;

  if (!amount || !currency || !paymentMethod) {
    res.status(400).json({ error: "Bad Request", message: "Missing required fields" });
    return;
  }

  if (!SUPPORTED_CURRENCIES.has(String(currency))) {
    res.status(400).json({ error: "Bad Request", message: "Unsupported currency" });
    return;
  }

  const paymentMethodNormalized = String(paymentMethod).toUpperCase();
  const enabledWithdrawMethods = await getEnabledWithdrawMethods();
  if (!enabledWithdrawMethods.has(paymentMethodNormalized)) {
    res.status(400).json({ error: "Bad Request", message: "Unsupported payment method" });
    return;
  }

  const paymentRuntime = await getPaymentRuntimeConfig();
  const methodRuntime = paymentRuntime.withdraw[paymentMethodNormalized];
  if (!methodRuntime) {
    res.status(400).json({ error: "Bad Request", message: "Unsupported payment method configuration" });
    return;
  }

  let selectedCryptoAsset: { symbol: string; network: string; address?: string } | null = null;
  if (paymentMethodNormalized === "CRYPTO") {
    const assets = methodRuntime.assets || [];
    if (!assets.length) {
      res.status(400).json({ error: "Bad Request", message: "No crypto network configured by admin for withdrawal" });
      return;
    }
    const requested = String(cryptoAsset || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "_");
    selectedCryptoAsset = assets.find((a) => `${a.symbol}_${a.network}`.toUpperCase() === requested) || assets[0];
    if (!selectedCryptoAsset) {
      res.status(400).json({
        error: "Bad Request",
        message: "Invalid or unsupported crypto asset for withdrawal",
      });
      return;
    }
  }

  const amountNum = parsePositiveAmount(amount);
  if (amountNum === null) {
    res.status(400).json({ error: "Bad Request", message: "Amount must be a positive finite number" });
    return;
  }
  const recipientNameValue = String(recipientName || "").trim();
  const recipientPhoneValue = String(recipientPhone || "").trim();
  const destinationAddressValue = String(destinationAddress || destination || "").trim();
  const destinationValue = (() => {
    if (paymentMethodNormalized === "CRYPTO") return destinationAddressValue;
    if (paymentMethodNormalized === "MONCASH" || paymentMethodNormalized === "NATCASH") {
      return `${recipientNameValue} (${recipientPhoneValue})`;
    }
    return String(destination || "").trim();
  })();
  if (paymentMethodNormalized === "MONCASH" || paymentMethodNormalized === "NATCASH") {
    if (!recipientNameValue || !recipientPhoneValue) {
      res.status(400).json({ error: "Bad Request", message: "Recipient name and phone are required for this withdrawal method" });
      return;
    }
  }
  if (paymentMethodNormalized === "CRYPTO" && !destinationAddressValue) {
    res.status(400).json({ error: "Bad Request", message: "Destination address is required for crypto withdrawals" });
    return;
  }
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
        status: "PENDING",
        paymentMethod: paymentMethodNormalized as PaymentMethodValue,
        referenceId: operationRef("WDR"),
        description: `Withdrawal to ${destinationValue}`,
        metadata: {
          destination: destinationValue,
          clientIp: req.ip || null,
          userAgent: req.get("user-agent") || null,
          ...(selectedCryptoAsset ? { cryptoAsset: `${selectedCryptoAsset.symbol}_${selectedCryptoAsset.network}` } : {}),
          ...(recipientNameValue ? { recipientName: recipientNameValue } : {}),
          ...(recipientPhoneValue ? { recipientPhone: recipientPhoneValue } : {}),
          ...(destinationAddressValue ? { destinationAddress: destinationAddressValue } : {}),
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

      return insertedTx;
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "WITHDRAW_FAILED";
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

  let tx = createdTransaction!;

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
    processingMode: "manual",
    providerDispatch: null,
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
