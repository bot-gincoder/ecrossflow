import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const i18nTranslationStatusEnum = pgEnum("i18n_translation_status", [
  "AUTO",
  "MANUAL",
  "REVIEW",
]);

export const i18nLanguagesTable = pgTable("i18n_languages", {
  code: varchar("code", { length: 10 }).primaryKey(),
  label: varchar("label", { length: 80 }).notNull(),
  nativeLabel: varchar("native_label", { length: 120 }).notNull(),
  isRtl: boolean("is_rtl").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const i18nKeysTable = pgTable("i18n_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  namespace: varchar("namespace", { length: 60 }).notNull(),
  key: varchar("key", { length: 255 }).notNull(),
  sourceText: text("source_text").notNull(),
  context: text("context"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("uq_i18n_keys_namespace_key").on(t.namespace, t.key),
  index("idx_i18n_keys_namespace").on(t.namespace),
]);

export const i18nKeyTranslationsTable = pgTable("i18n_key_translations", {
  id: uuid("id").primaryKey().defaultRandom(),
  i18nKeyId: uuid("i18n_key_id").notNull().references(() => i18nKeysTable.id, { onDelete: "cascade" }),
  locale: varchar("locale", { length: 10 }).notNull(),
  translatedText: text("translated_text").notNull(),
  status: i18nTranslationStatusEnum("status").default("AUTO").notNull(),
  provider: varchar("provider", { length: 40 }).default("google").notNull(),
  createdBy: uuid("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("uq_i18n_key_translations_key_locale").on(t.i18nKeyId, t.locale),
  index("idx_i18n_key_translations_locale").on(t.locale),
]);

export const i18nRuntimeCacheTable = pgTable("i18n_runtime_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceHash: varchar("source_hash", { length: 64 }).notNull(),
  sourceText: text("source_text").notNull(),
  locale: varchar("locale", { length: 10 }).notNull(),
  translatedText: text("translated_text").notNull(),
  status: i18nTranslationStatusEnum("status").default("AUTO").notNull(),
  provider: varchar("provider", { length: 40 }).default("google").notNull(),
  createdBy: uuid("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("uq_i18n_runtime_hash_locale").on(t.sourceHash, t.locale),
  index("idx_i18n_runtime_locale").on(t.locale),
]);

export const i18nAuditLogsTable = pgTable("i18n_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  action: varchar("action", { length: 80 }).notNull(),
  targetType: varchar("target_type", { length: 60 }).notNull(),
  targetId: varchar("target_id", { length: 120 }),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_i18n_audit_actor_created").on(t.actorUserId, t.createdAt),
  index("idx_i18n_audit_action").on(t.action),
]);

