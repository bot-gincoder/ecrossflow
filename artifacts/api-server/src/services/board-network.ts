import { db } from "@workspace/db";
import {
  boardsTable,
  usersTable,
  transactionsTable,
  notificationsTable,
  bonusesTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { adjustAvailableWithTreasury } from "../lib/ledger.js";
import { getSystemSetting } from "./system-config.js";

export const BOARD_ORDER = ["F", "E", "D", "C", "B", "A", "S"] as const;

type DbExecutor = {
  execute: typeof db.execute;
  select: typeof db.select;
  update: typeof db.update;
  insert: typeof db.insert;
};

export type ValidatedAccount = {
  id: string;
  username: string;
  role: "USER" | "ADMIN";
  status: "PENDING" | "ACTIVE" | "SUSPENDED";
  accountNumber: number;
  currentBoard: string | null;
  referredBy: string | null;
  createdAt: Date;
  activatedAt: Date | null;
};

export type StrategicLeafNumbers = {
  n1: number;
  n2: number;
  n3: number;
  n4: number;
  n5: number;
  n6: number;
  n7: number;
  n8: number;
  n9: number;
  n10: number;
  n11: number;
  n4_2: number;
  n4_2p1: number;
  n5_2: number;
  n5_2p1: number;
};

export type TreeRole = "RANKER" | "LEADER" | "CHALLENGER" | "STARTER";

export type StrategicPlacement = {
  rootUserId: string;
  rootNumber: number;
  role: TreeRole;
  position: number;
  slot: string;
  strategicNumber: number;
};

export function computeStrategicLeafNumbers(n1: number): StrategicLeafNumbers {
  const n2 = n1 * 2;
  const n3 = n1 * 2 + 1;
  const n4 = n3 * 2;
  const n5 = n3 * 2 + 1;
  const n6 = n2 * 2 + 1;
  const n7 = n2 * 2;
  const n8 = n6 * 2 + 1;
  const n9 = n6 * 2;
  const n10 = n7 * 2 + 1;
  const n11 = n7 * 2;
  return {
    n1,
    n2,
    n3,
    n4,
    n5,
    n6,
    n7,
    n8,
    n9,
    n10,
    n11,
    n4_2: n4 * 2,
    n4_2p1: n4 * 2 + 1,
    n5_2: n5 * 2,
    n5_2p1: n5 * 2 + 1,
  };
}

export function treeSlotByNumber(rootNumber: number, targetNumber: number): { role: TreeRole; position: number; slot: string } | null {
  const n = computeStrategicLeafNumbers(rootNumber);
  if (targetNumber === n.n1) return { role: "RANKER", position: 0, slot: "N1" };
  if (targetNumber === n.n2) return { role: "LEADER", position: 1, slot: "N2" };
  if (targetNumber === n.n3) return { role: "LEADER", position: 2, slot: "N3" };
  if (targetNumber === n.n6) return { role: "CHALLENGER", position: 1, slot: "N6" };
  if (targetNumber === n.n7) return { role: "CHALLENGER", position: 2, slot: "N7" };
  if (targetNumber === n.n4) return { role: "CHALLENGER", position: 3, slot: "N4" };
  if (targetNumber === n.n5) return { role: "CHALLENGER", position: 4, slot: "N5" };
  if (targetNumber === n.n8) return { role: "STARTER", position: 1, slot: "N6*2+1" };
  if (targetNumber === n.n9) return { role: "STARTER", position: 2, slot: "N6*2" };
  if (targetNumber === n.n10) return { role: "STARTER", position: 3, slot: "N7*2+1" };
  if (targetNumber === n.n11) return { role: "STARTER", position: 4, slot: "N7*2" };
  if (targetNumber === n.n4_2) return { role: "STARTER", position: 5, slot: "N4*2" };
  if (targetNumber === n.n4_2p1) return { role: "STARTER", position: 6, slot: "N4*2+1" };
  if (targetNumber === n.n5_2) return { role: "STARTER", position: 7, slot: "N5*2" };
  if (targetNumber === n.n5_2p1) return { role: "STARTER", position: 8, slot: "N5*2+1" };
  return null;
}

const ROLE_PROGRESS_SCORE: Record<TreeRole, number> = {
  STARTER: 1,
  CHALLENGER: 2,
  LEADER: 3,
  RANKER: 4,
};

export function findStrategicPlacementForBoard(
  accounts: ValidatedAccount[],
  targetUserId: string,
  boardId: string,
): StrategicPlacement | null {
  const target = accounts.find((u) => u.id === targetUserId);
  if (!target) return null;

  const normalizedBoard = String(boardId || "").toUpperCase();
  const roots = accounts.filter((u) => (u.currentBoard || "F").toUpperCase() === normalizedBoard);
  if (!roots.length) return null;

  const candidates = roots
    .map((root) => {
      const slot = treeSlotByNumber(root.accountNumber, target.accountNumber);
      if (!slot) return null;
      return {
        rootUserId: root.id,
        rootNumber: root.accountNumber,
        role: slot.role,
        position: slot.position,
        slot: slot.slot,
        strategicNumber: target.accountNumber,
        selfRoot: root.accountNumber === target.accountNumber,
      };
    })
    .filter((x): x is StrategicPlacement & { selfRoot: boolean } => Boolean(x));

  if (!candidates.length) return null;

  const nonSelf = candidates.filter((c) => !c.selfRoot);
  const pool = nonSelf.length ? nonSelf : candidates;
  pool.sort((a, b) => {
    const scoreDelta = ROLE_PROGRESS_SCORE[b.role] - ROLE_PROGRESS_SCORE[a.role];
    if (scoreDelta !== 0) return scoreDelta;
    return a.rootNumber - b.rootNumber;
  });
  const picked = pool[0];
  return {
    rootUserId: picked.rootUserId,
    rootNumber: picked.rootNumber,
    role: picked.role,
    position: picked.position,
    slot: picked.slot,
    strategicNumber: picked.strategicNumber,
  };
}

export async function fetchValidatedAccounts(executor: DbExecutor = db): Promise<ValidatedAccount[]> {
  await backfillValidatedQueueNumbers(executor);
  const rows = await executor.execute(sql<ValidatedAccount>`
    SELECT
      u.id,
      u.username,
      u.role,
      u.status,
      u.account_number AS "accountNumber",
      u.current_board AS "currentBoard",
      u.referred_by AS "referredBy",
      u.created_at AS "createdAt",
      u.activated_at AS "activatedAt"
    FROM users u
    WHERE u.role <> 'ADMIN'
      AND u.account_number IS NOT NULL
      AND (
        (
          EXISTS (
            SELECT 1
            FROM transactions p
            WHERE p.user_id = u.id
              AND p.type = 'BOARD_PAYMENT'
              AND p.status = 'COMPLETED'
              AND (
                p.from_board = 'F'
                OR COALESCE(p.description, '') ILIKE '%board F%'
              )
          )
        )
        OR (
          u.status = 'ACTIVE'
          AND u.current_board IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM transactions p_legacy
            WHERE p_legacy.user_id = u.id
              AND p_legacy.type = 'BOARD_PAYMENT'
              AND p_legacy.status = 'COMPLETED'
          )
        )
      )
    ORDER BY u.account_number ASC
  `);
  const result = (rows as unknown as { rows?: ValidatedAccount[] }).rows || [];
  return result.filter((r) => Number.isFinite(r.accountNumber) && r.accountNumber > 0);
}

export async function backfillValidatedQueueNumbers(executor: DbExecutor = db): Promise<number> {
  const rows = await executor.execute(sql<{ id: string }>`
    SELECT u.id
    FROM users u
    WHERE u.role <> 'ADMIN'
      AND u.account_number IS NULL
      AND (
        (
          EXISTS (
            SELECT 1
            FROM transactions p
            WHERE p.user_id = u.id
              AND p.type = 'BOARD_PAYMENT'
              AND p.status = 'COMPLETED'
              AND (
                p.from_board = 'F'
                OR COALESCE(p.description, '') ILIKE '%board F%'
              )
          )
        )
        OR (
          u.status = 'ACTIVE'
          AND u.current_board IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM transactions p_legacy
            WHERE p_legacy.user_id = u.id
              AND p_legacy.type = 'BOARD_PAYMENT'
              AND p_legacy.status = 'COMPLETED'
          )
        )
      )
    ORDER BY COALESCE(u.activated_at, u.created_at) ASC
  `);

  const items = (rows as unknown as { rows?: Array<{ id: string }> }).rows || [];
  let assigned = 0;
  for (const user of items) {
    const before = await executor.select({ accountNumber: usersTable.accountNumber })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);
    const had = before.length ? before[0].accountNumber : null;
    await assignInvestorQueueNumberIfNeeded(executor, user.id);
    const after = await executor.select({ accountNumber: usersTable.accountNumber })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);
    const has = after.length ? after[0].accountNumber : null;
    if (!had && has) assigned += 1;
  }
  return assigned;
}

