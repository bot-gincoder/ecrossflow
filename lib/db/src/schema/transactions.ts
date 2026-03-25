import { pgTable, uuid, varchar, numeric, text, timestamp, pgEnum, jsonb, index, check, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const transactionTypeEnum = pgEnum("transaction_type", [
  "DEPOSIT",
  "WITHDRAWAL",
  "BOARD_PAYMENT",
  "BOARD_RECEIPT",
  "REFERRAL_BONUS",
  "CONVERSION",
  "ACTIVATION_FEE",
  "BOARD_PROMOTION",
  "SYSTEM_FEE",
]);

export const transactionStatusEnum = pgEnum("transaction_status", [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "MONCASH",
  "NATCASH",
  "CARD",
  "BANK_TRANSFER",
  "CRYPTO",
  "PAYPAL",
  "SYSTEM",
]);

export const transactionsTable = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id),
  type: transactionTypeEnum("type").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).notNull(),
  amountUsd: numeric("amount_usd", { precision: 18, scale: 2 }).notNull(),
  status: transactionStatusEnum("status").default("PENDING").notNull(),
  paymentMethod: paymentMethodEnum("payment_method"),
  referenceId: varchar("reference_id", { length: 100 }),
  fromBoard: varchar("from_board", { length: 5 }),
  toUserId: uuid("to_user_id").references(() => usersTable.id),
  description: text("description"),
  screenshotUrl: text("screenshot_url"),
  metadata: jsonb("metadata"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  check("chk_transactions_amount_positive", sql`${t.amount} > 0`),
  check("chk_transactions_amount_usd_positive", sql`${t.amountUsd} > 0`),
  check("chk_transactions_currency_not_blank", sql`char_length(${t.currency}) > 0`),
  index("idx_transactions_user_created").on(t.userId, t.createdAt),
  index("idx_transactions_user_status").on(t.userId, t.status),
  index("idx_transactions_type_status").on(t.type, t.status),
  index("idx_transactions_reference").on(t.referenceId),
  uniqueIndex("uq_transactions_reference_id").on(t.referenceId),
]);

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
