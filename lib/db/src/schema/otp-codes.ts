import { pgTable, uuid, varchar, integer, numeric, timestamp, pgEnum, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

export const otpPurposeEnum = pgEnum("otp_purpose", ["EMAIL_VERIFICATION", "WITHDRAWAL"]);

export const otpCodesTable = pgTable("otp_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id),
  purpose: otpPurposeEnum("purpose").notNull(),
  codeHash: varchar("code_hash", { length: 128 }).notNull(),
  amountUsd: numeric("amount_usd", { precision: 18, scale: 2 }),
  attempts: integer("attempts").default(0).notNull(),
  maxAttempts: integer("max_attempts").default(5).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  check("chk_otp_attempts_non_negative", sql`${t.attempts} >= 0`),
  check("chk_otp_max_attempts_positive", sql`${t.maxAttempts} > 0`),
  check("chk_otp_attempts_le_max", sql`${t.attempts} <= ${t.maxAttempts}`),
  check("chk_otp_amount_usd_non_negative", sql`${t.amountUsd} IS NULL OR ${t.amountUsd} >= 0`),
  index("idx_otp_user_purpose_created").on(t.userId, t.purpose, t.createdAt),
  index("idx_otp_expires_at").on(t.expiresAt),
  index("idx_otp_consumed_at").on(t.consumedAt),
]);
