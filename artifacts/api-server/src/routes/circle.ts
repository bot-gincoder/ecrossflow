import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import {
  usersTable,
  walletsTable,
  userWalletsTable,
  internalWalletBalancesTable,
  withdrawalsTable,
  walletAuditLogsTable,
  transactionsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireActiveAuth as requireAuth, type AuthRequest } from "../middlewares/auth.js";
import {
  createCircleTransfer,
  createCircleWallet,
  getCircleAllowedAsset,
  getCircleAllowedNetwork,
  isCircleAllowedRail,
  isCircleConfigured,
  isCirclePrimary,
  listCircleSupportedAssets,
  resolveCircleTokenId,
} from "../services/circle.js";
import { ensureLedgerInfra, ensureWalletAndLedgerAccounts, moveAvailableToBlocked } from "../lib/ledger.js";

const router: IRouter = Router();

async function syncInternalBalances(userId: string): Promise<void> {
  const rows = await db.select({
    balanceUsd: walletsTable.balanceUsd,
    balancePending: walletsTable.balancePending,
    balanceReserved: walletsTable.balanceReserved,
  }).from(walletsTable).where(eq(walletsTable.userId, userId)).limit(1);
  if (!rows.length) return;
  const w = rows[0];
  const existing = await db.select({ id: internalWalletBalancesTable.id })
    .from(internalWalletBalancesTable)
    .where(eq(internalWalletBalancesTable.userId, userId))
    .limit(1);
  if (!existing.length) {
    await db.insert(internalWalletBalancesTable).values({
      userId,
      availableBalance: w.balanceUsd,
      pendingBalance: w.balancePending,
      lockedBalance: w.balanceReserved,
    });
    return;
  }
  await db.update(internalWalletBalancesTable)
    .set({
      availableBalance: w.balanceUsd,
      pendingBalance: w.balancePending,
      lockedBalance: w.balanceReserved,
      updatedAt: new Date(),
    })
    .where(eq(internalWalletBalancesTable.userId, userId));
}

async function ensureUserCircleWallet(userId: string, network: string): Promise<{ id: string; circleWalletId: string; blockchainAddress: string; network: string }> {
  const existing = await db.select()
    .from(userWalletsTable)
    .where(and(
      eq(userWalletsTable.userId, userId),
      eq(userWalletsTable.network, network),
    ))
    .limit(1);
  if (existing.length) {
    return existing[0];
  }

  if (!isCircleConfigured()) throw new Error("CIRCLE_NOT_CONFIGURED");
  const created = await createCircleWallet({ blockchain: network });
  const [row] = await db.insert(userWalletsTable).values({
    userId,
    circleWalletId: created.circleWalletId,
    blockchainAddress: created.address,
    network,
    status: "ACTIVE",
    metadata: created.raw,
  }).returning();

  await db.insert(walletAuditLogsTable).values({
    userId,
    type: "WALLET_CREATED",
    referenceType: "USER_WALLET",
    referenceId: row.id,
    details: `Circle wallet created for ${network}`,
    payload: created.raw,
  });

  return row;
}

router.get("/wallet/circle/config", requireAuth as never, async (_req: AuthRequest, res) => {
  res.json({
    enabled: isCirclePrimary(),
    configured: isCircleConfigured(),
  });
});

router.get("/wallet/circle/assets", requireAuth as never, async (_req: AuthRequest, res) => {
  res.json({
    assets: listCircleSupportedAssets(),
    enabled: isCirclePrimary(),
    configured: isCircleConfigured(),
  });
});

router.get("/wallet/circle/address", requireAuth as never, async (req: AuthRequest, res) => {
  await ensureLedgerInfra();
  const userId = req.userId!;
  const allowedNetwork = getCircleAllowedNetwork();
  const networkQuery = String((req.query.network as string) || allowedNetwork).trim().toUpperCase();
  if (networkQuery && networkQuery !== allowedNetwork) {
    res.status(400).json({
      error: "Bad Request",
      message: `Only ${allowedNetwork} network is allowed for crypto deposits`,
    });
    return;
  }
  await ensureWalletAndLedgerAccounts(db, userId, "USD");
  const user = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user.length) {
    res.status(404).json({ error: "Not Found", message: "User not found" });
    return;
  }

  try {
    const wallet = await ensureUserCircleWallet(userId, allowedNetwork);
    await syncInternalBalances(userId);
    res.json({
      walletId: wallet.id,
      circleWalletId: wallet.circleWalletId,
      address: wallet.blockchainAddress,
      network: wallet.network,
      status: wallet.status,
    });
  } catch (error) {
    res.status(503).json({
      error: "Service Unavailable",
      message: "Circle wallet provisioning failed",
      detail: error instanceof Error ? error.message : "CIRCLE_CREATE_WALLET_FAILED",
    });
  }
});

router.get("/wallet/circle/addresses", requireAuth as never, async (req: AuthRequest, res) => {
  const rows = await db.select()
    .from(userWalletsTable)
    .where(eq(userWalletsTable.userId, req.userId!));
  res.json({
    wallets: rows.map((r) => ({
      id: r.id,
      circleWalletId: r.circleWalletId,
      address: r.blockchainAddress,
      network: r.network,
      status: r.status,
    })),
  });
});

