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
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { requireActiveAuth as requireAuth, type AuthRequest } from "../middlewares/auth.js";

const router: IRouter = Router();

const BOARD_ORDER = ["F", "E", "D", "C", "B", "A", "S"];

type TxClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

type BoardRow = {
  id: string;
  entryFee: string;
  withdrawable: string;
  nextBoardDeduction: string;
};

type InstanceRow = {
  id: string;
  boardId: string;
  rankerId: string | null;
  totalCollected: string;
  status: "WAITING" | "ACTIVE" | "COMPLETED";
  instanceNumber: number;
};

async function assignInvestorQueueNumberIfNeeded(
  tx: TxClient,
  userId: string,
  boardId: string,
): Promise<void> {
  if (boardId !== "F") return;

  const users = await tx.select({
    id: usersTable.id,
    username: usersTable.username,
    accountNumber: usersTable.accountNumber,
  })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .for("update")
    .limit(1);
  if (!users.length) return;
  const user = users[0];
  if (user.accountNumber) return;

  const isCeo = user.username.toLowerCase() === "ceo";
  if (isCeo) {
    const ownerOfOne = await tx.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.accountNumber, 1))
      .limit(1);
    if (!ownerOfOne.length || ownerOfOne[0].id === user.id) {
      await tx.update(usersTable)
        .set({ accountNumber: 1 })
        .where(eq(usersTable.id, user.id));
      return;
    }
  }

  await tx.execute(sql`CREATE SEQUENCE IF NOT EXISTS investor_queue_seq START 2 INCREMENT 1 MINVALUE 2;`);
  await tx.execute(sql`
    SELECT setval(
      'investor_queue_seq',
      GREATEST(COALESCE((SELECT MAX(account_number) FROM users), 1) + 1, 2),
      false
    );
  `);
  const next = await tx.execute(sql<{ next_value: number }>`SELECT nextval('investor_queue_seq')::int AS next_value;`);
  const nextValue = next.rows?.[0]?.next_value ?? 2;

  await tx.update(usersTable)
    .set({ accountNumber: nextValue })
    .where(eq(usersTable.id, user.id));
}

