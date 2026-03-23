import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { walletsTable, transactionsTable, usersTable, notificationsTable } from "@workspace/db";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";

const router: IRouter = Router();

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
  const { amount, currency, paymentMethod, reference, notes } = req.body;

  if (!amount || !currency || !paymentMethod) {
    res.status(400).json({ error: "Bad Request", message: "Missing required fields" });
    return;
  }

  const amountNum = parseFloat(amount);
  const rate = FIXED_RATES[currency] || 1;
  const amountUsd = amountNum / rate;

  const status = ["MONCASH", "NATCASH", "BANK_TRANSFER"].includes(paymentMethod) ? "PENDING" : "PROCESSING";

  const [tx] = await db.insert(transactionsTable).values({
    userId: req.userId!,
    type: "DEPOSIT",
    amount: amountNum.toFixed(2),
    currency,
    amountUsd: amountUsd.toFixed(2),
    status,
    paymentMethod,
    referenceId: reference || null,
    description: notes || `Deposit via ${paymentMethod}`,
  }).returning();

  if (status === "PROCESSING") {
    const wallets = await db.select().from(walletsTable).where(eq(walletsTable.userId, req.userId!)).limit(1);
    if (wallets.length) {
      const newBalance = parseFloat(wallets[0].balanceUsd) + amountUsd;
      await db.update(walletsTable)
        .set({ balanceUsd: newBalance.toFixed(2), updatedAt: new Date() })
        .where(eq(walletsTable.userId, req.userId!));

      await db.update(transactionsTable).set({ status: "COMPLETED" }).where(eq(transactionsTable.id, tx.id));
    }
  }

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

router.post("/wallet/withdraw", requireAuth as never, async (req: AuthRequest, res) => {
  const { amount, currency, paymentMethod, destination } = req.body;

  if (!amount || !currency || !paymentMethod || !destination) {
    res.status(400).json({ error: "Bad Request", message: "Missing required fields" });
    return;
  }

  const amountNum = parseFloat(amount);
  const rate = FIXED_RATES[currency] || 1;
  const amountUsd = amountNum / rate;

  const wallets = await db.select().from(walletsTable).where(eq(walletsTable.userId, req.userId!)).limit(1);
  if (!wallets.length || parseFloat(wallets[0].balanceUsd) < amountUsd) {
    res.status(400).json({ error: "Bad Request", message: "Insufficient funds" });
    return;
  }

  const newBalance = parseFloat(wallets[0].balanceUsd) - amountUsd;
  await db.update(walletsTable)
    .set({ balanceUsd: newBalance.toFixed(2), updatedAt: new Date() })
    .where(eq(walletsTable.userId, req.userId!));

  const [tx] = await db.insert(transactionsTable).values({
    userId: req.userId!,
    type: "WITHDRAWAL",
    amount: amountNum.toFixed(2),
    currency,
    amountUsd: amountUsd.toFixed(2),
    status: "PROCESSING",
    paymentMethod,
    description: `Withdrawal to ${destination}`,
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

  const fromRate = FIXED_RATES[fromCurrency] || 1;
  const toRate = FIXED_RATES[toCurrency] || 1;
  const amountNum = parseFloat(amount);
  const amountUsd = amountNum / fromRate;
  const fee = amountUsd * 0.01;
  const convertedAmount = (amountUsd - fee) * toRate;

  res.json({
    convertedAmount: parseFloat(convertedAmount.toFixed(6)),
    rate: toRate / fromRate,
    fee: parseFloat(fee.toFixed(2)),
  });
});

export default router;
