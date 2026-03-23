import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  boardsTable,
  boardInstancesTable,
  boardParticipantsTable,
  walletsTable,
  transactionsTable,
  usersTable,
  notificationsTable,
} from "@workspace/db";
import { eq, and, desc, asc } from "drizzle-orm";
import { requireActiveAuth as requireAuth, type AuthRequest } from "../middlewares/auth.js";

const router: IRouter = Router();

const BOARD_ORDER = ["F", "E", "D", "C", "B", "A", "S"];

router.get("/boards", requireAuth as never, async (req: AuthRequest, res) => {
  const boards = await db.select().from(boardsTable).orderBy(asc(boardsTable.rankOrder));
  res.json({ boards: boards.map(b => ({
    id: b.id,
    rankOrder: b.rankOrder,
    entryFee: parseFloat(b.entryFee),
    multiplier: b.multiplier,
    totalGain: parseFloat(b.totalGain),
    nextBoardDeduction: parseFloat(b.nextBoardDeduction),
    withdrawable: parseFloat(b.withdrawable),
    description: b.description,
    colorTheme: b.colorTheme,
  }))});
});

router.get("/boards/my-status", requireAuth as never, async (req: AuthRequest, res) => {
  const boards = await db.select().from(boardsTable).orderBy(asc(boardsTable.rankOrder));
  const statuses = [];

  for (const board of boards) {
    const participation = await db.select({
      id: boardParticipantsTable.id,
      role: boardParticipantsTable.role,
      amountPaid: boardParticipantsTable.amountPaid,
      paidAt: boardParticipantsTable.paidAt,
      boardInstanceId: boardParticipantsTable.boardInstanceId,
    })
    .from(boardParticipantsTable)
    .innerJoin(boardInstancesTable, and(
      eq(boardParticipantsTable.boardInstanceId, boardInstancesTable.id),
      eq(boardInstancesTable.boardId, board.id)
    ))
    .where(eq(boardParticipantsTable.userId, req.userId!))
    .limit(1);

    if (!participation.length) {
      statuses.push({ boardId: board.id, completed: false, role: null, instanceId: null, amountPaid: null, joinedAt: null });
    } else {
      const p = participation[0];
      statuses.push({
        boardId: board.id,
        role: p.role,
        instanceId: p.boardInstanceId,
        amountPaid: p.amountPaid ? parseFloat(p.amountPaid) : null,
        joinedAt: p.paidAt,
        completed: false,
      });
    }
  }

  res.json({ statuses });
});

router.get("/boards/:boardId/instance", requireAuth as never, async (req: AuthRequest, res) => {
  const boardId = String(req.params.boardId);
  const instances = await db.select()
    .from(boardInstancesTable)
    .where(and(eq(boardInstancesTable.boardId, boardId), eq(boardInstancesTable.status, "ACTIVE")))
    .orderBy(desc(boardInstancesTable.createdAt))
    .limit(1);

  if (!instances.length) {
    const waiting = await db.select()
      .from(boardInstancesTable)
      .where(and(eq(boardInstancesTable.boardId, boardId), eq(boardInstancesTable.status, "WAITING")))
      .limit(1);

    if (!waiting.length) {
      res.status(404).json({ error: "Not Found", message: "No active instance" });
      return;
    }
    instances.push(waiting[0]);
  }

  const instance = instances[0];
  const participants = await db.select({
    id: boardParticipantsTable.id,
    userId: boardParticipantsTable.userId,
    role: boardParticipantsTable.role,
    position: boardParticipantsTable.position,
    paidAt: boardParticipantsTable.paidAt,
    username: usersTable.username,
    avatarUrl: usersTable.avatarUrl,
  })
  .from(boardParticipantsTable)
  .innerJoin(usersTable, eq(boardParticipantsTable.userId, usersTable.id))
  .where(eq(boardParticipantsTable.boardInstanceId, instance.id));

  const rankerUser = instance.rankerId
    ? await db.select({ id: usersTable.id, username: usersTable.username, avatarUrl: usersTable.avatarUrl })
        .from(usersTable).where(eq(usersTable.id, instance.rankerId)).limit(1)
    : [];

  res.json({
    id: instance.id,
    boardId: instance.boardId,
    instanceNumber: instance.instanceNumber,
    ranker: rankerUser.length ? {
      id: rankerUser[0].id,
      userId: rankerUser[0].id,
      username: rankerUser[0].username,
      avatarUrl: rankerUser[0].avatarUrl,
      role: "RANKER",
    } : null,
    status: instance.status,
    slotsFilled: instance.slotsFilled,
    totalCollected: parseFloat(instance.totalCollected),
    participants: participants.map(p => ({
      id: p.id,
      userId: p.userId,
      username: p.username,
      avatarUrl: p.avatarUrl,
      role: p.role,
      position: p.position,
      paidAt: p.paidAt,
    })),
    createdAt: instance.createdAt,
    completedAt: instance.completedAt,
  });
});