export async function isUserValidated(executor: DbExecutor = db, userId: string): Promise<boolean> {
  const rows = await executor.execute(sql<{ ok: boolean }>`
    SELECT (
      EXISTS (
        SELECT 1 FROM transactions p
        WHERE p.user_id = ${userId}
          AND p.type = 'BOARD_PAYMENT'
          AND p.status = 'COMPLETED'
          AND (
            p.from_board = 'F'
            OR COALESCE(p.description, '') ILIKE '%board F%'
          )
      )
      OR (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = ${userId}
            AND u.status = 'ACTIVE'
            AND u.current_board IS NOT NULL
        )
        AND EXISTS (
          SELECT 1 FROM transactions p_any
          WHERE p_any.user_id = ${userId}
            AND p_any.type = 'BOARD_PAYMENT'
            AND p_any.status = 'COMPLETED'
        )
      )
    ) AS ok
  `);
  const ok = (rows as unknown as { rows?: Array<{ ok: boolean }> }).rows?.[0]?.ok;
  if (Boolean(ok)) return true;

  const userRows = await executor.select({
    role: usersTable.role,
    status: usersTable.status,
    currentBoard: usersTable.currentBoard,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!userRows.length) return false;
  const u = userRows[0];
  if (u.role === "ADMIN" || u.status !== "ACTIVE" || !u.currentBoard) return false;
  const paidRows = await executor.select({ id: transactionsTable.id })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.userId, userId),
      eq(transactionsTable.type, "BOARD_PAYMENT"),
      eq(transactionsTable.status, "COMPLETED"),
    ))
    .limit(1);
  return paidRows.length > 0;
}

