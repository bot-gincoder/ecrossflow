import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { transactionsTable, transactionTypeEnum, transactionStatusEnum } from "@workspace/db";
import { eq, desc, and, gte, lte, count, SQL } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";

const router: IRouter = Router();

const VALID_TYPES = transactionTypeEnum.enumValues;
const VALID_STATUSES = transactionStatusEnum.enumValues;

router.get("/transactions", requireAuth as never, async (req: AuthRequest, res) => {
  const { type, status, page = "1", limit = "20", dateFrom, dateTo } = req.query as Record<string, string>;
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
  if (dateFrom) conditions.push(gte(transactionsTable.createdAt, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(transactionsTable.createdAt, new Date(dateTo)));

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

  res.json({
    totalDeposited: parseFloat(totalDeposited.toFixed(2)),
    totalWithdrawn: parseFloat(totalWithdrawn.toFixed(2)),
    totalReceived: parseFloat(totalReceived.toFixed(2)),
    totalPaid: parseFloat(totalPaid.toFixed(2)),
    systemFees: parseFloat(systemFees.toFixed(2)),
    referralBonuses: parseFloat(referralBonuses.toFixed(2)),
    netProfit: parseFloat((totalReceived + referralBonuses - totalPaid - systemFees).toFixed(2)),
    boardProgress: [],
  });
});

export default router;