router.post("/wallet/circle/withdraw", requireAuth as never, async (req: AuthRequest, res) => {
  await ensureLedgerInfra();
  const userId = req.userId!;
  const { destinationAddress, amountUsd, asset, network } = req.body as {
    destinationAddress?: string;
    amountUsd?: number;
    asset?: string;
    network?: string;
  };

  if (!destinationAddress || !amountUsd || !asset || !network) {
    res.status(400).json({ error: "Bad Request", message: "destinationAddress, amountUsd, asset, network are required" });
    return;
  }
  const allowedAsset = getCircleAllowedAsset();
  const allowedNetwork = getCircleAllowedNetwork();
  if (!isCircleAllowedRail(String(asset), String(network))) {
    res.status(400).json({
      error: "Bad Request",
      message: `Only ${allowedAsset} on ${allowedNetwork} is supported`,
    });
    return;
  }
  const amount = Number(amountUsd);
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "Bad Request", message: "amountUsd must be a positive number" });
    return;
  }

  const tokenId = resolveCircleTokenId(String(asset), String(network));
  if (!tokenId) {
    res.status(400).json({
      error: "Bad Request",
      message: "No Circle token mapping found for this asset/network. Configure CIRCLE_TOKEN_ID_MAP_JSON.",
    });
    return;
  }

  await ensureWalletAndLedgerAccounts(db, userId, "USD");
  const walletRows = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId)).limit(1);
  if (!walletRows.length) {
    res.status(404).json({ error: "Not Found", message: "Internal wallet not found" });
    return;
  }
  if (parseFloat(walletRows[0].balanceUsd) < amount) {
    res.status(400).json({ error: "Bad Request", message: "Insufficient available balance" });
    return;
  }

  const sourceWallet = await ensureUserCircleWallet(userId, allowedNetwork);
  const reference = `CIR-WDR-${randomUUID()}`;

  const result = await db.transaction(async (tx) => {
    await moveAvailableToBlocked(tx, {
      userId,
      amountUsd: amount,
      currency: "USD",
      idempotencyKey: `circle:withdraw:block:${reference}`,
      description: `Circle withdraw lock ${reference}`,
      metadata: { asset, network, destinationAddress },
    });

    const [txRow] = await tx.insert(transactionsTable).values({
      userId,
      type: "WITHDRAWAL",
      amount: String(amount),
      amountUsd: String(amount),
      currency: "USD",
      status: "PROCESSING",
      paymentMethod: "CRYPTO",
      referenceId: reference,
      description: `Circle withdrawal ${asset} ${network}`,
      metadata: {
        provider: "CIRCLE",
        circleSourceWalletId: sourceWallet.circleWalletId,
        destinationAddress,
        asset,
        network,
      },
    }).returning();

    const [withdrawal] = await tx.insert(withdrawalsTable).values({
      userId,
      transactionId: txRow.id,
      destinationAddress,
      asset: String(asset).toUpperCase(),
      amount: String(amount),
      amountUsd: String(amount),
      fee: "0",
      network: String(network).toUpperCase(),
      status: "PENDING",
    }).returning();

    await tx.update(transactionsTable)
      .set({
        metadata: {
          ...(txRow.metadata && typeof txRow.metadata === "object" ? txRow.metadata : {}),
          withdrawalId: withdrawal.id,
        },
      })
      .where(eq(transactionsTable.id, txRow.id));

    await tx.insert(walletAuditLogsTable).values({
      userId,
      type: "WITHDRAW_REQUESTED",
      referenceType: "WITHDRAWAL",
      referenceId: withdrawal.id,
      details: `Circle withdrawal requested (${asset} ${network})`,
      payload: { amountUsd: amount, destinationAddress, sourceWalletId: sourceWallet.circleWalletId },
    });

    return { withdrawal, txRow };
  });

  try {
    const transfer = await createCircleTransfer({
      walletId: sourceWallet.circleWalletId,
      destinationAddress: String(destinationAddress),
      amount: String(amount),
      tokenId,
      idempotencyKey: reference,
    });

    await db.update(withdrawalsTable)
      .set({
        status: "PROCESSING",
        circleTransferId: transfer.transferId,
        rawPayload: transfer.raw,
      })
      .where(eq(withdrawalsTable.id, result.withdrawal.id));

    await db.update(transactionsTable)
      .set({
        metadata: {
          ...(result.txRow.metadata && typeof result.txRow.metadata === "object" ? result.txRow.metadata : {}),
          circleTransferId: transfer.transferId,
          circleState: transfer.state,
        },
      })
      .where(eq(transactionsTable.id, result.txRow.id));

    await db.insert(walletAuditLogsTable).values({
      userId,
      type: "WITHDRAW_BROADCASTED",
      referenceType: "WITHDRAWAL",
      referenceId: result.withdrawal.id,
      details: `Circle transfer submitted: ${transfer.transferId}`,
      payload: transfer.raw,
    });

    await syncInternalBalances(userId);
    res.status(201).json({
      withdrawalId: result.withdrawal.id,
      transactionId: result.txRow.id,
      circleTransferId: transfer.transferId,
      status: "PROCESSING",
    });
  } catch (error) {
    await db.update(withdrawalsTable)
      .set({ status: "FAILED", processedAt: new Date() })
      .where(eq(withdrawalsTable.id, result.withdrawal.id));
    await db.update(transactionsTable)
      .set({ status: "FAILED", adminNote: error instanceof Error ? error.message : "CIRCLE_WITHDRAW_FAILED", updatedAt: new Date() })
      .where(eq(transactionsTable.id, result.txRow.id));
    res.status(502).json({
      error: "Bad Gateway",
      message: "Circle withdrawal failed",
      detail: error instanceof Error ? error.message : "CIRCLE_WITHDRAW_FAILED",
    });
  }
});

export default router;
