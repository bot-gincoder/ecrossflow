import { pgTable, uuid, boolean, timestamp, numeric, text, pgEnum, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const bonusTypeEnum = pgEnum("bonus_type", ["REFERRAL_3", "BOARD_COMPLETION", "MILESTONE"]);
export const bonusStatusEnum = pgEnum("bonus_status", ["PENDING", "PAID"]);

export const referralsTable = pgTable("referrals", {
  id: uuid("id").primaryKey().defaultRandom(),
  referrerId: uuid("referrer_id").notNull().references(() => usersTable.id),
  referredId: uuid("referred_id").notNull().references(() => usersTable.id),
  bonusPaid: boolean("bonus_paid").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("uq_referrals_referred_once").on(t.referredId),
  uniqueIndex("uq_referrals_referrer_referred").on(t.referrerId, t.referredId),
  check("chk_referrals_not_self", sql`${t.referrerId} <> ${t.referredId}`),
  index("idx_referrals_referrer_created").on(t.referrerId, t.createdAt),
]);

export const bonusesTable = pgTable("bonuses", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id),
  type: bonusTypeEnum("type").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  status: bonusStatusEnum("status").default("PENDING").notNull(),
  triggerEvent: text("trigger_event"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  check("chk_bonuses_amount_non_negative", sql`${t.amount} >= 0`),
  index("idx_bonuses_user_created").on(t.userId, t.createdAt),
  index("idx_bonuses_status").on(t.status),
]);

export const insertReferralSchema = createInsertSchema(referralsTable).omit({ id: true, createdAt: true });
export const insertBonusSchema = createInsertSchema(bonusesTable).omit({ id: true, createdAt: true });
export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referralsTable.$inferSelect;
export type InsertBonus = z.infer<typeof insertBonusSchema>;
export type Bonus = typeof bonusesTable.$inferSelect;
