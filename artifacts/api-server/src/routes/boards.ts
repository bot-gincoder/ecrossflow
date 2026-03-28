import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  boardsTable,
  walletsTable,
  transactionsTable,
  usersTable,
  notificationsTable,
} from "@workspace/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { requireActiveAuth as requireAuth, type AuthRequest } from "../middlewares/auth.js";
import {
  BOARD_ORDER,
  assignInvestorQueueNumberIfNeeded,
  computeStrategicLeafNumbers,
  creditActivationReferralBonuses,
  evaluateBoardProgressions,
  fetchValidatedAccounts,
} from "../services/board-network.js";
import { adjustAvailableWithTreasury, ensureLedgerInfra, ensureWalletAndLedgerAccounts } from "../lib/ledger.js";

const router: IRouter = Router();

function parseMoney(value: string | number): number {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

async function hasCompletedDeposit(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], userId: string): Promise<boolean> {
  const rows = await tx.select({ id: transactionsTable.id })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.userId, userId),
      eq(transactionsTable.type, "DEPOSIT"),
      eq(transactionsTable.status, "COMPLETED"),
    ))
    .limit(1);
  return rows.length > 0;
}

async function hasCompletedBoardFPayment(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], userId: string): Promise<boolean> {
  const rows = await tx.execute(sql<{ id: string }>`
    SELECT id
    FROM transactions
    WHERE user_id = ${userId}
      AND type = 'BOARD_PAYMENT'
      AND status = 'COMPLETED'
      AND (
        from_board = 'F'
        OR COALESCE(description, '') ILIKE '%board F%'
      )
    LIMIT 1
  `);
  const items = (rows as unknown as { rows?: Array<{ id: string }> }).rows || [];
  if (items.length) return true;

  // Legacy fallback: if user already has an account number assigned, treat board F as paid.
  const userRows = await tx.select({ accountNumber: usersTable.accountNumber })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (userRows.length && typeof userRows[0].accountNumber === "number" && userRows[0].accountNumber > 0) {
    return true;
  }

  return false;
}

router.get("/boards", requireAuth as never, async (_req: AuthRequest, res) => {
  const boards = await db.select().from(boardsTable).orderBy(asc(boardsTable.rankOrder));
  res.json({
    boards: boards.map((b) => ({
      id: b.id,
      rankOrder: b.rankOrder,
      entryFee: parseMoney(b.entryFee),
      multiplier: b.multiplier,
      totalGain: parseMoney(b.totalGain),
      nextBoardDeduction: parseMoney(b.nextBoardDeduction),
      withdrawable: parseMoney(b.withdrawable),
      description: b.description,
      colorTheme: b.colorTheme,
    })),
  });
});

router.get("/boards/my-status", requireAuth as never, async (req: AuthRequest, res) => {
  const boards = await db.select().from(boardsTable).orderBy(asc(boardsTable.rankOrder));
  const users = await db.select({
    id: usersTable.id,
    accountNumber: usersTable.accountNumber,
    currentBoard: usersTable.currentBoard,
  }).from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);

  if (!users.length) {
    res.status(404).json({ error: "Not Found", message: "User not found" });
    return;
  }

  const me = users[0];
  const currentBoard = (me.currentBoard || "F").toUpperCase();
  const currentIdx = BOARD_ORDER.indexOf(currentBoard as (typeof BOARD_ORDER)[number]);

  const validatedUsers = await fetchValidatedAccounts();
  const meValidated = validatedUsers.some((u) => u.id === me.id);
  const hasNumber = typeof me.accountNumber === "number" && me.accountNumber > 0;

  const statuses = boards.map((board) => {
    const idx = BOARD_ORDER.indexOf(board.id as (typeof BOARD_ORDER)[number]);

    if (!meValidated && board.id === "F") {
      return {
        boardId: board.id,
        completed: false,
        role: null,
        instanceId: null,
        amountPaid: null,
        joinedAt: null,
      };
    }

    if (!meValidated && board.id !== "F") {
      return {
        boardId: board.id,
        completed: false,
        role: null,
        instanceId: null,
        amountPaid: null,
        joinedAt: null,
      };
    }

    if (idx >= 0 && currentIdx >= 0 && idx < currentIdx) {
      return {
        boardId: board.id,
        completed: true,
        role: "RANKER",
        instanceId: `virtual-${board.id}-${me.accountNumber || "na"}`,
        amountPaid: parseMoney(board.entryFee),
        joinedAt: null,
      };
    }

    if (idx === currentIdx) {
      return {
        boardId: board.id,
        completed: false,
        role: hasNumber ? "RANKER" : "STARTER",
        instanceId: `virtual-${board.id}-${me.accountNumber || "na"}`,
        amountPaid: meValidated ? parseMoney(board.entryFee) : null,
        joinedAt: null,
      };
    }

    return {
      boardId: board.id,
      completed: false,
      role: null,
      instanceId: null,
      amountPaid: null,
      joinedAt: null,
    };
  });

  res.json({ statuses });
});

