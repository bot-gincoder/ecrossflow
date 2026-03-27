import { Router, type IRouter } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  paymentEventsTable,
  transactionsTable,
  notificationsTable,
  depositsTable,
  withdrawalsTable,
  userWalletsTable,
  walletAuditLogsTable,
} from "@workspace/db";
import { creditAvailableFromTreasury, ensureLedgerInfra, releaseBlockedToAvailable, settleBlockedToTreasury } from "../lib/ledger.js";
import {
  canonicalizeNowpaymentsEvent,
  canonicalizeOxaPayEvent,
  getNowpaymentsIpnSecret,
  verifyOxaPayCallbackToken,
  verifyNowpaymentsSignature,
} from "../services/crypto-provider.js";
import { getCircleAllowedAsset, getCircleAllowedNetwork, isCircleAllowedRail, isCirclePrimary } from "../services/circle.js";

const router: IRouter = Router();
let paymentsInfraReady = false;
let paymentsInfraPromise: Promise<void> | null = null;

type WebhookStatus = "COMPLETED" | "FAILED" | "CANCELLED";
type CanonicalWebhook = {
  eventId: string;
  eventType: string;
  referenceId: string;
  status: WebhookStatus;
  amountUsd?: string | number;
  currency?: string;
  providerTxId?: string;
};

function normalizeProvider(raw: string): string {
  return raw.trim().toUpperCase();
}

function getProviderSecret(provider: string): string {
  return process.env[`PAYMENT_WEBHOOK_SECRET_${provider}`] || process.env.PAYMENT_WEBHOOK_SECRET || "";
}

function normalizeStatus(raw: unknown): WebhookStatus | null {
  const s = String(raw || "").toUpperCase();
  if (s === "COMPLETED" || s === "FAILED" || s === "CANCELLED") return s;
  return null;
}

function verifySignature(secret: string, timestamp: string, body: unknown, provided: string): boolean {
  const payload = `${timestamp}.${JSON.stringify(body ?? {})}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const signature = provided.startsWith("sha256=") ? provided.slice(7) : provided;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

function withinTimeSkew(timestampSec: string): boolean {
  const maxSkew = Number.parseInt(process.env.PAYMENT_WEBHOOK_MAX_SKEW_SECONDS || "300", 10);
  const ts = Number.parseInt(timestampSec, 10);
  if (!Number.isFinite(ts) || !Number.isFinite(maxSkew)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return Math.abs(nowSec - ts) <= maxSkew;
}

function canonicalizePayload(provider: string, payload: Record<string, unknown>): CanonicalWebhook | null {
  const generic = {
    eventId: String(payload.eventId || payload.event_id || payload.id || ""),
    eventType: String(payload.eventType || payload.event_type || payload.type || "PAYMENT_UPDATE"),
    referenceId: String(payload.referenceId || payload.reference_id || payload.reference || payload.order_id || ""),
    status: normalizeStatus(payload.status || payload.payment_status || payload.state),
    amountUsd: payload.amountUsd ?? payload.amount_usd ?? payload.amount,
    currency: payload.currency ? String(payload.currency) : undefined,
    providerTxId: String(payload.providerTxId || payload.provider_tx_id || payload.transaction_id || payload.txn_id || ""),
  };

  if (provider === "MONCASH" || provider === "NATCASH" || provider === "BANK" || provider === "CRYPTO") {
    if (!generic.eventId || !generic.referenceId || !generic.status) return null;
    return {
      eventId: generic.eventId.trim(),
      eventType: generic.eventType.trim(),
      referenceId: generic.referenceId.trim(),
      status: generic.status,
      amountUsd: generic.amountUsd as string | number | undefined,
      currency: generic.currency,
      providerTxId: generic.providerTxId || undefined,
    };
  }

  if (!generic.eventId || !generic.referenceId || !generic.status) return null;
  return {
    eventId: generic.eventId.trim(),
    eventType: generic.eventType.trim(),
    referenceId: generic.referenceId.trim(),
    status: generic.status,
    amountUsd: generic.amountUsd as string | number | undefined,
    currency: generic.currency,
    providerTxId: generic.providerTxId || undefined,
  };
}

async function ensurePaymentsInfra(): Promise<void> {
  if (paymentsInfraReady) return;
  if (paymentsInfraPromise) return paymentsInfraPromise;
  paymentsInfraPromise = (async () => {
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE payment_event_status AS ENUM ('RECEIVED','PROCESSED','IGNORED','FAILED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS payment_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        provider varchar(30) NOT NULL,
        event_id varchar(120) NOT NULL,
        event_type varchar(50) NOT NULL,
        reference_id varchar(100),
        transaction_id uuid REFERENCES transactions(id),
        status payment_event_status NOT NULL DEFAULT 'RECEIVED',
        payload jsonb NOT NULL,
        error text,
        received_at timestamptz NOT NULL DEFAULT now(),
        processed_at timestamptz
      );
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_events_provider_event_id ON payment_events(provider, event_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_payment_events_reference ON payment_events(reference_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_payment_events_transaction ON payment_events(transaction_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_payment_events_status_received ON payment_events(status, received_at);`);
    paymentsInfraReady = true;
  })();
  try {
    await paymentsInfraPromise;
  } finally {
    paymentsInfraPromise = null;
  }
}

