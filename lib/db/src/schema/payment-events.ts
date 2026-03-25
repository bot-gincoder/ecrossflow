import { pgTable, uuid, varchar, text, timestamp, jsonb, uniqueIndex, index, pgEnum } from "drizzle-orm/pg-core";
import { transactionsTable } from "./transactions";

export const paymentEventStatusEnum = pgEnum("payment_event_status", [
  "RECEIVED",
  "PROCESSED",
  "IGNORED",
  "FAILED",
]);

export const paymentEventsTable = pgTable("payment_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: varchar("provider", { length: 30 }).notNull(),
  eventId: varchar("event_id", { length: 120 }).notNull(),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  referenceId: varchar("reference_id", { length: 100 }),
  transactionId: uuid("transaction_id").references(() => transactionsTable.id),
  status: paymentEventStatusEnum("status").default("RECEIVED").notNull(),
  payload: jsonb("payload").notNull(),
  error: text("error"),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("uq_payment_events_provider_event_id").on(t.provider, t.eventId),
  index("idx_payment_events_reference").on(t.referenceId),
  index("idx_payment_events_transaction").on(t.transactionId),
  index("idx_payment_events_status_received").on(t.status, t.receivedAt),
]);
