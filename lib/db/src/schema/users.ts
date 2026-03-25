import { pgTable, uuid, integer, varchar, text, timestamp, pgEnum, foreignKey, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userStatusEnum = pgEnum("user_status", ["PENDING", "ACTIVE", "SUSPENDED"]);
export const userRoleEnum = pgEnum("user_role", ["USER", "ADMIN"]);
export const kycStatusEnum = pgEnum("kyc_status", ["NONE", "PENDING", "APPROVED", "REJECTED"]);

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountNumber: integer("account_number").unique(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  username: varchar("username", { length: 50 }).unique().notNull(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  googleId: varchar("google_id", { length: 120 }).unique(),
  phone: varchar("phone", { length: 20 }),
  avatarUrl: text("avatar_url"),
  referralCode: varchar("referral_code", { length: 20 }).unique().notNull(),
  referredBy: uuid("referred_by"),
  status: userStatusEnum("status").default("PENDING").notNull(),
  role: userRoleEnum("role").default("USER").notNull(),
  kycStatus: kycStatusEnum("kyc_status").default("NONE").notNull(),
  preferredLanguage: varchar("preferred_language", { length: 5 }).default("fr").notNull(),
  preferredCurrency: varchar("preferred_currency", { length: 10 }).default("USD").notNull(),
  preferredTheme: varchar("preferred_theme", { length: 20 }).default("light").notNull(),
  currentBoard: varchar("current_board", { length: 5 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  foreignKey({
    columns: [t.referredBy],
    foreignColumns: [t.id],
    name: "users_referred_by_fkey",
  }).onDelete("set null"),
  index("idx_users_referred_by").on(t.referredBy),
  index("idx_users_status").on(t.status),
  index("idx_users_role").on(t.role),
]);

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  accountNumber: true,
  referralCode: true,
  status: true,
  role: true,
  kycStatus: true,
  createdAt: true,
  activatedAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