async function processWebhookEvent(provider: string, canonical: CanonicalWebhook, payload: Record<string, unknown>) {
  const now = new Date();
  const [inserted] = await db.insert(paymentEventsTable).values({
    provider,
    eventId: canonical.eventId,
    eventType: canonical.eventType,
    referenceId: canonical.referenceId,
    status: "RECEIVED",
    payload,
  }).onConflictDoNothing({
    target: [paymentEventsTable.provider, paymentEventsTable.eventId],
  }).returning({
    id: paymentEventsTable.id,
  });

  let eventId = inserted?.id ?? "";
  if (!eventId) {
    const existing = await db.select({
      id: paymentEventsTable.id,
      status: paymentEventsTable.status,
    }).from(paymentEventsTable)
      .where(and(
        eq(paymentEventsTable.provider, provider),
        eq(paymentEventsTable.eventId, canonical.eventId),
      ))
      .limit(1);

    if (!existing.length) {
      return { alreadyProcessed: true as const };
    }

    eventId = existing[0].id;
    if (existing[0].status !== "FAILED") {
      return { alreadyProcessed: true as const };
    }

    await db.update(paymentEventsTable)
      .set({ status: "RECEIVED", error: null, processedAt: null })
      .where(eq(paymentEventsTable.id, eventId));
  }

  try {
    const outcome = await db.transaction(async (tx) => {
      const txRows = await tx.select().from(transactionsTable)
        .where(eq(transactionsTable.referenceId, canonical.referenceId))
        .for("update")
        .limit(1);

      if (!txRows.length) {
        await tx.update(paymentEventsTable)
          .set({ status: "IGNORED", error: `No transaction found for reference ${canonical.referenceId}`, processedAt: now })
          .where(eq(paymentEventsTable.id, eventId));
        return { processed: false as const, reason: "TX_NOT_FOUND" };
      }

      const paymentTx = txRows[0];
      const baseMeta = (paymentTx.metadata && typeof paymentTx.metadata === "object")
        ? paymentTx.metadata as Record<string, unknown>
        : {};
      const nextMeta = {
        ...baseMeta,
        provider,
        providerTxId: canonical.providerTxId || null,
        webhookStatus: canonical.status,
        webhookAt: now.toISOString(),
      };

      if (paymentTx.type === "DEPOSIT") {
        if (canonical.status === "COMPLETED" && paymentTx.status !== "COMPLETED") {
          const amount = parseFloat(paymentTx.amountUsd);
          await creditAvailableFromTreasury(tx, {
            userId: paymentTx.userId,
            transactionId: paymentTx.id,
            amountUsd: amount,
            currency: "USD",
            idempotencyKey: `deposit:settle:${paymentTx.id}`,
            description: `Deposit settled ${paymentTx.referenceId || paymentTx.id}`,
            metadata: {
              provider,
              providerTxId: canonical.providerTxId || null,
              phase: "DEPOSIT_SETTLED",
            },
          });

          await tx.update(transactionsTable)
            .set({ status: "COMPLETED", updatedAt: now, metadata: nextMeta })
            .where(eq(transactionsTable.id, paymentTx.id));

          await tx.insert(notificationsTable).values({
            userId: paymentTx.userId,
            type: "DEPOSIT_SETTLED",
            title: "Dépôt confirmé",
            message: `Votre dépôt ${paymentTx.referenceId || paymentTx.id} a été confirmé.`,
            category: "financial",
            actionUrl: "/wallet",
            read: false,
          });
        } else if (canonical.status !== "COMPLETED" && paymentTx.status === "PENDING") {
          await tx.update(transactionsTable)
            .set({ status: canonical.status === "FAILED" ? "FAILED" : "CANCELLED", updatedAt: now, metadata: nextMeta })
            .where(eq(transactionsTable.id, paymentTx.id));
        }
      } else if (paymentTx.type === "WITHDRAWAL") {
        if (canonical.status === "COMPLETED" && (paymentTx.status === "PROCESSING" || paymentTx.status === "PENDING")) {
          const amount = parseFloat(paymentTx.amountUsd);
          try {
            await settleBlockedToTreasury(tx, {
              userId: paymentTx.userId,
              transactionId: paymentTx.id,
              amountUsd: amount,
              currency: "USD",
              idempotencyKey: `withdraw:settle:${paymentTx.id}`,
              description: `Withdrawal settled ${paymentTx.referenceId || paymentTx.id}`,
              metadata: {
                provider,
                providerTxId: canonical.providerTxId || null,
                phase: "WITHDRAWAL_SETTLED",
              },
            });
          } catch (error) {
            const reason = error instanceof Error ? error.message : "WITHDRAW_SETTLE_FAILED";
            // Legacy compatibility: old withdrawals already debited available directly.
            if (reason !== "INSUFFICIENT_BLOCKED_BALANCE") throw error;
          }

          await tx.update(transactionsTable)
            .set({ status: "COMPLETED", updatedAt: now, metadata: nextMeta })
            .where(eq(transactionsTable.id, paymentTx.id));

          await tx.insert(notificationsTable).values({
            userId: paymentTx.userId,
            type: "WITHDRAWAL_SETTLED",
            title: "Retrait confirmé",
            message: `Votre retrait ${paymentTx.referenceId || paymentTx.id} a été confirmé par le fournisseur.`,
            category: "financial",
            actionUrl: "/wallet",
            read: false,
          });
        } else if ((canonical.status === "FAILED" || canonical.status === "CANCELLED") && (paymentTx.status === "PROCESSING" || paymentTx.status === "PENDING")) {
          const amount = parseFloat(paymentTx.amountUsd);
          try {
            await releaseBlockedToAvailable(tx, {
              userId: paymentTx.userId,
              transactionId: paymentTx.id,
              amountUsd: amount,
              currency: "USD",
              idempotencyKey: `withdraw:release:${paymentTx.id}`,
              description: `Withdrawal released ${paymentTx.referenceId || paymentTx.id}`,
              metadata: {
                provider,
                providerTxId: canonical.providerTxId || null,
                phase: "WITHDRAWAL_RELEASED",
              },
            });
          } catch (error) {
            const reason = error instanceof Error ? error.message : "WITHDRAW_RELEASE_FAILED";
            if (reason !== "INSUFFICIENT_BLOCKED_BALANCE") throw error;
            await creditAvailableFromTreasury(tx, {
              userId: paymentTx.userId,
              transactionId: paymentTx.id,
              amountUsd: amount,
              currency: "USD",
              idempotencyKey: `withdraw:legacy-refund:${paymentTx.id}`,
              description: `Legacy withdrawal refund ${paymentTx.referenceId || paymentTx.id}`,
              metadata: {
                provider,
                providerTxId: canonical.providerTxId || null,
                phase: "WITHDRAWAL_LEGACY_REFUND",
              },
            });
          }

          await tx.update(transactionsTable)
            .set({
              status: canonical.status === "FAILED" ? "FAILED" : "CANCELLED",
              updatedAt: now,
              metadata: nextMeta,
              adminNote: "Auto-released by provider webhook",
            })
            .where(eq(transactionsTable.id, paymentTx.id));

          await tx.insert(notificationsTable).values({
            userId: paymentTx.userId,
            type: "WITHDRAWAL_REFUNDED",
            title: "Retrait annulé",
            message: `Le retrait ${paymentTx.referenceId || paymentTx.id} a été annulé et remboursé automatiquement.`,
            category: "financial",
            actionUrl: "/wallet",
            read: false,
          });
        }
      }

      await tx.update(paymentEventsTable)
        .set({
          transactionId: paymentTx.id,
          status: "PROCESSED",
          processedAt: now,
          error: null,
        })
        .where(eq(paymentEventsTable.id, eventId));

      return { processed: true as const, transactionId: paymentTx.id };
    });

    return outcome;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "WEBHOOK_PROCESSING_ERROR";
    await db.update(paymentEventsTable)
      .set({
        status: "FAILED",
        error: errorMessage,
        processedAt: new Date(),
      })
      .where(eq(paymentEventsTable.id, eventId));
    throw error;
  }
}