export async function assignInvestorQueueNumberIfNeeded(executor: DbExecutor, userId: string): Promise<void> {
  const users = await executor.select({
    id: usersTable.id,
    username: usersTable.username,
    role: usersTable.role,
    accountNumber: usersTable.accountNumber,
  })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .for("update")
    .limit(1);

  if (!users.length) return;
  const user = users[0];
  if (user.role === "ADMIN") return;
  if (user.accountNumber) return;

  const validated = await isUserValidated(executor, userId);
  if (!validated) return;

  const isCeo = user.username.toLowerCase() === "ceo";
  if (isCeo) {
    const ownerOfOne = await executor.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.accountNumber, 1))
      .limit(1);
    if (!ownerOfOne.length || ownerOfOne[0].id === user.id) {
      await executor.update(usersTable)
        .set({ accountNumber: 1 })
        .where(eq(usersTable.id, user.id));
      return;
    }
  }

  await executor.execute(sql`CREATE SEQUENCE IF NOT EXISTS investor_queue_seq START 2 INCREMENT 1 MINVALUE 2;`);
  await executor.execute(sql`
    SELECT setval(
      'investor_queue_seq',
      GREATEST(COALESCE((SELECT MAX(account_number) FROM users), 1) + 1, 2),
      false
    );
  `);
  const next = await executor.execute(sql<{ next_value: number }>`SELECT nextval('investor_queue_seq')::int AS next_value;`);
  const nextValue = Number(next.rows?.[0]?.next_value ?? 2);

  await executor.update(usersTable)
    .set({ accountNumber: nextValue })
    .where(eq(usersTable.id, user.id));
}

