import { pgTable, varchar, integer, numeric, text, uuid, timestamp, pgEnum, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const boardInstanceStatusEnum = pgEnum("board_instance_status", ["WAITING", "ACTIVE", "COMPLETED"]);
export const boardParticipantRoleEnum = pgEnum("board_participant_role", ["STARTER", "CHALLENGER", "LEADER", "RANKER"]);

export const boardsTable = pgTable("boards", {
  id: varchar("id", { length: 5 }).primaryKey(),
  rankOrder: integer("rank_order").notNull(),
  entryFee: numeric("entry_fee", { precision: 10, scale: 2 }).notNull(),
  multiplier: integer("multiplier").default(8).notNull(),
  totalGain: numeric("total_gain", { precision: 10, scale: 2 }).notNull(),
  nextBoardDeduction: numeric("next_board_deduction", { precision: 10, scale: 2 }).notNull(),
  withdrawable: numeric("withdrawable", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  colorTheme: varchar("color_theme", { length: 50 }),
}, (t) => [
  check("chk_boards_rank_order_positive", sql`${t.rankOrder} > 0`),
  check("chk_boards_entry_fee_positive", sql`${t.entryFee} > 0`),
  check("chk_boards_total_gain_non_negative", sql`${t.totalGain} >= 0`),
  check("chk_boards_next_deduction_non_negative", sql`${t.nextBoardDeduction} >= 0`),
  check("chk_boards_withdrawable_non_negative", sql`${t.withdrawable} >= 0`),
  check("chk_boards_distribution_le_total_gain", sql`${t.nextBoardDeduction} + ${t.withdrawable} <= ${t.totalGain}`),
  uniqueIndex("uq_boards_rank_order").on(t.rankOrder),
]);

export const boardInstancesTable = pgTable("board_instances", {
  id: uuid("id").primaryKey().defaultRandom(),
  boardId: varchar("board_id", { length: 5 }).notNull().references(() => boardsTable.id),
  instanceNumber: integer("instance_number").notNull(),
  rankerId: uuid("ranker_id").references(() => usersTable.id),
  status: boardInstanceStatusEnum("status").default("WAITING").notNull(),
  slotsFilled: integer("slots_filled").default(0).notNull(),
  totalCollected: numeric("total_collected", { precision: 10, scale: 2 }).default("0").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("uq_board_instance_sequence").on(t.boardId, t.instanceNumber),
  check("chk_board_instance_number_positive", sql`${t.instanceNumber} > 0`),
  check("chk_board_instance_slots_range", sql`${t.slotsFilled} >= 0 AND ${t.slotsFilled} <= 7`),
  check("chk_board_instance_total_collected_non_negative", sql`${t.totalCollected} >= 0`),
  index("idx_board_instances_board_status").on(t.boardId, t.status),
  index("idx_board_instances_ranker").on(t.rankerId),
]);

export const boardParticipantsTable = pgTable("board_participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  boardInstanceId: uuid("board_instance_id").notNull().references(() => boardInstancesTable.id),
  userId: uuid("user_id").notNull().references(() => usersTable.id),
  role: boardParticipantRoleEnum("role").notNull(),
  position: integer("position"),
  amountPaid: numeric("amount_paid", { precision: 10, scale: 2 }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("uq_board_participant_user_instance").on(t.boardInstanceId, t.userId),
  uniqueIndex("uq_board_participant_position").on(t.boardInstanceId, t.role, t.position),
]);

export const insertBoardSchema = createInsertSchema(boardsTable);
export const insertBoardInstanceSchema = createInsertSchema(boardInstancesTable).omit({ id: true, createdAt: true });
export const insertBoardParticipantSchema = createInsertSchema(boardParticipantsTable).omit({ id: true, createdAt: true });

export type InsertBoard = z.infer<typeof insertBoardSchema>;
export type Board = typeof boardsTable.$inferSelect;
export type InsertBoardInstance = z.infer<typeof insertBoardInstanceSchema>;
export type BoardInstance = typeof boardInstancesTable.$inferSelect;
export type InsertBoardParticipant = z.infer<typeof insertBoardParticipantSchema>;
export type BoardParticipant = typeof boardParticipantsTable.$inferSelect;
