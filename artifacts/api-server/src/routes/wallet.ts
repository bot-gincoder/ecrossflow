import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { walletsTable, transactionsTable, usersTable, notificationsTable } from "@workspace/db";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { requireActiveAuth as requireAuth, type AuthRequest } from "../middlewares/auth.js";

type PaymentMethodValue = "MONCASH" | "NATCASH" | "CARD" | "BANK_TRANSFER" | "CRYPTO" | "PAYPAL" | "SYSTEM";

const router: IRouter = Router();

// In-memory OTP store: userId -> { code, expiresAt, amountUsd }
const withdrawalOtpStore = new Map<string, { code: string; expiresAt: number; amountUsd: number }>();

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

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

router.get("/wallet", requireAuth as never, async (req: AuthRequest, res) => {
  const wallets = await db.select().from(walletsTable).where(eq(walletsTable.userId, req.userId!)).limit(1);
  if (!wallets.length) {
    await db.insert(walletsTable).values({
      userId: req.userId!,
      balanceUsd: "0",
      balancePending: "0",
      balanceReserved: "0",
    });
    res.json({ balanceUsd: 0, balancePending: 0, balanceReserved: 0, totalBalance: 0 });
    return;
  }
  const w = wallets[0];
  const balanceUsd = parseFloat(w.balanceUsd);
  const balancePending = parseFloat(w.balancePending);
  const balanceReserved = parseFloat(w.balanceReserved);
  res.json({
    balanceUsd,
    balancePending,
    balanceReserved,
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

router.post("/wallet/deposit", requireAuth as never, async (req: AuthRequest, res) => {
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

  const [tx] = await db.insert(transactionsTable).values({
    userId: req.userId!,
    type: "DEPOSIT",
    amount: amountNum.toFixed(2),
    currency: String(currency),
    amountUsd: amountUsd.toFixed(2),
    status: "PENDING",
    paymentMethod: String(paymentMethod) as PaymentMethodValue,
    referenceId: reference ? String(reference) : null,
    description: notes ? String(notes) : `Deposit via ${paymentMethod}`,
    screenshotUrl: evidenceUrl ? String(evidenceUrl) : null,
  }).returning();

  await db.insert(notificationsTable).values({
    userId: req.userId!,
    type: "DEPOSIT_CREATED",
    title: "Demande de dépôt reçue",
    message: `Votre demande de dépôt de ${amountNum} ${currency} est en cours de traitement.`,
    category: "financial",
    actionUrl: "/history",
    read: false,
  });

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
  const { amount, currency } = req.body;

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

  const wallets = await db.select().from(walletsTable).where(eq(walletsTable.userId, req.userId!)).limit(1);
  if (!wallets.length || parseFloat(wallets[0].balanceUsd) < amountUsd) {
    res.status(400).json({ error: "Bad Request", message: "Insufficient funds" });
    return;
  }

  const code = generateOtp();
  // OTP valid for 10 minutes
  withdrawalOtpStore.set(req.userId!, { code, expiresAt: Date.now() + 10 * 60 * 1000, amountUsd });

  // In production send via SMS/email; in development/demo mode return in response for testing
  const isDemoMode = process.env.NODE_ENV !== "production";
  res.json({
    message: isDemoMode ? "OTP sent (demo mode)" : "OTP sent to your registered contact",
    ...(isDemoMode ? { otp: code } : {}),
    expiresInSeconds: 600,
  });
});

router.post("/wallet/withdraw", requireAuth as never, async (req: AuthRequest, res) => {
  const { amount, currency, paymentMethod, destination, otp } = req.body;

  if (!otp) {
    res.status(400).json({ error: "Bad Request", message: "OTP is required" });
    return;
  }

  // Verify OTP
  const stored = withdrawalOtpStore.get(req.userId!);
  if (!stored) {
    res.status(400).json({ error: "Bad Request", message: "No pending OTP. Request a new one." });
    return;
  }
  if (Date.now() > stored.expiresAt) {
    withdrawalOtpStore.delete(req.userId!);
    res.status(400).json({ error: "Bad Request", message: "OTP expired. Request a new one." });
    return;
  }
  if (stored.code !== String(otp)) {
    res.status(400).json({ error: "Bad Request", message: "Invalid OTP" });
    return;
  }

  if (!amount || !currency || !paymentMethod || !destination) {
    withdrawalOtpStore.delete(req.userId!);
    res.status(400).json({ error: "Bad Request", message: "Missing required fields" });
    return;
  }

  if (!SUPPORTED_CURRENCIES.has(String(currency))) {
    withdrawalOtpStore.delete(req.userId!);
    res.status(400).json({ error: "Bad Request", message: "Unsupported currency" });
    return;
  }

  if (!SUPPORTED_WITHDRAW_METHODS.has(String(paymentMethod))) {
    withdrawalOtpStore.delete(req.userId!);
    res.status(400).json({ error: "Bad Request", message: "Unsupported payment method" });
    return;
  }

  const amountNum = parsePositiveAmount(amount);
  if (amountNum === null) {
    withdrawalOtpStore.delete(req.userId!);
    res.status(400).json({ error: "Bad Request", message: "Amount must be a positive finite number" });
    return;
  }

  const rate = FIXED_RATES[String(currency)] ?? 1;
  const amountUsd = amountNum / rate;

  // Verify the withdrawal amount matches the OTP request amount (within 1 cent tolerance)
  if (Math.abs(amountUsd - stored.amountUsd) > 0.01) {
    withdrawalOtpStore.delete(req.userId!);
    res.status(400).json({ error: "Bad Request", message: "Withdrawal amount does not match OTP request. Please request a new OTP." });
    return;
  }

  withdrawalOtpStore.delete(req.userId!);

  const wallets = await db.select().from(walletsTable).where(eq(walletsTable.userId, req.userId!)).limit(1);
  if (!wallets.length) {
    res.status(400).json({ error: "Bad Request", message: "Wallet not found" });
    return;
  }

  const currentBalance = parseFloat(wallets[0].balanceUsd);
  if (currentBalance < amountUsd) {
    res.status(400).json({ error: "Bad Request", message: "Insufficient funds" });
    return;
  }

  const newBalance = currentBalance - amountUsd;
  await db.update(walletsTable)
    .set({ balanceUsd: newBalance.toFixed(2), updatedAt: new Date() })
    .where(eq(walletsTable.userId, req.userId!));

  const [tx] = await db.insert(transactionsTable).values({
    userId: req.userId!,
    type: "WITHDRAWAL",
    amount: amountNum.toFixed(2),
    currency: String(currency),
    amountUsd: amountUsd.toFixed(2),
    status: "PROCESSING",
    paymentMethod: String(paymentMethod) as PaymentMethodValue,
    description: `Withdrawal to ${String(destination)}`,
  }).returning();

  await db.insert(notificationsTable).values({
    userId: req.userId!,
    type: "WITHDRAWAL_CREATED",
    title: "Retrait en cours",
    message: `Votre retrait de ${amountNum} ${currency} est en cours de traitement.`,
    category: "financial",
    actionUrl: "/history",
    read: false,
  });

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