function parseMoney(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

async function getReferralBonusByBoard(boardId: string): Promise<number> {
  const defaults: Record<string, number> = {
    F: 0.5,
    E: 0.25,
    D: 0.25,
    C: 0.25,
    B: 0.062,
    A: 0.062,
    S: 0.062,
  };
  const raw = await getSystemSetting<Record<string, unknown>>("board_referral_bonus", defaults);
  const parsed = typeof raw === "object" && raw ? raw : defaults;
  const num = Number.parseFloat(String(parsed[boardId] ?? defaults[boardId] ?? 0));
  return Number.isFinite(num) && num > 0 ? num : 0;
}

async function getMinimumDirectReferralsRequired(): Promise<number> {
  const raw = await getSystemSetting<number>("board_min_direct_referrals", 2);
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return 2;
  return Math.max(0, n);
}

async function isCeoBootstrapFullBoardRequired(): Promise<boolean> {
  const raw = await getSystemSetting<unknown>("ceo_bootstrap_full_board_f_required", true);
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") return raw.toLowerCase() === "true";
  if (typeof raw === "number") return raw !== 0;
  return true;
}

function requiredFullBoardNumbers(rootNumber: number): number[] {
  const n = computeStrategicLeafNumbers(rootNumber);
  return [n.n2, n.n3, n.n4, n.n5, n.n6, n.n7, n.n8, n.n9, n.n10, n.n11, n.n4_2, n.n4_2p1, n.n5_2, n.n5_2p1];
}

async function countDirectValidatedReferrals(executor: DbExecutor, userId: string): Promise<number> {
  const rows = await executor.execute(sql<{ c: number }>`
    SELECT COUNT(*)::int AS c
    FROM users child
    WHERE child.referred_by = ${userId}
      AND child.role <> 'ADMIN'
      AND (
        EXISTS (
          SELECT 1
          FROM transactions p
          WHERE p.user_id = child.id
            AND p.type = 'BOARD_PAYMENT'
            AND p.status = 'COMPLETED'
            AND (
              p.from_board = 'F'
              OR COALESCE(p.description, '') ILIKE '%board F%'
            )
        )
        OR (
          child.status = 'ACTIVE'
          AND child.current_board IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM transactions p_any
            WHERE p_any.user_id = child.id
              AND p_any.type = 'BOARD_PAYMENT'
              AND p_any.status = 'COMPLETED'
          )
        )
      )
  `);
  const countValue = (rows as unknown as { rows?: Array<{ c: number }> }).rows?.[0]?.c || 0;
  return Number(countValue);
}

export async function creditActivationReferralBonuses(executor: DbExecutor, userId: string, boardId: string): Promise<void> {
  const directBonus = await getReferralBonusByBoard(boardId);
  if (directBonus <= 0) return;

  const invitedRows = await executor.select({ referredBy: usersTable.referredBy })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!invitedRows.length || !invitedRows[0].referredBy) return;

  const directReferrerId = invitedRows[0].referredBy;
  const directReferrerRows = await executor.select({ referredBy: usersTable.referredBy })
    .from(usersTable)
    .where(eq(usersTable.id, directReferrerId))
    .limit(1);
  const secondReferrerId = directReferrerRows.length ? directReferrerRows[0].referredBy : null;

  const credit = async (beneficiaryId: string, amount: number, level: 1 | 2) => {
    if (amount <= 0) return;
    const referenceId = `REF:${boardId}:${userId}:${beneficiaryId}:L${level}`;
    const existing = await executor.select({ id: transactionsTable.id })
      .from(transactionsTable)
      .where(eq(transactionsTable.referenceId, referenceId))
      .limit(1);
    if (existing.length) return;

    const [tx] = await executor.insert(transactionsTable).values({
      userId: beneficiaryId,
      type: "REFERRAL_BONUS",
      amount: amount.toFixed(2),
      currency: "USD",
      amountUsd: amount.toFixed(2),
      status: "COMPLETED",
      paymentMethod: "SYSTEM",
      fromBoard: boardId,
      toUserId: userId,
      referenceId,
      description: `Referral bonus L${level} from activation on board ${boardId}`,
    }).returning();

    await adjustAvailableWithTreasury(executor as never, {
      userId: beneficiaryId,
      transactionId: tx.id,
      deltaUsd: amount,
      currency: "USD",
      idempotencyKey: `referral:bonus:${boardId}:${userId}:${beneficiaryId}:L${level}`,
      description: `Referral bonus L${level} board ${boardId}`,
      metadata: {
        sourceUserId: userId,
        boardId,
        generation: level,
      },
    });

    await executor.insert(bonusesTable).values({
      userId: beneficiaryId,
      type: "REFERRAL_3",
      amount: amount.toFixed(2),
      status: "PAID",
      triggerEvent: `activation:${userId}:board:${boardId}:L${level}`,
    });

    await executor.insert(notificationsTable).values({
      userId: beneficiaryId,
      type: "REFERRAL_BONUS",
      title: "Bonus de parrainage crédité",
      message: `Vous avez reçu $${amount.toFixed(2)} de bonus de parrainage (niveau ${level}).`,
      category: "financial",
      actionUrl: "/wallet",
      read: false,
    });
  };

  await credit(directReferrerId, directBonus, 1);
  if (secondReferrerId) {
    await credit(secondReferrerId, directBonus / 2, 2);
  }
}

