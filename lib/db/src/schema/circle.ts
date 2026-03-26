import { pgTable, uuid, varchar, text, numeric, integer, timestamp, jsonb, pgEnum, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { transactionsTable } from "./transactions";

export const userWalletStatusEnum = pgEnum("user_wallet_status", ["ACTIVE", "PENDING", "DISABLED", "ERROR"]);
export const depositStatusEnum = pgEnum("deposit_status", ["PENDING", "CONFIRMED", "FAILED", "CANCELLED"]);
export const withdrawalStatusEnum = pgEnum("withdrawal_status", ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"]);
export const walletAuditTypeEnum = pgEnum("wallet_audit_type", [
  "WALLET_CREATED",
  "DEPOSIT_DETECTED",
  "DEPOSIT_CONFIRMED",
  "WITHDRAW_REQUESTED",
  "WITHDRAW_BROADCASTED",
  "WITHDRAW_SETTLED",
  "WITHDRAW_FAILED",
  "BALANCE_SYNC",
  "WEBHOOK_RECEIVED",
]);

export const userWalletsTable = pgTable("user_wallets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id),
  circleWalletId: varchar("circle_wallet_id", { length: 128 }).notNull(),
  blockchainAddress: varchar("blockchain_address", { length: 256 }).notNull(),
  network: varchar("network", { length: 64 }).notNull(),
  status: userWalletStatusEnum("status").default("ACTIVE").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("uq_user_wallets_user_network").on(t.userId, t.network),
  uniqueIndex("uq_user_wallets_circle_wallet").on(t.circleWalletId),
  index("idx_user_wallets_user").on(t.userId),
  index("idx_user_wallets_network").on(t.network),
]);

export const internalWalletBalancesTable = pgTable("internal_wallet_balances", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id),
  availableBalance: numeric("available_balance", { precision: 18, scale: 2 }).default("0").notNull(),
  pendingBalance: numeric("pending_balance", { precision: 18, scale: 2 }).default("0").notNull(),
  lockedBalance: numeric("locked_balance", { precision: 18, scale: 2 }).default("0").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("uq_internal_wallet_balances_user").on(t.userId),
  check("chk_internal_available_non_negative", sql`${t.availableBalance} >= 0`),
  check("chk_internal_pending_non_negative", sql`${t.pendingBalance} >= 0`),
  check("chk_internal_locked_non_negative", sql`${t.lockedBalance} >= 0`),
]);

export const depositsTable = pgTable("deposits", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id),
  walletId: uuid("wallet_id").notNull().references(() => userWalletsTable.id),
  txHash: varchar("tx_hash", { length: 256 }).notNull(),
  asset: varchar("asset", { length: 32 }).notNull(),
  amount: numeric("amount", { precision: 18, scale: 8 }).notNull(),
  amountUsd: numeric("amount_usd", { precision: 18, scale: 2 }).notNull(),
  network: varchar("network", { length: 64 }).notNull(),
  status: depositStatusEnum("status").default("PENDING").notNull(),
  confirmations: integer("confirmations").default(0).notNull(),
  circleTransferId: varchar("circle_transfer_id", { length: 128 }),
  rawPayload: jsonb("raw_payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("uq_deposits_tx_hash").on(t.txHash),
  index("idx_deposits_user_created").on(t.userId, t.createdAt),
  index("idx_deposits_status").on(t.status),
  check("chk_deposits_amount_positive", sql`${t.amount} > 0`),
  check("chk_deposits_amount_usd_positive", sql`${t.amountUsd} > 0`),
]);

export const withdrawalsTable = pgTable("withdrawals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id),
  transactionId: uuid("transaction_id").references(() => transactionsTable.id),
  destinationAddress: varchar("destination_address", { length: 256 }).notNull(),
  asset: varchar("asset", { length: 32 }).notNull(),
  amount: numeric("amount", { precision: 18, scale: 8 }).notNull(),
  amountUsd: numeric("amount_usd", { precision: 18, scale: 2 }).notNull(),
  fee: numeric("fee", { precision: 18, scale: 8 }).default("0").notNull(),
  network: varchar("network", { length: 64 }).notNull(),
  status: withdrawalStatusEnum("status").default("PENDING").notNull(),
  circleTransferId: varchar("circle_transfer_id", { length: 128 }),
  txHash: varchar("tx_hash", { length: 256 }),
  requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  rawPayload: jsonb("raw_payload"),
}, (t) => [
  index("idx_withdrawals_user_requested").on(t.userId, t.requestedAt),
  index("idx_withdrawals_transaction").on(t.transactionId),
  index("idx_withdrawals_status").on(t.status),
  uniqueIndex("uq_withdrawals_circle_transfer").on(t.circleTransferId),
  check("chk_withdrawals_amount_positive", sql`${t.amount} > 0`),
  check("chk_withdrawals_amount_usd_positive", sql`${t.amountUsd} > 0`),
]);

export const walletAuditLogsTable = pgTable("wallet_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => usersTable.id),
  type: walletAuditTypeEnum("type").notNull(),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: varchar("reference_id", { length: 128 }),
  details: text("details"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_wallet_audit_user_created").on(t.userId, t.createdAt),
  index("idx_wallet_audit_type").on(t.type),
]);
