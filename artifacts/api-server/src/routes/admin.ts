import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, walletsTable, transactionsTable, boardInstancesTable, boardParticipantsTable, boardsTable, notificationsTable } from "@workspace/db";
import { eq, desc, ilike, and, count, or, gte, sql, lt } from "drizzle-orm";
import { requireAdmin, type AuthRequest } from "../middlewares/auth.js";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidId = (id: string) => UUID_RE.test(id);

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
    .where(and(eq(transactionsTable.type, "WITHDRAWAL"), eq(transactionsTable.status, "PROCESSING")));

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
      const wallets = await tx.select().from(walletsTable)
        .where(eq(walletsTable.userId, id))
        .for("update")
        .limit(1);
      if (!wallets.length) throw new Error("WALLET_NOT_FOUND");

      const currentBalance = parseFloat(wallets[0].balanceUsd);
      const newBalance = currentBalance + delta;
      if (newBalance < 0) throw new Error("NEGATIVE_BALANCE");

      await tx.update(walletsTable)
        .set({ balanceUsd: newBalance.toFixed(2), updatedAt: new Date() })
        .where(eq(walletsTable.userId, id));

      await tx.insert(transactionsTable).values({
        userId: id,
        type: "SYSTEM_FEE",
        amount: Math.abs(delta).toFixed(2),
        currency: "USD",
        amountUsd: Math.abs(delta).toFixed(2),
        status: "COMPLETED",
        paymentMethod: "SYSTEM",
        adminNote: String(note),
        description: `${delta > 0 ? "Admin credit" : "Admin debit"}: ${String(note)}`,
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
    if (msg === "NEGATIVE_BALANCE") {
      res.status(400).json({ error: "Bad Request", message: "Adjustment would result in negative balance" });
      return;
    }
    throw error;
  }

  res.json({ message: "Balance adjusted successfully" });
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

      await txDb.update(transactionsTable)
        .set({ status: "COMPLETED", updatedAt: new Date() })
        .where(eq(transactionsTable.id, id));

      const wallets = await txDb.select().from(walletsTable)
        .where(eq(walletsTable.userId, row.userId))
        .for("update")
        .limit(1);
      if (!wallets.length) throw new Error("WALLET_NOT_FOUND");

      const newBalance = parseFloat(wallets[0].balanceUsd) + parseFloat(row.amountUsd);
      await txDb.update(walletsTable)
        .set({ balanceUsd: newBalance.toFixed(2), updatedAt: new Date() })
        .where(eq(walletsTable.userId, row.userId));

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
    if (msg === "WALLET_NOT_FOUND") {
      res.status(404).json({ error: "Not Found", message: "Wallet not found" });
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
  .where(and(eq(transactionsTable.type, "WITHDRAWAL"), eq(transactionsTable.status, "PROCESSING")))
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
  const id = String(req.params.id);
  if (!isValidId(id)) { res.status(400).json({ error: "Bad Request", message: "Invalid ID" }); return; }
  try {
    await db.transaction(async (txDb) => {
      const txRows = await txDb.select().from(transactionsTable)
        .where(and(eq(transactionsTable.id, id), eq(transactionsTable.type, "WITHDRAWAL")))
        .for("update")
        .limit(1);
      if (!txRows.length) throw new Error("NOT_FOUND");
      const row = txRows[0];
      if (row.status !== "PROCESSING") throw new Error(`BAD_STATUS:${row.status}`);

      await txDb.update(transactionsTable)
        .set({ status: "COMPLETED", updatedAt: new Date() })
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
    throw error;
  }

  res.json({ message: "Withdrawal approved" });
});

router.put("/admin/withdrawals/:id/reject", requireAdmin as never, async (req: AuthRequest, res) => {
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
      if (row.status !== "PROCESSING") throw new Error(`BAD_STATUS:${row.status}`);

      await txDb.update(transactionsTable)
        .set({ status: "CANCELLED", adminNote: reason, updatedAt: new Date() })
        .where(eq(transactionsTable.id, id));

      const wallets = await txDb.select().from(walletsTable)
        .where(eq(walletsTable.userId, row.userId))
        .for("update")
        .limit(1);
      if (!wallets.length) throw new Error("WALLET_NOT_FOUND");

      const newBalance = parseFloat(wallets[0].balanceUsd) + parseFloat(row.amountUsd);
      await txDb.update(walletsTable)
        .set({ balanceUsd: newBalance.toFixed(2), updatedAt: new Date() })
        .where(eq(walletsTable.userId, row.userId));

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