async function completeBoardInstance(tx: TxClient, boardId: string, instance: InstanceRow, boardData: BoardRow): Promise<void> {
  await tx.update(boardInstancesTable)
    .set({ status: "COMPLETED", completedAt: new Date() })
    .where(eq(boardInstancesTable.id, instance.id));

  if (instance.rankerId) {
    const withdrawable = parseFloat(boardData.withdrawable);
    const nextBoardDeduction = parseFloat(boardData.nextBoardDeduction);
    const rankerWallet = await tx.select().from(walletsTable).where(eq(walletsTable.userId, instance.rankerId)).limit(1);
    if (rankerWallet.length) {
      const currentPending = parseFloat(rankerWallet[0].balancePending);
      const instancePending = Math.min(withdrawable, currentPending);
      const newPending = Math.max(0, currentPending - instancePending);
      const creditToAvailable = withdrawable - nextBoardDeduction;
      await tx.update(walletsTable)
        .set({
          balanceUsd: (parseFloat(rankerWallet[0].balanceUsd) + creditToAvailable).toFixed(2),
          balancePending: newPending.toFixed(2),
          balanceReserved: (parseFloat(rankerWallet[0].balanceReserved || "0") + nextBoardDeduction).toFixed(2),
        })
        .where(eq(walletsTable.userId, instance.rankerId));
    }

    await tx.insert(transactionsTable).values({
      userId: instance.rankerId,
      type: "BOARD_RECEIPT",
      amount: withdrawable.toFixed(2),
      currency: "USD",
      amountUsd: withdrawable.toFixed(2),
      status: "COMPLETED",
      paymentMethod: "SYSTEM",
      description: `Board ${boardId} completed - earnings`,
    });

    await tx.insert(notificationsTable).values({
      userId: instance.rankerId,
      type: "BOARD_COMPLETED",
      title: `Board ${boardId} complété !`,
      message: `Félicitations ! Vous avez gagné $${withdrawable.toFixed(2)} (dont $${nextBoardDeduction.toFixed(2)} réservé pour le board suivant).`,
      category: "financial",
      actionUrl: `/boards/${boardId}`,
      read: false,
    });

    const currentBoardIndex = BOARD_ORDER.indexOf(boardId);
    if (currentBoardIndex < BOARD_ORDER.length - 1) {
      const nextBoardId = BOARD_ORDER[currentBoardIndex + 1];
      const nextBoard = await tx.select().from(boardsTable).where(eq(boardsTable.id, nextBoardId)).limit(1);
      if (nextBoard.length) {
        const nextEntryFee = parseFloat(nextBoard[0].entryFee);
        const canAutoEnroll = nextBoardDeduction >= nextEntryFee;
        if (canAutoEnroll) {
          const nextActiveInstance = await tx.select()
            .from(boardInstancesTable)
            .where(and(eq(boardInstancesTable.boardId, nextBoardId), eq(boardInstancesTable.status, "ACTIVE")))
            .limit(1);
          const nextWaitingInstance = nextActiveInstance.length ? [] : await tx.select()
            .from(boardInstancesTable)
            .where(and(eq(boardInstancesTable.boardId, nextBoardId), eq(boardInstancesTable.status, "WAITING")))
            .limit(1);
          const nextInstance = nextActiveInstance[0] ?? nextWaitingInstance[0];
          if (nextInstance) {
            if (nextInstance.status === "WAITING") {
              await tx.update(boardInstancesTable).set({ status: "ACTIVE" }).where(eq(boardInstancesTable.id, nextInstance.id));
            }
            const alreadyInNext = await tx.select({ id: boardParticipantsTable.id })
              .from(boardParticipantsTable)
              .where(and(
                eq(boardParticipantsTable.boardInstanceId, nextInstance.id),
                eq(boardParticipantsTable.userId, instance.rankerId)
              ))
              .limit(1);
            const nextStarters = await tx.select({ id: boardParticipantsTable.id })
              .from(boardParticipantsTable)
              .where(and(
                eq(boardParticipantsTable.boardInstanceId, nextInstance.id),
                eq(boardParticipantsTable.role, "STARTER")
              ));
            if (!alreadyInNext.length && nextStarters.length < 8) {
              const newNextPos = nextStarters.length + 1;
              await tx.insert(boardParticipantsTable).values({
                boardInstanceId: nextInstance.id,
                userId: instance.rankerId,
                role: "STARTER",
                position: newNextPos,
                amountPaid: nextEntryFee.toFixed(2),
                paidAt: new Date(),
              });
              const newNextTotal = parseFloat(nextInstance.totalCollected) + nextEntryFee;
              await tx.update(boardInstancesTable)
                .set({ slotsFilled: newNextPos, totalCollected: newNextTotal.toFixed(2) })
                .where(eq(boardInstancesTable.id, nextInstance.id));
              const rankerWalletFresh = await tx.select().from(walletsTable).where(eq(walletsTable.userId, instance.rankerId)).limit(1);
              if (rankerWalletFresh.length) {
                const currentReserved = parseFloat(rankerWalletFresh[0].balanceReserved || "0");
                await tx.update(walletsTable)
                  .set({ balanceReserved: Math.max(0, currentReserved - nextEntryFee).toFixed(2) })
                  .where(eq(walletsTable.userId, instance.rankerId));
              }
              if (nextInstance.rankerId) {
                const pendingCredit = (nextEntryFee * 7) / 8;
                const nextRankerWallet = await tx.select().from(walletsTable).where(eq(walletsTable.userId, nextInstance.rankerId)).limit(1);
                if (nextRankerWallet.length) {
                  await tx.update(walletsTable)
                    .set({ balancePending: (parseFloat(nextRankerWallet[0].balancePending) + pendingCredit).toFixed(2) })
                    .where(eq(walletsTable.userId, nextInstance.rankerId));
                }
              }
              await tx.insert(transactionsTable).values({
                userId: instance.rankerId,
                type: "BOARD_PAYMENT",
                amount: nextEntryFee.toFixed(2),
                currency: "USD",
                amountUsd: nextEntryFee.toFixed(2),
                status: "COMPLETED",
                paymentMethod: "SYSTEM",
                description: `Auto-enrollment in board ${nextBoardId} from next-board deduction`,
              });
              await tx.insert(notificationsTable).values({
                userId: instance.rankerId,
                type: "BOARD_JOINED",
                title: `Inscrit automatiquement sur Board ${nextBoardId} !`,
                message: `Votre montée automatique au Board ${nextBoardId} a été effectuée.`,
                category: "financial",
                actionUrl: `/boards/${nextBoardId}`,
                read: false,
              });
              // If this auto-enrollment fills the 8th slot in the next board, trigger completion
              if (newNextPos >= 8) {
                const nextBoardData = await tx.select().from(boardsTable).where(eq(boardsTable.id, nextBoardId)).limit(1);
                if (nextBoardData.length) {
                  const freshNextInstance: InstanceRow = {
                    ...nextInstance,
                    status: "ACTIVE" as const,
                    totalCollected: newNextTotal.toFixed(2),
                  };
                  await completeBoardInstance(tx, nextBoardId, freshNextInstance, nextBoardData[0]);
                }
              }
            }
          }
        }
      }
      await tx.update(usersTable)
        .set({ currentBoard: nextBoardId })
        .where(eq(usersTable.id, instance.rankerId));
    }
  }

  const allInstanceParticipants = await tx.select({
    id: boardParticipantsTable.id,
    userId: boardParticipantsTable.userId,
    role: boardParticipantsTable.role,
    position: boardParticipantsTable.position,
  })
  .from(boardParticipantsTable)
  .where(eq(boardParticipantsTable.boardInstanceId, instance.id))
  .orderBy(asc(boardParticipantsTable.position));

  const existingLeaders = allInstanceParticipants.filter(p => p.role === "LEADER");
  const existingChallengers = allInstanceParticipants.filter(p => p.role === "CHALLENGER");
  const allStartersFromInstance = allInstanceParticipants.filter(p => p.role === "STARTER");

  const lastInstanceResult = await tx.select({ instanceNumber: boardInstancesTable.instanceNumber })
    .from(boardInstancesTable)
    .where(eq(boardInstancesTable.boardId, boardId))
    .orderBy(desc(boardInstancesTable.instanceNumber))
    .limit(1);
  const baseInstanceNumber = lastInstanceResult.length ? lastInstanceResult[0].instanceNumber : 0;

  type ParticipantEntry = {
    boardInstanceId: string;
    userId: string;
    role: "STARTER" | "CHALLENGER" | "LEADER" | "RANKER";
    position: number;
    amountPaid: string;
    paidAt: Date;
  };

  if (existingLeaders.length >= 2) {
    for (let split = 0; split < 2; split++) {
      const newRanker = existingLeaders[split];
      const splitChallengers = existingChallengers.slice(split * 2, split * 2 + 2);
      const splitStarters = allStartersFromInstance.slice(split * 4, split * 4 + 4);
      const [newInst] = await tx.insert(boardInstancesTable).values({
        boardId,
        instanceNumber: baseInstanceNumber + split + 1,
        rankerId: newRanker.userId,
        status: "WAITING",
        slotsFilled: 0,
        totalCollected: "0",
      }).returning();
      const promotedParticipants: ParticipantEntry[] = [];
      splitChallengers.forEach((c, i) => {
        promotedParticipants.push({ boardInstanceId: newInst.id, userId: c.userId, role: "LEADER", position: i + 1, amountPaid: "0", paidAt: new Date() });
      });
      splitStarters.forEach((s, i) => {
        promotedParticipants.push({ boardInstanceId: newInst.id, userId: s.userId, role: "CHALLENGER", position: i + 1, amountPaid: "0", paidAt: new Date() });
      });
      if (promotedParticipants.length > 0) {
        await tx.insert(boardParticipantsTable).values(promotedParticipants);
      }
      if (newRanker.userId !== instance.rankerId) {
        await tx.insert(notificationsTable).values({
          userId: newRanker.userId, type: "BOARD_COMPLETED",
          title: `Promotion : RANKER sur Board ${boardId} !`,
          message: `Vous avez été promu RANKER dans un nouveau cycle du Board ${boardId}.`,
          category: "financial", actionUrl: `/boards/${boardId}`, read: false,
        });
      }
      for (const c of splitChallengers) {
        await tx.insert(notificationsTable).values({
          userId: c.userId, type: "BOARD_JOINED",
          title: `Promotion : LEADER sur Board ${boardId} !`,
          message: `Vous avez été promu LEADER dans un nouveau cycle du Board ${boardId}.`,
          category: "financial", actionUrl: `/boards/${boardId}`, read: false,
        });
      }
      for (const s of splitStarters) {
        await tx.insert(notificationsTable).values({
          userId: s.userId, type: "BOARD_JOINED",
          title: `Promotion : CHALLENGER sur Board ${boardId} !`,
          message: `Vous avez été promu CHALLENGER dans un nouveau cycle du Board ${boardId}.`,
          category: "financial", actionUrl: `/boards/${boardId}`, read: false,
        });
      }
    }
  } else {
    const starters = allStartersFromInstance;
    const splitDefs = [
      { ranker: starters[0], leaders: [starters[2], starters[3]].filter(Boolean), challengers: [starters[6]].filter(Boolean) },
      { ranker: starters[1], leaders: [starters[4], starters[5]].filter(Boolean), challengers: [starters[7]].filter(Boolean) },
    ];
    for (let i = 0; i < splitDefs.length; i++) {
      const def = splitDefs[i];
      if (!def.ranker) continue;
      const [newInst] = await tx.insert(boardInstancesTable).values({
        boardId,
        instanceNumber: baseInstanceNumber + i + 1,
        rankerId: def.ranker.userId,
        status: "WAITING",
        slotsFilled: 0,
        totalCollected: "0",
      }).returning();
      const promotedParticipants: ParticipantEntry[] = [];
      def.leaders.forEach((l, j) => {
        promotedParticipants.push({ boardInstanceId: newInst.id, userId: l.userId, role: "LEADER", position: j + 1, amountPaid: "0", paidAt: new Date() });
      });
      def.challengers.forEach((c, j) => {
        promotedParticipants.push({ boardInstanceId: newInst.id, userId: c.userId, role: "CHALLENGER", position: j + 1, amountPaid: "0", paidAt: new Date() });
      });
      if (promotedParticipants.length > 0) {
        await tx.insert(boardParticipantsTable).values(promotedParticipants);
      }
      await tx.insert(notificationsTable).values({
        userId: def.ranker.userId, type: "BOARD_COMPLETED",
        title: `Promotion : RANKER sur Board ${boardId} !`,
        message: `Vous avez été promu RANKER dans un nouveau cycle du Board ${boardId}. Recrutez 8 starters pour gagner !`,
        category: "financial", actionUrl: `/boards/${boardId}`, read: false,
      });
    }
  }
}

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
  const roleRank = (role: string | null | undefined): number => {
    const value = String(role || "").toUpperCase();
    if (value === "RANKER") return 4;
    if (value === "LEADER") return 3;
    if (value === "CHALLENGER") return 2;
    if (value === "STARTER") return 1;
    return 0;
  };

  for (const board of boards) {
    const participation = await db.select({
      id: boardParticipantsTable.id,
      role: boardParticipantsTable.role,
      amountPaid: boardParticipantsTable.amountPaid,
      paidAt: boardParticipantsTable.paidAt,
      boardInstanceId: boardParticipantsTable.boardInstanceId,
      instanceStatus: boardInstancesTable.status,
    })
    .from(boardParticipantsTable)
    .innerJoin(boardInstancesTable, and(
      eq(boardParticipantsTable.boardInstanceId, boardInstancesTable.id),
      eq(boardInstancesTable.boardId, board.id)
    ))
    .where(eq(boardParticipantsTable.userId, req.userId!))
    .orderBy(desc(boardParticipantsTable.paidAt))
    .limit(10);

    if (!participation.length) {
      statuses.push({ boardId: board.id, completed: false, role: null, instanceId: null, amountPaid: null, joinedAt: null });
    } else {
      // Compute the user's real current stage in this level:
      // prefer non-completed participations and pick the highest stage, then most recent.
      const nonCompleted = participation.filter((p) => p.instanceStatus !== "COMPLETED");
      const pool = nonCompleted.length ? nonCompleted : participation;
      const sorted = [...pool].sort((a, b) => {
        const roleDelta = roleRank(b.role) - roleRank(a.role);
        if (roleDelta !== 0) return roleDelta;
        const ta = a.paidAt ? new Date(a.paidAt).getTime() : 0;
        const tb = b.paidAt ? new Date(b.paidAt).getTime() : 0;
        return tb - ta;
      });
      const p = sorted[0];
      statuses.push({
        boardId: board.id,
        role: p.role,
        instanceId: p.boardInstanceId,
        amountPaid: p.amountPaid ? parseFloat(p.amountPaid) : null,
        joinedAt: p.paidAt,
        completed: p.instanceStatus === "COMPLETED" && nonCompleted.length === 0,
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
  .where(eq(boardParticipantsTable.boardInstanceId, instance.id))
  .orderBy(asc(boardParticipantsTable.position));

  const rankerUser = instance.rankerId
    ? await db.select({ id: usersTable.id, username: usersTable.username, avatarUrl: usersTable.avatarUrl })
        .from(usersTable).where(eq(usersTable.id, instance.rankerId)).limit(1)
    : [];

  // Include RANKER as a participant so PyramidView renders all 4 tiers
  const allParticipants = [
    ...(rankerUser.length ? [{
      id: `ranker-${instance.id}`,
      userId: rankerUser[0].id,
      username: rankerUser[0].username,
      avatarUrl: rankerUser[0].avatarUrl,
      role: "RANKER" as const,
      position: 0,
      paidAt: instance.createdAt,
    }] : []),
    ...participants.map(p => ({
      id: p.id,
      userId: p.userId,
      username: p.username,
      avatarUrl: p.avatarUrl,
      role: p.role as "STARTER" | "CHALLENGER" | "LEADER" | "RANKER",
      position: p.position,
      paidAt: p.paidAt,
    })),
  ];

  const startersFilled = participants.filter(p => p.role === "STARTER").length;

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
    slotsFilled: startersFilled,
    totalCollected: parseFloat(instance.totalCollected),
    participants: allParticipants,
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

  // Enforce board progression eligibility: user must be on this board level
  const userRows = await db.select({ currentBoard: usersTable.currentBoard })
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);
  const userCurrentBoard = userRows.length ? (userRows[0].currentBoard ?? BOARD_ORDER[0]) : BOARD_ORDER[0];
  if (userCurrentBoard !== boardId) {
    res.status(403).json({ error: "Forbidden", message: `You are not eligible to join board ${boardId}. Your current board is ${userCurrentBoard}.` });
    return;
  }

  const boardData = board[0];
  const entryFee = parseFloat(boardData.entryFee);

  try {
    const result = await db.transaction(async (tx) => {
      // Lock wallet row first to serialize concurrent debits for this user
      const wallets = await tx.select().from(walletsTable)
        .where(eq(walletsTable.userId, req.userId!))
        .for("update")
        .limit(1);
      if (!wallets.length) throw new Error("WALLET_NOT_FOUND");

      const wallet = wallets[0];
      const availableBalance = parseFloat(wallet.balanceUsd);
      if (availableBalance < entryFee) throw new Error("INSUFFICIENT_FUNDS");

      // Find or activate an available board instance — lock the row to prevent concurrent activation
      let activeInstance = await tx.select()
        .from(boardInstancesTable)
        .where(and(eq(boardInstancesTable.boardId, boardId), eq(boardInstancesTable.status, "ACTIVE")))
        .for("update")
        .limit(1);

      if (!activeInstance.length) {
        const waiting = await tx.select()
          .from(boardInstancesTable)
          .where(and(eq(boardInstancesTable.boardId, boardId), eq(boardInstancesTable.status, "WAITING")))
          .for("update")
          .limit(1);

        if (!waiting.length) throw new Error("NO_INSTANCE");

        await tx.update(boardInstancesTable).set({ status: "ACTIVE" }).where(eq(boardInstancesTable.id, waiting[0].id));
        activeInstance = [{ ...waiting[0], status: "ACTIVE" as const }];
      }

      const instance = activeInstance[0];

      // Eligibility: reject if user already participates in this instance
      const alreadyJoined = await tx.select({ id: boardParticipantsTable.id })
        .from(boardParticipantsTable)
        .where(and(
          eq(boardParticipantsTable.boardInstanceId, instance.id),
          eq(boardParticipantsTable.userId, req.userId!)
        ))
        .limit(1);
      if (alreadyJoined.length) throw new Error("ALREADY_JOINED");

      // Count existing starters atomically to prevent slot overflow
      // The unique index (boardInstanceId, role, position) at DB level further prevents duplicates
      const existingStarters = await tx.select({
        id: boardParticipantsTable.id,
        userId: boardParticipantsTable.userId,
        position: boardParticipantsTable.position,
      })
      .from(boardParticipantsTable)
      .where(and(
        eq(boardParticipantsTable.boardInstanceId, instance.id),
        eq(boardParticipantsTable.role, "STARTER")
      ))
      .orderBy(asc(boardParticipantsTable.position));

      if (existingStarters.length >= 8) throw new Error("BOARD_FULL");

      // Guard against duplicate completion if another request already triggered completion
      if (instance.status === "COMPLETED") throw new Error("BOARD_FULL");

      const newStarterCount = existingStarters.length + 1;
      const newTotalCollected = parseFloat(instance.totalCollected) + entryFee;

      // Debit user wallet
      await tx.update(walletsTable)
        .set({ balanceUsd: (availableBalance - entryFee).toFixed(2) })
        .where(eq(walletsTable.userId, req.userId!));

      // Insert participant as STARTER
      await tx.insert(boardParticipantsTable).values({
        boardInstanceId: instance.id,
        userId: req.userId!,
        role: "STARTER",
        position: newStarterCount,
        amountPaid: entryFee.toFixed(2),
        paidAt: new Date(),
      });

      // Record board payment transaction
      await tx.insert(transactionsTable).values({
        userId: req.userId!,
        type: "BOARD_PAYMENT",
        amount: entryFee.toFixed(2),
        currency: "USD",
        amountUsd: entryFee.toFixed(2),
        status: "COMPLETED",
        paymentMethod: "SYSTEM",
        description: `Payment for board ${boardId}`,
      });

      await tx.insert(notificationsTable).values({
        userId: req.userId!,
        type: "BOARD_JOINED",
        title: `Board ${boardId} rejoint !`,
        message: `Vous avez rejoint le board ${boardId} en tant que STARTER (${newStarterCount}/8).`,
        category: "financial",
        actionUrl: `/boards/${boardId}`,
        read: false,
      });

      // Credit RANKER's pending balance (7/8 of each STARTER payment)
      if (instance.rankerId) {
        const rankerCredit = entryFee * 7 / 8;
        const rankerWallet = await tx.select().from(walletsTable).where(eq(walletsTable.userId, instance.rankerId)).limit(1);
        if (rankerWallet.length) {
          await tx.update(walletsTable)
            .set({ balancePending: (parseFloat(rankerWallet[0].balancePending) + rankerCredit).toFixed(2) })
            .where(eq(walletsTable.userId, instance.rankerId));
        }
      }

      // Update slotsFilled and totalCollected
      await tx.update(boardInstancesTable)
        .set({ slotsFilled: newStarterCount, totalCollected: newTotalCollected.toFixed(2) })
        .where(eq(boardInstancesTable.id, instance.id));

      // Assign sequential investor queue number when user validates first board F payment.
      await assignInvestorQueueNumberIfNeeded(tx, req.userId!, boardId);

      const boardCompleted = newStarterCount >= 8;

      if (boardCompleted) {
        const updatedInstance: InstanceRow = {
          id: instance.id,
          boardId: instance.boardId,
          rankerId: instance.rankerId,
          totalCollected: newTotalCollected.toFixed(2),
          status: "ACTIVE" as const,
          instanceNumber: instance.instanceNumber,
        };
        await completeBoardInstance(tx, boardId, updatedInstance, boardData);
      }

      return { newStarterCount, boardCompleted, rankerId: instance.rankerId };
    });

    res.json({
      success: true,
      message: result.boardCompleted
        ? "Board completed! The RANKER has been paid and new cycles have started."
        : `Payment successful. You joined board ${boardId} as STARTER (${result.newStarterCount}/8).`,
      boardCompleted: result.boardCompleted,
      newRole: "STARTER",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "WALLET_NOT_FOUND") {
      res.status(400).json({ error: "Bad Request", message: "Wallet not found" });
    } else if (msg === "INSUFFICIENT_FUNDS") {
      res.status(400).json({ error: "Bad Request", message: "Insufficient funds" });
    } else if (msg === "NO_INSTANCE") {
      res.status(400).json({ error: "Bad Request", message: "No available board instance" });
    } else if (msg === "BOARD_FULL") {
      res.status(409).json({ error: "Conflict", message: "Board is already full — try again" });
    } else if (msg === "ALREADY_JOINED") {
      res.status(409).json({ error: "Conflict", message: "You are already a participant in this board instance" });
    } else {
      console.error("Board payment error:", err);
      res.status(500).json({ error: "Internal Server Error", message: "Payment failed" });
    }
  }
});

export default router;