async function hasPromotionRecord(executor: DbExecutor, userId: string, boardId: string): Promise<boolean> {
  const rows = await executor.select({ id: transactionsTable.id })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.userId, userId),
      eq(transactionsTable.type, "BOARD_PROMOTION"),
      eq(transactionsTable.fromBoard, boardId),
      eq(transactionsTable.status, "COMPLETED"),
    ))
    .limit(1);
  return rows.length > 0;
}

export async function evaluateBoardProgressions(executor: DbExecutor): Promise<number> {
  const boardRows = await executor.select({
    id: boardsTable.id,
    totalGain: boardsTable.totalGain,
    nextBoardDeduction: boardsTable.nextBoardDeduction,
    withdrawable: boardsTable.withdrawable,
  }).from(boardsTable);
  const boardMap = new Map(boardRows.map((b) => [b.id, b]));
  const minimumDirectReferrals = await getMinimumDirectReferralsRequired();
  const ceoBootstrapFullBoardRequired = await isCeoBootstrapFullBoardRequired();

  let promoted = 0;
  const validated = await fetchValidatedAccounts(executor);
  const byNumber = new Map(validated.map((u) => [u.accountNumber, u]));

  for (const user of validated) {
    const currentBoard = (user.currentBoard || "F").toUpperCase();
    const boardIndex = BOARD_ORDER.indexOf(currentBoard as (typeof BOARD_ORDER)[number]);
    if (boardIndex < 0 || boardIndex >= BOARD_ORDER.length - 1) continue;

    if (
      ceoBootstrapFullBoardRequired &&
      user.username.toLowerCase() === "ceo" &&
      user.accountNumber === 1 &&
      currentBoard === "F"
    ) {
      const fullBoardOk = requiredFullBoardNumbers(user.accountNumber).every((n) => {
        const participant = byNumber.get(n);
        if (!participant) return false;
        return (participant.currentBoard || "F").toUpperCase() === "F";
      });
      if (!fullBoardOk) continue;
    }

    const left = byNumber.get(user.accountNumber * 2);
    const right = byNumber.get(user.accountNumber * 2 + 1);
    if (!left || !right) continue;

    // Promotion is board-scoped: both direct children must be active on the same board.
    const leftBoard = (left.currentBoard || "F").toUpperCase();
    const rightBoard = (right.currentBoard || "F").toUpperCase();
    if (leftBoard !== currentBoard || rightBoard !== currentBoard) continue;

    const directValidatedReferrals = await countDirectValidatedReferrals(executor, user.id);
    if (directValidatedReferrals < minimumDirectReferrals) continue;
    if (await hasPromotionRecord(executor, user.id, currentBoard)) continue;

    const boardData = boardMap.get(currentBoard);
    if (!boardData) continue;
    const nextBoard = BOARD_ORDER[boardIndex + 1];

    const withdrawable = parseMoney(boardData.withdrawable);
    const nextDeduction = parseMoney(boardData.nextBoardDeduction);
    const totalGain = parseMoney(boardData.totalGain);
    const systemFee = Math.max(0, totalGain - withdrawable - nextDeduction);

    const receiptRef = `RECEIPT:${currentBoard}:${user.id}`;
    let receiptTxId: string | null = null;
    const receiptExisting = await executor.select({ id: transactionsTable.id })
      .from(transactionsTable)
      .where(eq(transactionsTable.referenceId, receiptRef))
      .limit(1);
    if (receiptExisting.length) {
      receiptTxId = receiptExisting[0].id;
    } else if (withdrawable > 0) {
      const [receiptTx] = await executor.insert(transactionsTable).values({
        userId: user.id,
        type: "BOARD_RECEIPT",
        amount: withdrawable.toFixed(2),
        currency: "USD",
        amountUsd: withdrawable.toFixed(2),
        status: "COMPLETED",
        paymentMethod: "SYSTEM",
        fromBoard: currentBoard,
        referenceId: receiptRef,
        description: `Board ${currentBoard} completed - payout`,
      }).returning();
      receiptTxId = receiptTx.id;
    }

    if (withdrawable > 0 && receiptTxId) {
      await adjustAvailableWithTreasury(executor as never, {
        userId: user.id,
        transactionId: receiptTxId,
        deltaUsd: withdrawable,
        currency: "USD",
        idempotencyKey: `board:payout:${currentBoard}:${user.id}`,
        description: `Board ${currentBoard} completion payout`,
        metadata: { boardId: currentBoard, phase: "BOARD_PAYOUT" },
      });
    }

    if (systemFee > 0) {
      const feeRef = `FEE:${currentBoard}:${user.id}`;
      const feeExisting = await executor.select({ id: transactionsTable.id })
        .from(transactionsTable)
        .where(eq(transactionsTable.referenceId, feeRef))
        .limit(1);
      if (!feeExisting.length) {
        await executor.insert(transactionsTable).values({
          userId: user.id,
          type: "SYSTEM_FEE",
          amount: systemFee.toFixed(2),
          currency: "USD",
          amountUsd: systemFee.toFixed(2),
          status: "COMPLETED",
          paymentMethod: "SYSTEM",
          fromBoard: currentBoard,
          referenceId: feeRef,
          description: `System fee retained on board ${currentBoard}`,
        });
      }
    }

    const promoteRef = `PROMOTE:${currentBoard}:${user.id}`;
    await executor.insert(transactionsTable).values({
      userId: user.id,
      type: "BOARD_PROMOTION",
      amount: Math.max(nextDeduction, 0.01).toFixed(2),
      currency: "USD",
      amountUsd: Math.max(nextDeduction, 0.01).toFixed(2),
      status: "COMPLETED",
      paymentMethod: "SYSTEM",
      fromBoard: currentBoard,
      referenceId: promoteRef,
      description: `Promoted from ${currentBoard} to ${nextBoard}`,
    });

    await executor.update(usersTable)
      .set({ currentBoard: nextBoard })
      .where(eq(usersTable.id, user.id));

    await executor.insert(notificationsTable).values({
      userId: user.id,
      type: "BOARD_PROMOTED",
      title: `Niveau ${nextBoard} débloqué`,
      message: `Votre parcours progresse automatiquement de ${currentBoard} vers ${nextBoard}.`,
      category: "financial",
      actionUrl: "/boards",
      read: false,
    });

    promoted += 1;
  }

  return promoted;
}