async function recordIgnoredEvent(args: {
  provider: string;
  eventId: string;
  eventType: string;
  referenceId: string;
  payload: Record<string, unknown>;
  reason: string;
}) {
  await db.insert(paymentEventsTable).values({
    provider: args.provider,
    eventId: args.eventId,
    eventType: args.eventType,
    referenceId: args.referenceId,
    status: "IGNORED",
    payload: args.payload,
    error: args.reason,
    processedAt: new Date(),
  }).onConflictDoNothing({
    target: [paymentEventsTable.provider, paymentEventsTable.eventId],
  });
}

router.post("/payments/webhook/crypto", async (req, res) => {
  await ensurePaymentsInfra();
  await ensureLedgerInfra();

  const payload = (req.body || {}) as Record<string, unknown>;
  const hintedProvider = String(req.query.provider || "").trim().toUpperCase();
  if (hintedProvider === "OXAPAY" || payload.track_id || (payload.data && typeof payload.data === "object" && (payload.data as Record<string, unknown>).track_id)) {
    const token = String(req.query.token || "");
    if (!verifyOxaPayCallbackToken(token)) {
      res.status(401).json({ error: "Unauthorized", message: "Invalid OxaPay callback token" });
      return;
    }
    const canonicalOxa = canonicalizeOxaPayEvent(payload);
    if (!canonicalOxa) {
      res.status(400).json({ error: "Bad Request", message: "Invalid OxaPay payload" });
      return;
    }
    if (!canonicalOxa.status) {
      await recordIgnoredEvent({
        provider: "CRYPTO",
        eventId: canonicalOxa.eventId,
        eventType: canonicalOxa.eventType,
        referenceId: canonicalOxa.referenceId,
        payload,
        reason: `IGNORED_STATUS:${canonicalOxa.rawStatus}`,
      });
      res.json({ ok: true, ignored: true, status: canonicalOxa.rawStatus });
      return;
    }
    try {
      const outcome = await processWebhookEvent("CRYPTO", {
        eventId: canonicalOxa.eventId,
        eventType: canonicalOxa.eventType,
        referenceId: canonicalOxa.referenceId,
        status: canonicalOxa.status,
        providerTxId: canonicalOxa.providerTxId,
      }, payload);
      if ("alreadyProcessed" in outcome) {
        res.json({ ok: true, alreadyProcessed: true });
        return;
      }
      res.json({ ok: true, ...outcome });
      return;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "WEBHOOK_PROCESSING_ERROR";
      if (msg === "WALLET_NOT_FOUND") {
        res.status(422).json({ error: "Unprocessable Entity", message: "Wallet not found for transaction user" });
        return;
      }
      console.error("OxaPay webhook processing failed:", error);
      res.status(500).json({ error: "Internal Server Error", message: "Webhook processing failed" });
      return;
    }
  }

  const signature = String(req.get("x-nowpayments-sig") || "");
  const secret = getNowpaymentsIpnSecret();

  if (!secret) {
    res.status(503).json({ error: "Service Unavailable", message: "NOWPayments IPN secret is not configured" });
    return;
  }
  if (!signature || !verifyNowpaymentsSignature(payload, signature)) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid NOWPayments signature" });
    return;
  }

  const canonicalNow = canonicalizeNowpaymentsEvent(payload);
  if (!canonicalNow) {
    res.status(400).json({ error: "Bad Request", message: "Invalid NOWPayments payload" });
    return;
  }

  if (!canonicalNow.status) {
    await recordIgnoredEvent({
      provider: "CRYPTO",
      eventId: canonicalNow.eventId,
      eventType: canonicalNow.eventType,
      referenceId: canonicalNow.referenceId,
      payload,
      reason: `IGNORED_STATUS:${canonicalNow.rawStatus}`,
    });
    res.json({ ok: true, ignored: true, status: canonicalNow.rawStatus });
    return;
  }

  try {
    const outcome = await processWebhookEvent("CRYPTO", {
      eventId: canonicalNow.eventId,
      eventType: canonicalNow.eventType,
      referenceId: canonicalNow.referenceId,
      status: canonicalNow.status,
      providerTxId: canonicalNow.providerTxId,
      amountUsd: payload.price_amount as string | number | undefined,
      currency: payload.price_currency ? String(payload.price_currency) : undefined,
    }, payload);
    if ("alreadyProcessed" in outcome) {
      res.json({ ok: true, alreadyProcessed: true });
      return;
    }
    res.json({ ok: true, ...outcome });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "WEBHOOK_PROCESSING_ERROR";
    if (msg === "WALLET_NOT_FOUND") {
      res.status(422).json({ error: "Unprocessable Entity", message: "Wallet not found for transaction user" });
      return;
    }
    console.error("NOWPayments webhook processing failed:", error);
    res.status(500).json({ error: "Internal Server Error", message: "Webhook processing failed" });
  }
});