router.get("/boards/:boardId/instance", requireAuth as never, async (req: AuthRequest, res) => {
  const boardId = String(req.params.boardId || "F").toUpperCase();
  if (!BOARD_ORDER.includes(boardId as (typeof BOARD_ORDER)[number])) {
    res.status(404).json({ error: "Not Found", message: "Board not found" });
    return;
  }

  const users = await db.select({
    id: usersTable.id,
    accountNumber: usersTable.accountNumber,
    currentBoard: usersTable.currentBoard,
    username: usersTable.username,
    avatarUrl: usersTable.avatarUrl,
  }).from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);

  if (!users.length || !users[0].accountNumber) {
    res.status(404).json({ error: "Not Found", message: "No active strategic instance" });
    return;
  }

  const me = users[0];
  const rootNumber = Number(me.accountNumber);
  const numbers = computeStrategicLeafNumbers(rootNumber);
  const validatedUsers = await fetchValidatedAccounts();
  const byNumber = new Map(validatedUsers.map((u) => [u.accountNumber, u]));

  const slotUsers = [
    { role: "RANKER", position: 0, number: numbers.n1 },
    { role: "LEADER", position: 1, number: numbers.n2 },
    { role: "LEADER", position: 2, number: numbers.n3 },
    { role: "CHALLENGER", position: 1, number: numbers.n6 },
    { role: "CHALLENGER", position: 2, number: numbers.n7 },
    { role: "CHALLENGER", position: 3, number: numbers.n4 },
    { role: "CHALLENGER", position: 4, number: numbers.n5 },
    { role: "STARTER", position: 1, number: numbers.n8 },
    { role: "STARTER", position: 2, number: numbers.n9 },
    { role: "STARTER", position: 3, number: numbers.n10 },
    { role: "STARTER", position: 4, number: numbers.n11 },
    { role: "STARTER", position: 5, number: numbers.n4_2 },
    { role: "STARTER", position: 6, number: numbers.n4_2p1 },
    { role: "STARTER", position: 7, number: numbers.n5_2 },
    { role: "STARTER", position: 8, number: numbers.n5_2p1 },
  ] as const;

  const participants = slotUsers
    .map((s, idx) => {
      const u = byNumber.get(s.number);
      if (!u) return null;
      return {
        id: `${boardId}-${rootNumber}-${idx}`,
        userId: u.id,
        role: s.role,
        position: s.position,
        paidAt: u.activatedAt || u.createdAt,
        username: u.username,
        avatarUrl: null,
      };
    })
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const ranker = participants.find((p) => p.role === "RANKER") || {
    id: me.id,
    userId: me.id,
    username: me.username,
    avatarUrl: me.avatarUrl,
    role: "RANKER" as const,
    position: 0,
    paidAt: new Date(),
  };

  res.json({
    id: `virtual-${boardId}-${rootNumber}`,
    boardId,
    instanceNumber: rootNumber,
    ranker,
    status: "ACTIVE",
    slotsFilled: participants.filter((p) => p.role === "STARTER").length,
    totalCollected: participants.length,
    participants,
    createdAt: new Date(),
    completedAt: null,
  });
});

