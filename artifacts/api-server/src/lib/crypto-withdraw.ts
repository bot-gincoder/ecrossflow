import { and, eq } from "drizzle-orm";
import { db, notificationsTable, transactionsTable } from "@workspace/db";
import {
  createCustodialCryptoPayout,
  resolveCryptoAsset,
  type CryptoAssetKey,
} from "../services/crypto-provider.js";

function parseDestination(metadata: unknown, description: string | null): string {
  if (metadata && typeof metadata === "object" && "destination" in metadata) {
    const v = (metadata as Record<string, unknown>).destination;
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  if (description) {
    const m = /^Withdrawal to (.+)$/i.exec(description.trim());
    if (m?.[1]) return m[1].trim();
  }
  return "";
}

function toMetadataObject(metadata: unknown): Record<string, unknown> {
  if (metadata && typeof metadata === "object") return metadata as Record<string, unknown>;
  return {};
}

export type DispatchCryptoWithdrawalArgs = {
  transactionId: string;
  actorId: string | null;
  source: "AUTO" | "ADMIN_APPROVAL";
};

export type DispatchCryptoWithdrawalResult = {
  mode: "crypto-auto" | "crypto-semi-auto";
  status: "PROCESSING";
  payoutId: string;
  withdrawalId: string;
  asset: CryptoAssetKey;
};

export async function dispatchCryptoWithdrawal(
  args: DispatchCryptoWithdrawalArgs,
): Promise<DispatchCryptoWithdrawalResult> {
  return db.transaction(async (txDb) => {
    const txRows = await txDb.select().from(transactionsTable)
      .where(and(
        eq(transactionsTable.id, args.transactionId),
        eq(transactionsTable.type, "WITHDRAWAL"),
      ))
      .for("update")
      .limit(1);

    if (!txRows.length) throw new Error("NOT_FOUND");
    const row = txRows[0];

    if ((row.paymentMethod || "").toUpperCase() !== "CRYPTO") throw new Error("BAD_METHOD");
    if (row.status !== "PENDING" && row.status !== "PROCESSING") throw new Error(`BAD_STATUS:${row.status}`);

    const baseMeta = toMetadataObject(row.metadata);
    const nowpaymentsMeta = toMetadataObject(baseMeta.nowpayments);
    const existingWithdrawalId = String(nowpaymentsMeta.withdrawalId || "").trim();
    const existingPayoutId = String(nowpaymentsMeta.payoutId || "").trim();
    if (row.status === "PROCESSING" && existingWithdrawalId && existingPayoutId) {
      return {
        mode: args.source === "AUTO" ? "crypto-auto" : "crypto-semi-auto",
        status: "PROCESSING",
        payoutId: existingPayoutId,
        withdrawalId: existingWithdrawalId,
        asset: resolveCryptoAsset(baseMeta.cryptoAsset, row.currency) || "USDT_TRC20",
      };
    }

    const destination = parseDestination(row.metadata, row.description);
    if (!destination) throw new Error("MISSING_DESTINATION");

    const asset = resolveCryptoAsset(baseMeta.cryptoAsset, row.currency);
    if (!asset) throw new Error("INVALID_CRYPTO_ASSET");

    const amountCrypto = Number.parseFloat(row.amount);
    if (!Number.isFinite(amountCrypto) || amountCrypto <= 0) throw new Error("INVALID_WITHDRAW_AMOUNT");

    const payout = await createCustodialCryptoPayout({
      referenceId: row.referenceId || row.id,
      asset,
      destination,
      amount: amountCrypto,
      description: `Withdrawal ${row.referenceId || row.id}`,
    });

    const nextMeta: Record<string, unknown> = {
      ...baseMeta,
      provider: "NOWPAYMENTS",
      cryptoAsset: asset,
      nowpayments: {
        ...nowpaymentsMeta,
        payoutId: payout.payoutId,
        withdrawalId: payout.withdrawalId,
        payoutStatus: payout.status,
        payoutRequestedAt: new Date().toISOString(),
        payoutRaw: payout.raw,
      },
    };

    await txDb.update(transactionsTable)
      .set({
        status: "PROCESSING",
        metadata: nextMeta,
        updatedAt: new Date(),
        adminNote: args.source === "ADMIN_APPROVAL"
          ? "Withdrawal approved and sent to crypto provider"
          : row.adminNote,
      })
      .where(eq(transactionsTable.id, row.id));

    await txDb.insert(notificationsTable).values({
      userId: row.userId,
      type: "WITHDRAWAL_APPROVED",
      title: "Retrait en traitement",
      message: `Votre retrait ${row.referenceId || row.id} a été transmis au provider crypto et est en cours de traitement.`,
      category: "financial",
      actionUrl: "/wallet",
      read: false,
    });

    return {
      mode: args.source === "AUTO" ? "crypto-auto" : "crypto-semi-auto",
      status: "PROCESSING",
      payoutId: payout.payoutId,
      withdrawalId: payout.withdrawalId,
      asset,
    };
  });
}