router.post("/payments/webhook/circle", async (req, res) => {
  await ensurePaymentsInfra();
  await ensureLedgerInfra();
  if (!isCirclePrimary()) {
    res.status(503).json({ error: "Service Unavailable", message: "Circle mode is disabled" });
    return;
  }

  const payload = (req.body || {}) as Record<string, unknown>;
  const notificationType = String(payload.notificationType || payload.type || "").toUpperCase();
  const notification = (payload.notification && typeof payload.notification === "object")
    ? payload.notification as Record<string, unknown>
    : payload;
  const eventId = String(payload.notificationId || payload.id || `${notificationType}:${notification.id || notification.transactionHash || Date.now()}`);
  const statusRaw = String(notification.state || notification.status || "").toUpperCase();

  const [inserted] = await db.insert(paymentEventsTable).values({
    provider: "CIRCLE",
    eventId,
    eventType: notificationType || "CIRCLE_WEBHOOK",
    referenceId: String(notification.id || notification.transactionHash || ""),
    status: "RECEIVED",
    payload,
  }).onConflictDoNothing({
    target: [paymentEventsTable.provider, paymentEventsTable.eventId],
  }).returning({ id: paymentEventsTable.id });
  if (!inserted) {
    res.json({ ok: true, alreadyProcessed: true });
    return;
  }

  try {
    if (notificationType.includes("INBOUND")) {
      const circleWalletId = String(notification.walletId || notification.destinationWalletId || "").trim();
      const txHash = String(notification.transactionHash || notification.txHash || "").trim();
      const amountRaw = String(notification.amount || (notification.amounts as unknown[] | undefined)?.[0] || "0");
      const amount = Number.parseFloat(amountRaw);
      const asset = String(notification.tokenSymbol || notification.asset || "USDC").toUpperCase();
      const network = String(notification.blockchain || notification.network || "").toUpperCase();
      const allowedAsset = getCircleAllowedAsset();
      const allowedNetwork = getCircleAllowedNetwork();
      if (!isCircleAllowedRail(asset, network)) {
        console.warn(`Rejected inbound Circle deposit ${asset}/${network}. Allowed ${allowedAsset}/${allowedNetwork}`);
        await db.update(paymentEventsTable)
          .set({ status: "IGNORED", error: `UNSUPPORTED_RAIL:${asset}:${network}`, processedAt: new Date() })
          .where(eq(paymentEventsTable.id, inserted.id));
        res.json({ ok: true, ignored: true, reason: "UNSUPPORTED_TOKEN_OR_NETWORK" });
        return;
      }
      if (circleWalletId && txHash && Number.isFinite(amount) && amount > 0 && statusRaw === "COMPLETE") {
        await db.transaction(async (tx) => {
          const wallets = await tx.select().from(userWalletsTable)
            .where(eq(userWalletsTable.circleWalletId, circleWalletId))
            .limit(1);
          if (!wallets.length) return;
          const userWallet = wallets[0];
          const [dep] = await tx.insert(depositsTable).values({
            userId: userWallet.userId,
            walletId: userWallet.id,
            txHash,
            asset,
            amount: String(amount),
            amountUsd: String(amount),
            network: network || userWallet.network,
            status: "CONFIRMED",
            confirmations: Number.parseInt(String(notification.confirmations || "1"), 10) || 1,
            circleTransferId: String(notification.id || ""),
            rawPayload: payload,
          }).onConflictDoNothing({
            target: [depositsTable.txHash],
          }).returning({ id: depositsTable.id });
          if (!dep) return;
          await creditAvailableFromTreasury(tx, {
            userId: userWallet.userId,
            amountUsd: amount,
            currency: "USD",
            idempotencyKey: `circle:deposit:settle:${dep.id}`,
            description: `Circle deposit ${txHash}`,
            metadata: { provider: "CIRCLE", txHash, asset, network },
          });
          await tx.insert(walletAuditLogsTable).values({
            userId: userWallet.userId,
            type: "DEPOSIT_CONFIRMED",
            referenceType: "DEPOSIT",
            referenceId: dep.id,
            details: `Circle inbound deposit confirmed (${asset} ${network})`,
            payload,
          });
          await tx.insert(notificationsTable).values({
            userId: userWallet.userId,
            type: "DEPOSIT_SETTLED",
            title: "Dépôt confirmé",
            message: `Votre dépôt ${asset} a été confirmé.`,
            category: "financial",
            actionUrl: "/wallet",
            read: false,
          });
        });
      }
    } else if (notificationType.includes("OUTBOUND")) {
      const transferId = String(notification.id || notification.transferId || "").trim();
      if (transferId) {
        const rows = await db.select().from(withdrawalsTable)
          .where(eq(withdrawalsTable.circleTransferId, transferId))
          .limit(1);
        if (rows.length) {
          const w = rows[0];
          if (statusRaw === "COMPLETE") {
            await db.update(withdrawalsTable)
              .set({ status: "COMPLETED", processedAt: new Date(), txHash: String(notification.transactionHash || ""), rawPayload: payload })
              .where(eq(withdrawalsTable.id, w.id));
            if (w.transactionId) {
              await db.update(transactionsTable)
                .set({ status: "COMPLETED", updatedAt: new Date() })
                .where(eq(transactionsTable.id, w.transactionId));
              await db.transaction(async (tx) => {
                await settleBlockedToTreasury(tx, {
                  userId: w.userId,
                  transactionId: w.transactionId!,
                  amountUsd: parseFloat(w.amountUsd),
                  currency: "USD",
                  idempotencyKey: `circle:withdraw:settle:${w.id}`,
                  description: `Circle withdraw settled ${w.id}`,
                  metadata: { provider: "CIRCLE", transferId },
                });
              });
            }
          } else if (statusRaw === "FAILED" || statusRaw === "CANCELLED" || statusRaw === "DENIED") {
            await db.update(withdrawalsTable)
              .set({ status: "FAILED", processedAt: new Date(), rawPayload: payload })
              .where(eq(withdrawalsTable.id, w.id));
            if (w.transactionId) {
              await db.update(transactionsTable)
                .set({ status: "FAILED", updatedAt: new Date(), adminNote: `Circle outbound ${statusRaw}` })
                .where(eq(transactionsTable.id, w.transactionId));
              await db.transaction(async (tx) => {
                await releaseBlockedToAvailable(tx, {
                  userId: w.userId,
                  transactionId: w.transactionId!,
                  amountUsd: parseFloat(w.amountUsd),
                  currency: "USD",
                  idempotencyKey: `circle:withdraw:release:${w.id}`,
                  description: `Circle withdraw failed ${w.id}`,
                  metadata: { provider: "CIRCLE", transferId, status: statusRaw },
                });
              });
            }
          }
        }
      }
    }

    await db.update(paymentEventsTable)
      .set({ status: "PROCESSED", processedAt: new Date() })
      .where(eq(paymentEventsTable.id, inserted.id));

    res.json({ ok: true });
  } catch (error) {
    await db.update(paymentEventsTable)
      .set({ status: "FAILED", error: error instanceof Error ? error.message : "CIRCLE_WEBHOOK_FAILED", processedAt: new Date() })
      .where(eq(paymentEventsTable.id, inserted.id));
    res.status(500).json({
      error: "Internal Server Error",
      message: "Circle webhook processing failed",
      detail: error instanceof Error ? error.message : "CIRCLE_WEBHOOK_FAILED",
    });
  }
});