router.post("/boards/:boardId/pay", requireAuth as never, async (req: AuthRequest, res) => {
  await ensureLedgerInfra();
  const boardId = String(req.params.boardId || "").toUpperCase();
  if (boardId !== "F") {
    res.status(403).json({
      error: "Forbidden",
      message: "This level is unlocked automatically by progression. Only Board F can be paid manually.",
    });
    return;
  }

  const board = await db.select().from(boardsTable).where(eq(boardsTable.id, boardId)).limit(1);
  if (!board.length) {
    res.status(404).json({ error: "Not Found", message: "Board not found" });
    return;
  }
  const boardData = board[0];
  const entryFee = parseMoney(boardData.entryFee);

  try {
    const result = await db.transaction(async (tx) => {
      await ensureWalletAndLedgerAccounts(tx, req.userId!, "USD");

      const users = await tx.select({
        id: usersTable.id,
        currentBoard: usersTable.currentBoard,
      }).from(usersTable)
        .where(eq(usersTable.id, req.userId!))
        .for("update")
        .limit(1);

      if (!users.length) throw new Error("USER_NOT_FOUND");
      const user = users[0];
      const currentBoard = (user.currentBoard || "F").toUpperCase();
      if (currentBoard !== "F") throw new Error("NOT_ELIGIBLE_BOARD");

      const hasDeposit = await hasCompletedDeposit(tx, req.userId!);
      if (!hasDeposit) throw new Error("DEPOSIT_REQUIRED");

      const alreadyPaid = await hasCompletedBoardFPayment(tx, req.userId!);
      if (alreadyPaid) throw new Error("ALREADY_ACTIVATED");

      const wallets = await tx.select().from(walletsTable)
        .where(eq(walletsTable.userId, req.userId!))
        .for("update")
        .limit(1);
      if (!wallets.length) throw new Error("WALLET_NOT_FOUND");

      const available = parseMoney(wallets[0].balanceUsd);
      if (available < entryFee) throw new Error("INSUFFICIENT_FUNDS");

      const referenceId = `BOARDPAY:F:${req.userId}`;
      const [paymentTx] = await tx.insert(transactionsTable).values({
        userId: req.userId!,
        type: "BOARD_PAYMENT",
        amount: entryFee.toFixed(2),
        currency: "USD",
        amountUsd: entryFee.toFixed(2),
        status: "COMPLETED",
        paymentMethod: "SYSTEM",
        fromBoard: "F",
        referenceId,
        description: "Activation payment for board F",
      }).returning();

      await adjustAvailableWithTreasury(tx, {
        userId: req.userId!,
        transactionId: paymentTx.id,
        deltaUsd: -entryFee,
        currency: "USD",
        idempotencyKey: `boardf:debit:${req.userId}`,
        description: "Board F activation debit",
        metadata: {
          boardId: "F",
          phase: "BOARD_ACTIVATION",
        },
      });

      await assignInvestorQueueNumberIfNeeded(tx, req.userId!);
      const numbered = await tx.select({ accountNumber: usersTable.accountNumber })
        .from(usersTable)
        .where(eq(usersTable.id, req.userId!))
        .limit(1);
      const accountNumber = numbered[0]?.accountNumber ?? null;
      if (!accountNumber || accountNumber <= 0) throw new Error("NUMBER_ASSIGN_FAILED");

      await creditActivationReferralBonuses(tx, req.userId!, "F");
      const promotedCount = await evaluateBoardProgressions(tx);

      await tx.insert(notificationsTable).values({
        userId: req.userId!,
        type: "BOARD_JOINED",
        title: "Board F active",
        message: "Votre compte est valide. La progression automatique est en cours selon le flux reseau.",
        category: "financial",
        actionUrl: "/boards",
        read: false,
      });

      return {
        accountNumber,
        promotedCount,
      };
    });

    res.json({
      success: true,
      message: result.promotedCount > 0
        ? `Activation réussie. ${result.promotedCount} progression(s) automatique(s) appliquée(s).`
        : "Activation réussie. En attente des prochaines activations dans votre flux.",
      accountNumber: result.accountNumber,
      boardCompleted: false,
      newRole: "RANKER",
    });
  } catch (err: unknown) {
    const e = err as { code?: string; constraint?: string; message?: string };
    const msg = e?.message || "Unknown error";

    if (e?.code === "23505" && e?.constraint === "uq_transactions_reference_id") {
      res.status(409).json({ error: "Conflict", message: "Board F already activated on this account." });
      return;
    }

    if (msg === "USER_NOT_FOUND") {
      res.status(404).json({ error: "Not Found", message: "User not found" });
      return;
    }
    if (msg === "WALLET_NOT_FOUND") {
      res.status(400).json({ error: "Bad Request", message: "Wallet not found" });
      return;
    }
    if (msg === "NOT_ELIGIBLE_BOARD") {
      res.status(403).json({ error: "Forbidden", message: "Your account is already beyond Board F." });
      return;
    }
    if (msg === "DEPOSIT_REQUIRED") {
      res.status(400).json({ error: "Bad Request", message: "A completed deposit is required before paying Board F." });
      return;
    }
    if (msg === "ALREADY_ACTIVATED") {
      res.status(409).json({ error: "Conflict", message: "Board F is already paid for this account." });
      return;
    }
    if (msg === "INSUFFICIENT_FUNDS") {
      res.status(400).json({ error: "Bad Request", message: "Insufficient funds" });
      return;
    }
    if (msg === "NUMBER_ASSIGN_FAILED") {
      res.status(500).json({ error: "Internal Server Error", message: "Activation completed but account numbering failed" });
      return;
    }

    console.error("Board payment error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Payment failed" });
  }
});

export default router;