router.post("/boards/:boardId/pay", requireAuth as never, async (req: AuthRequest, res) => {
  const boardId = String(req.params.boardId);

  const board = await db.select().from(boardsTable).where(eq(boardsTable.id, boardId)).limit(1);
  if (!board.length) {
    res.status(404).json({ error: "Not Found", message: "Board not found" });
    return;
  }

  const boardData = board[0];
  const entryFee = parseFloat(boardData.entryFee);

  const wallets = await db.select().from(walletsTable).where(eq(walletsTable.userId, req.userId!)).limit(1);
  if (!wallets.length) {
    res.status(400).json({ error: "Bad Request", message: "Wallet not found" });
    return;
  }

  const wallet = wallets[0];
  const availableBalance = parseFloat(wallet.balanceUsd);

  if (availableBalance < entryFee) {
    res.status(400).json({ error: "Bad Request", message: "Insufficient funds" });
    return;
  }

  let activeInstance = await db.select()
    .from(boardInstancesTable)
    .where(and(eq(boardInstancesTable.boardId, boardId), eq(boardInstancesTable.status, "ACTIVE")))
    .limit(1);

  if (!activeInstance.length) {
    const waiting = await db.select()
      .from(boardInstancesTable)
      .where(and(eq(boardInstancesTable.boardId, boardId), eq(boardInstancesTable.status, "WAITING")))
      .limit(1);

    if (!waiting.length) {
      res.status(400).json({ error: "Bad Request", message: "No available board instance" });
      return;
    }

    await db.update(boardInstancesTable).set({ status: "ACTIVE" }).where(eq(boardInstancesTable.id, waiting[0].id));
    activeInstance = [{ ...waiting[0], status: "ACTIVE" as const }];
  }

  const instance = activeInstance[0];
  const newSlotsFilled = instance.slotsFilled + 1;
  const newTotalCollected = parseFloat(instance.totalCollected) + entryFee;

  await db.update(walletsTable)
    .set({ balanceUsd: (availableBalance - entryFee).toFixed(2) })
    .where(eq(walletsTable.userId, req.userId!));

  await db.insert(boardParticipantsTable).values({
    boardInstanceId: instance.id,
    userId: req.userId!,
    role: "STARTER",
    position: newSlotsFilled,
    amountPaid: entryFee.toFixed(2),
    paidAt: new Date(),
  });

  await db.insert(transactionsTable).values({
    userId: req.userId!,
    type: "BOARD_PAYMENT",
    amount: entryFee.toFixed(2),
    currency: "USD",
    amountUsd: entryFee.toFixed(2),
    status: "COMPLETED",
    paymentMethod: "SYSTEM",
    description: `Payment for board ${boardId}`,
  });

  await db.insert(notificationsTable).values({
    userId: req.userId!,
    type: "BOARD_JOINED",
    title: `Board ${boardId} rejoint !`,
    message: `Vous avez rejoint le board ${boardId} avec succès.`,
    category: "financial",
    actionUrl: `/boards/${boardId}`,
    read: false,
  });

  if (instance.rankerId) {
    const rankerPayment = (entryFee * 7 / 8).toFixed(2);
    const rankerWallet = await db.select().from(walletsTable).where(eq(walletsTable.userId, instance.rankerId)).limit(1);
    if (rankerWallet.length) {
      await db.update(walletsTable)
        .set({ balancePending: (parseFloat(rankerWallet[0].balancePending) + parseFloat(rankerPayment)).toFixed(2) })
        .where(eq(walletsTable.userId, instance.rankerId));
    }
  }

  let boardCompleted = false;
  if (newSlotsFilled >= 8) {
    boardCompleted = true;
    await db.update(boardInstancesTable)
      .set({ status: "COMPLETED", slotsFilled: newSlotsFilled, totalCollected: newTotalCollected.toFixed(2), completedAt: new Date() })
      .where(eq(boardInstancesTable.id, instance.id));

    if (instance.rankerId) {
      const withdrawable = parseFloat(boardData.withdrawable);
      const rankerWallet = await db.select().from(walletsTable).where(eq(walletsTable.userId, instance.rankerId)).limit(1);
      if (rankerWallet.length) {
        await db.update(walletsTable)
          .set({
            balanceUsd: (parseFloat(rankerWallet[0].balanceUsd) + withdrawable).toFixed(2),
            balancePending: "0",
          })
          .where(eq(walletsTable.userId, instance.rankerId));
      }

      await db.insert(transactionsTable).values({
        userId: instance.rankerId,
        type: "BOARD_RECEIPT",
        amount: withdrawable.toFixed(2),
        currency: "USD",
        amountUsd: withdrawable.toFixed(2),
        status: "COMPLETED",
        paymentMethod: "SYSTEM",
        description: `Board ${boardId} completed - earnings`,
      });

      await db.insert(notificationsTable).values({
        userId: instance.rankerId,
        type: "BOARD_COMPLETED",
        title: `Board ${boardId} complété !`,
        message: `Félicitations ! Vous avez gagné $${withdrawable.toFixed(2)}.`,
        category: "financial",
        actionUrl: `/boards/${boardId}`,
        read: false,
      });

      const currentBoardIndex = BOARD_ORDER.indexOf(boardId);
      if (currentBoardIndex < BOARD_ORDER.length - 1) {
        const nextBoardId = BOARD_ORDER[currentBoardIndex + 1];
        await db.update(usersTable)
          .set({ currentBoard: nextBoardId })
          .where(eq(usersTable.id, instance.rankerId));
      }
    }

    const lastInstanceResult = await db.select({ instanceNumber: boardInstancesTable.instanceNumber })
      .from(boardInstancesTable)
      .where(eq(boardInstancesTable.boardId, boardId))
      .orderBy(desc(boardInstancesTable.instanceNumber))
      .limit(1);

    const nextInstanceNumber = lastInstanceResult.length ? lastInstanceResult[0].instanceNumber + 1 : 1;

    await db.insert(boardInstancesTable).values({
      boardId: boardId,
      instanceNumber: nextInstanceNumber,
      rankerId: null,
      status: "WAITING",
      slotsFilled: 0,
      totalCollected: "0",
    });
  } else {
    await db.update(boardInstancesTable)
      .set({ slotsFilled: newSlotsFilled, totalCollected: newTotalCollected.toFixed(2) })
      .where(eq(boardInstancesTable.id, instance.id));
  }

  res.json({
    success: true,
    message: boardCompleted ? "Board completed! You have been paid." : "Payment successful. You joined the board.",
    boardCompleted,
    newRole: null,
  });
});

export default router;
