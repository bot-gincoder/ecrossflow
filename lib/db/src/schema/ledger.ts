import {
  pgEnum,
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  numeric,
  jsonb,
  index,
  uniqueIndex,
  check,
  text,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { transactionsTable } from "./transactions";

export const ledgerAccountTypeEnum = pgEnum("ledger_account_type", [
  "TREASURY",
  "USER_AVAILABLE",
  "USER_BLOCKED",
]);

export const ledgerEntryStatusEnum = pgEnum("ledger_entry_status", [
  "POSTED",
  "REVERSED",
]);

export const ledgerAccountsTable = pgTable("ledger_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 64 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  type: ledgerAccountTypeEnum("type").notNull(),
  userId: uuid("user_id").references(() => usersTable.id),
  currency: varchar("currency", { length: 10 }).default("USD").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("uq_ledger_accounts_code").on(t.code),
  uniqueIndex("uq_ledger_accounts_user_type_currency").on(t.userId, t.type, t.currency),
  index("idx_ledger_accounts_type").on(t.type),
]);

export const ledgerEntriesTable = pgTable("ledger_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  entryGroupId: uuid("entry_group_id").defaultRandom().notNull(),
  transactionId: uuid("transaction_id").references(() => transactionsTable.id),
  debitAccountId: uuid("debit_account_id").notNull().references(() => ledgerAccountsTable.id),
  creditAccountId: uuid("credit_account_id").notNull().references(() => ledgerAccountsTable.id),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("USD").notNull(),
  status: ledgerEntryStatusEnum("status").default("POSTED").notNull(),
  description: text("description"),
  metadata: jsonb("metadata"),
  idempotencyKey: varchar("idempotency_key", { length: 150 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  check("chk_ledger_entries_amount_positive", sql`${t.amount} > 0`),
  check("chk_ledger_entries_distinct_accounts", sql`${t.debitAccountId} <> ${t.creditAccountId}`),
  uniqueIndex("uq_ledger_entries_idempotency_key").on(t.idempotencyKey),
  index("idx_ledger_entries_transaction").on(t.transactionId),
  index("idx_ledger_entries_entry_group").on(t.entryGroupId),
  index("idx_ledger_entries_created").on(t.createdAt),
  index("idx_ledger_entries_debit").on(t.debitAccountId),
  index("idx_ledger_entries_credit").on(t.creditAccountId),
]);