router.post("/payments/webhook/:provider", async (req, res) => {
  await ensurePaymentsInfra();
  await ensureLedgerInfra();
  const provider = normalizeProvider(String(req.params.provider || ""));
  const timestamp = String(req.get("x-ecrossflow-timestamp") || "");
  const signature = String(req.get("x-ecrossflow-signature") || "");
  const secret = getProviderSecret(provider);

  if (!secret) {
    res.status(503).json({ error: "Service Unavailable", message: "Webhook secret is not configured" });
    return;
  }
  if (!timestamp || !withinTimeSkew(timestamp)) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid or expired webhook timestamp" });
    return;
  }
  if (!signature || !verifySignature(secret, timestamp, req.body, signature)) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid webhook signature" });
    return;
  }

  const payload = (req.body || {}) as Record<string, unknown>;
  const canonical = canonicalizePayload(provider, payload);
  if (!canonical) {
    res.status(400).json({ error: "Bad Request", message: "Invalid webhook payload" });
    return;
  }

  try {
    const outcome = await processWebhookEvent(provider, canonical, payload);
    if ("alreadyProcessed" in outcome) {
      res.json({ ok: true, alreadyProcessed: true });
      return;
    }
    res.json({ ok: true, ...outcome });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "WEBHOOK_PROCESSING_ERROR";
    if (msg === "WALLET_NOT_FOUND") {
      res.status(422).json({ error: "Unprocessable Entity", message: "Wallet not found for transaction user" });
      return;
    }
    console.error("Webhook processing failed:", error);
    res.status(500).json({ error: "Internal Server Error", message: "Webhook processing failed" });
  }
});

export default router;
