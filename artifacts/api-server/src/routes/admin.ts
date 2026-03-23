import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, walletsTable, transactionsTable, boardInstancesTable, notificationsTable } from "@workspace/db";
import { eq, desc, ilike, and, count, sql, or, ne } from "drizzle-orm";
import { requireAdmin, type AuthRequest } from "../middlewares/auth.js";

const router: IRouter = Router();

router.get("/admin/stats", requireAdmin as any, async (req: AuthRequest, res) => {
  const [totalUsers] = await db.select({ count: count() }).from(usersTable);
  const [activeUsers] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.status, "ACTIVE"));
  const [pendingUsers] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.status, "PENDING"));
  const [activeBoards] = await db.select({ count: count() }).from(boardInstancesTable).where(eq(boardInstancesTable.status, "ACTIVE"));
  const [pendingDeposits] = await db.select({ count: count() }).from(transactionsTable)
    .where(and(eq(transactionsTable.type, "DEPOSIT"), eq(transactionsTable.status, "PENDING")));
  const [pendingWithdrawals] = await db.select({ count: count() }).from(transactionsTable)
    .where(and(eq(transactionsTable.type, "WITHDRAWAL"), eq(transactionsTable.status, "PROCESSING")));

  const platformRevenue = await db.select({ amount: transactionsTable.amountUsd })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.type, "SYSTEM_FEE"), eq(transactionsTable.status, "COMPLETED")));

  const totalRevenue = platformRevenue.reduce((sum, r) => sum + parseFloat(r.amount), 0);

  res.json({
    totalUsers: Number(totalUsers.count),
    activeUsers: Number(activeUsers.count),
    pendingUsers: Number(pendingUsers.count),
    totalVolume24h: 0,
    totalVolume7d: 0,
    activeBoards: Number(activeBoards.count),
    pendingDeposits: Number(pendingDeposits.count),
    pendingWithdrawals: Number(pendingWithdrawals.count),
    totalPlatformRevenue: parseFloat(totalRevenue.toFixed(2)),
  });
});

router.get("/admin/users", requireAdmin as any, async (req: AuthRequest, res) => {
  const { page = "1", limit = "20", search, status } = req.query as Record<string, string>;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  const conditions: any[] = [];
  if (search) conditions.push(or(ilike(usersTable.username, `%${search}%`), ilike(usersTable.email, `%${search}%`)));
  if (status) conditions.push(eq(usersTable.status, status as any));

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

router.put("/admin/users/:id/suspend", requireAdmin as any, async (req: AuthRequest, res) => {
  await db.update(usersTable).set({ status: "SUSPENDED" }).where(eq(usersTable.id, req.params.id));
  res.json({ message: "User suspended" });
});

router.put("/admin/users/:id/activate", requireAdmin as any, async (req: AuthRequest, res) => {
  await db.update(usersTable).set({ status: "ACTIVE", activatedAt: new Date() }).where(eq(usersTable.id, req.params.id));
  res.json({ message: "User activated" });
});

router.post("/admin/users/:id/adjust-balance", requireAdmin as any, async (req: AuthRequest, res) => {
  const { amount, note } = req.body;
  if (!amount || !note) {
    res.status(400).json({ error: "Bad Request", message: "Amount and note required" });
    return;
  }

  const wallets = await db.select().from(walletsTable).where(eq(walletsTable.userId, req.params.id)).limit(1);
  if (!wallets.length) {
    res.status(404).json({ error: "Not Found", message: "Wallet not found" });
    return;
  }

  const currentBalance = parseFloat(wallets[0].balanceUsd);
  const newBalance = currentBalance + parseFloat(amount);
  await db.update(walletsTable)
    .set({ balanceUsd: newBalance.toFixed(2), updatedAt: new Date() })
    .where(eq(walletsTable.userId, req.params.id));

  await db.insert(transactionsTable).values({
    userId: req.params.id,
    type: "SYSTEM_FEE",
    amount: Math.abs(parseFloat(amount)).toFixed(2),
    currency: "USD",
    amountUsd: Math.abs(parseFloat(amount)).toFixed(2),
    status: "COMPLETED",
    paymentMethod: "SYSTEM",
    adminNote: note,
    description: `Admin balance adjustment: ${note}`,
  });

  res.json({ message: "Balance adjusted successfully" });
});

router.get("/admin/deposits/pending", requireAdmin as any, async (req: AuthRequest, res) => {
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

  res.json({
    deposits: pending.map(d => ({
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
    })),
    total: pending.length,
  });
});

router.put("/admin/deposits/:id/approve", requireAdmin as any, async (req: AuthRequest, res) => {
  const txList = await db.select().from(transactionsTable).where(eq(transactionsTable.id, req.params.id)).limit(1);
  if (!txList.length) {
    res.status(404).json({ error: "Not Found" });
    return;
  }
  const tx = txList[0];

  await db.update(transactionsTable).set({ status: "COMPLETED" }).where(eq(transactionsTable.id, req.params.id));

  const wallets = await db.select().from(walletsTable).where(eq(walletsTable.userId, tx.userId)).limit(1);
  if (wallets.length) {
    const newBalance = parseFloat(wallets[0].balanceUsd) + parseFloat(tx.amountUsd);
    await db.update(walletsTable)
      .set({ balanceUsd: newBalance.toFixed(2), updatedAt: new Date() })
      .where(eq(walletsTable.userId, tx.userId));
  }

  await db.insert(notificationsTable).values({
    userId: tx.userId,
    type: "DEPOSIT_APPROVED",
    title: "Dépôt approuvé !",
    message: `Votre dépôt de ${tx.amount} ${tx.currency} a été approuvé et crédité.`,
    category: "financial",
    actionUrl: "/wallet",
    read: false,
  });

  res.json({ message: "Deposit approved" });
});

router.put("/admin/deposits/:id/reject", requireAdmin as any, async (req: AuthRequest, res) => {
  const { reason } = req.body;
  const txList = await db.select().from(transactionsTable).where(eq(transactionsTable.id, req.params.id)).limit(1);
  if (!txList.length) {
    res.status(404).json({ error: "Not Found" });
    return;
  }
  const tx = txList[0];

  await db.update(transactionsTable)
    .set({ status: "CANCELLED", adminNote: reason })
    .where(eq(transactionsTable.id, req.params.id));

  await db.insert(notificationsTable).values({
    userId: tx.userId,
    type: "DEPOSIT_REJECTED",
    title: "Dépôt rejeté",
    message: `Votre dépôt de ${tx.amount} ${tx.currency} a été rejeté. Raison: ${reason}`,
    category: "financial",
    actionUrl: "/wallet",
    read: false,
  });

  res.json({ message: "Deposit rejected" });
});

export default router;
