import { pgTable, uuid, numeric, timestamp, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const walletsTable = pgTable("wallets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").unique().notNull().references(() => usersTable.id),
  balanceUsd: numeric("balance_usd", { precision: 18, scale: 2 }).default("0").notNull(),
  balancePending: numeric("balance_pending", { precision: 18, scale: 2 }).default("0").notNull(),
  balanceReserved: numeric("balance_reserved", { precision: 18, scale: 2 }).default("0").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  check("chk_wallet_balance_usd_non_negative", sql`${t.balanceUsd} >= 0`),
  check("chk_wallet_balance_pending_non_negative", sql`${t.balancePending} >= 0`),
  check("chk_wallet_balance_reserved_non_negative", sql`${t.balanceReserved} >= 0`),
  index("idx_wallets_updated_at").on(t.updatedAt),
]);

export const insertWalletSchema = createInsertSchema(walletsTable).omit({ id: true, updatedAt: true });
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type Wallet = typeof walletsTable.$inferSelect;
