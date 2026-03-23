import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { transactionsTable, transactionTypeEnum, transactionStatusEnum, paymentMethodEnum, boardParticipantsTable, boardsTable, boardInstancesTable } from "@workspace/db";
import { eq, desc, and, gte, lte, count, SQL, asc, sql } from "drizzle-orm";
import { requireActiveAuth as requireAuth, type AuthRequest } from "../middlewares/auth.js";

const router: IRouter = Router();

const VALID_TYPES = transactionTypeEnum.enumValues;
const VALID_STATUSES = transactionStatusEnum.enumValues;
const VALID_METHODS = paymentMethodEnum.enumValues;

router.get("/transactions", requireAuth as never, async (req: AuthRequest, res) => {
  const { type, status, page = "1", limit = "20", dateFrom, dateTo, paymentMethod, amountMin, amountMax } = req.query as Record<string, string>;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  const conditions: SQL[] = [eq(transactionsTable.userId, req.userId!)];

  if (type && (VALID_TYPES as readonly string[]).includes(type)) {
    conditions.push(eq(transactionsTable.type, type as typeof VALID_TYPES[number]));
  }
  if (status && (VALID_STATUSES as readonly string[]).includes(status)) {
    conditions.push(eq(transactionsTable.status, status as typeof VALID_STATUSES[number]));
  }
  if (paymentMethod && (VALID_METHODS as readonly string[]).includes(paymentMethod)) {
    conditions.push(eq(transactionsTable.paymentMethod, paymentMethod as typeof VALID_METHODS[number]));
  }
  if (dateFrom) conditions.push(gte(transactionsTable.createdAt, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(transactionsTable.createdAt, new Date(dateTo)));
  if (amountMin) conditions.push(gte(transactionsTable.amountUsd, amountMin));
  if (amountMax) conditions.push(lte(transactionsTable.amountUsd, amountMax));

  const [totalResult] = await db.select({ count: count() })
    .from(transactionsTable)
    .where(and(...conditions));

  const total = Number(totalResult.count);

  const txs = await db.select()
    .from(transactionsTable)
    .where(and(...conditions))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(limitNum)
    .offset(offset);

  res.json({
    transactions: txs.map(t => ({
      id: t.id,
      type: t.type,
      amount: parseFloat(t.amount),
      currency: t.currency,
      amountUsd: parseFloat(t.amountUsd),
      status: t.status,
      paymentMethod: t.paymentMethod,
      referenceId: t.referenceId,
      fromBoard: t.fromBoard,
      description: t.description,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
  });
});

router.get("/transactions/report", requireAuth as never, async (req: AuthRequest, res) => {
  const allTxs = await db.select()
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.userId, req.userId!),
      eq(transactionsTable.status, "COMPLETED")
    ));

  let totalDeposited = 0, totalWithdrawn = 0, totalReceived = 0, totalPaid = 0, systemFees = 0, referralBonuses = 0;

  for (const tx of allTxs) {
    const amt = parseFloat(tx.amountUsd);
    switch (tx.type) {
      case "DEPOSIT": totalDeposited += amt; break;
      case "WITHDRAWAL": totalWithdrawn += amt; break;
      case "BOARD_RECEIPT": totalReceived += amt; break;
      case "BOARD_PAYMENT": totalPaid += amt; break;
      case "SYSTEM_FEE": systemFees += amt; break;
      case "REFERRAL_BONUS": referralBonuses += amt; break;
    }
  }

  // Build board progress: all boards with user participation data
  const allBoards = await db.select().from(boardsTable).orderBy(asc(boardsTable.rankOrder));

  const userParticipations = await db.select({
    boardId: boardInstancesTable.boardId,
    instanceStatus: boardInstancesTable.status,
    role: boardParticipantsTable.role,
    amountPaid: boardParticipantsTable.amountPaid,
    paidAt: boardParticipantsTable.paidAt,
  })
    .from(boardParticipantsTable)
    .innerJoin(boardInstancesTable, eq(boardParticipantsTable.boardInstanceId, boardInstancesTable.id))
    .where(eq(boardParticipantsTable.userId, req.userId!));

  const boardProgress = allBoards.map(board => {
    const participations = userParticipations.filter(p => p.boardId === board.id);
    const totalParticipations = participations.length;
    const completedParticipations = participations.filter(p => p.instanceStatus === "COMPLETED").length;
    const totalAmountPaid = participations.reduce((sum, p) => sum + parseFloat(p.amountPaid || "0"), 0);
    return {
      boardId: board.id,
      entryFee: parseFloat(board.entryFee),
      withdrawable: parseFloat(board.withdrawable),
      totalParticipations,
      completedParticipations,
      totalAmountPaid: parseFloat(totalAmountPaid.toFixed(2)),
      hasParticipated: totalParticipations > 0,
    };
  });

  res.json({
    totalDeposited: parseFloat(totalDeposited.toFixed(2)),
    totalWithdrawn: parseFloat(totalWithdrawn.toFixed(2)),
    totalReceived: parseFloat(totalReceived.toFixed(2)),
    totalPaid: parseFloat(totalPaid.toFixed(2)),
    systemFees: parseFloat(systemFees.toFixed(2)),
    referralBonuses: parseFloat(referralBonuses.toFixed(2)),
    netProfit: parseFloat((totalReceived + referralBonuses - totalPaid - systemFees).toFixed(2)),
    boardProgress,
  });
});

export default router;
