import { Router, type IRouter } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { and, eq } from "drizzle-orm";
import {
  db,
  paymentEventsTable,
  transactionsTable,
  walletsTable,
  notificationsTable,
} from "@workspace/db";

const router: IRouter = Router();

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
          const wallets = await tx.select().from(walletsTable)
            .where(eq(walletsTable.userId, paymentTx.userId))
            .for("update")
            .limit(1);
          if (!wallets.length) throw new Error("WALLET_NOT_FOUND");

          const current = parseFloat(wallets[0].balanceUsd);
          const amount = parseFloat(paymentTx.amountUsd);
          await tx.update(walletsTable)
            .set({ balanceUsd: (current + amount).toFixed(2), updatedAt: now })
            .where(eq(walletsTable.userId, paymentTx.userId));

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
        if (canonical.status === "COMPLETED" && paymentTx.status === "PROCESSING") {
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
        } else if ((canonical.status === "FAILED" || canonical.status === "CANCELLED") && paymentTx.status === "PROCESSING") {
          const wallets = await tx.select().from(walletsTable)
            .where(eq(walletsTable.userId, paymentTx.userId))
            .for("update")
            .limit(1);
          if (!wallets.length) throw new Error("WALLET_NOT_FOUND");

          const current = parseFloat(wallets[0].balanceUsd);
          const amount = parseFloat(paymentTx.amountUsd);
          await tx.update(walletsTable)
            .set({ balanceUsd: (current + amount).toFixed(2), updatedAt: now })
            .where(eq(walletsTable.userId, paymentTx.userId));

          await tx.update(transactionsTable)
            .set({ status: "CANCELLED", updatedAt: now, metadata: nextMeta, adminNote: "Auto-refunded by provider webhook" })
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

router.post("/payments/webhook/:provider", async (req, res) => {
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
