import {
  db,
  ledgerAccountsTable,
  ledgerEntriesTable,
  walletsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";

export type TxClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

type LedgerAccountType = "TREASURY" | "USER_AVAILABLE" | "USER_BLOCKED";

const DEFAULT_CURRENCY = "USD";
let ledgerInfraReady = false;
let ledgerInfraPromise: Promise<void> | null = null;

function normalizeCurrency(raw?: string): string {
  const value = String(raw || DEFAULT_CURRENCY).trim().toUpperCase();
  return value || DEFAULT_CURRENCY;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toMoney(value: number): string {
  return round2(value).toFixed(2);
}

function parseMoney(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(parsed)) throw new Error("INVALID_AMOUNT");
  return round2(parsed);
}

export async function ensureLedgerInfra(): Promise<void> {
  if (ledgerInfraReady) return;
  if (ledgerInfraPromise) return ledgerInfraPromise;
  ledgerInfraPromise = (async () => {
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE ledger_account_type AS ENUM ('TREASURY','USER_AVAILABLE','USER_BLOCKED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE ledger_entry_status AS ENUM ('POSTED','REVERSED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ledger_accounts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code varchar(64) NOT NULL,
        name varchar(120) NOT NULL,
        type ledger_account_type NOT NULL,
        user_id uuid REFERENCES users(id),
        currency varchar(10) NOT NULL DEFAULT 'USD',
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ledger_entries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        entry_group_id uuid NOT NULL DEFAULT gen_random_uuid(),
        transaction_id uuid REFERENCES transactions(id),
        debit_account_id uuid NOT NULL REFERENCES ledger_accounts(id),
        credit_account_id uuid NOT NULL REFERENCES ledger_accounts(id),
        amount numeric(18,2) NOT NULL,
        currency varchar(10) NOT NULL DEFAULT 'USD',
        status ledger_entry_status NOT NULL DEFAULT 'POSTED',
        description text,
        metadata jsonb,
        idempotency_key varchar(150),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_ledger_entries_amount_positive CHECK (amount > 0),
        CONSTRAINT chk_ledger_entries_distinct_accounts CHECK (debit_account_id <> credit_account_id)
      );
    `);

    await db.execute(sql`ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS idempotency_key varchar(150);`);

    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_accounts_code ON ledger_accounts(code);`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_accounts_user_type_currency ON ledger_accounts(user_id, type, currency);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ledger_accounts_type ON ledger_accounts(type);`);

    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_entries_idempotency_key ON ledger_entries(idempotency_key) WHERE idempotency_key IS NOT NULL;`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction ON ledger_entries(transaction_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ledger_entries_entry_group ON ledger_entries(entry_group_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ledger_entries_created ON ledger_entries(created_at);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ledger_entries_debit ON ledger_entries(debit_account_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ledger_entries_credit ON ledger_entries(credit_account_id);`);

    await db.execute(sql`
      INSERT INTO ledger_accounts (code, name, type, user_id, currency, active)
      VALUES ('TREASURY_USD', 'Main Treasury USD', 'TREASURY', NULL, 'USD', true)
      ON CONFLICT (code) DO NOTHING;
    `);

    ledgerInfraReady = true;
  })();

  try {
    await ledgerInfraPromise;
  } finally {
    ledgerInfraPromise = null;
  }
}

async function lockOrCreateWallet(tx: TxClient, userId: string) {
  await tx.insert(walletsTable).values({
    userId,
    balanceUsd: "0",
    balancePending: "0",
    balanceReserved: "0",
  }).onConflictDoNothing({
    target: walletsTable.userId,
  });

  const rows = await tx.select().from(walletsTable)
    .where(eq(walletsTable.userId, userId))
    .for("update")
    .limit(1);
  if (!rows.length) throw new Error("WALLET_NOT_FOUND");
  return rows[0];
}

async function upsertAccount(tx: TxClient, args: {
  code: string;
  name: string;
  type: LedgerAccountType;
  userId: string | null;
  currency: string;
}) {
  await tx.insert(ledgerAccountsTable).values({
    code: args.code,
    name: args.name,
    type: args.type,
    userId: args.userId,
    currency: args.currency,
    active: true,
  }).onConflictDoNothing({
    target: ledgerAccountsTable.code,
  });

  const rows = await tx.select({ id: ledgerAccountsTable.id })
    .from(ledgerAccountsTable)
    .where(eq(ledgerAccountsTable.code, args.code))
    .limit(1);
  if (!rows.length) throw new Error("LEDGER_ACCOUNT_NOT_FOUND");
  return rows[0].id;
}

async function ensureAccounts(tx: TxClient, userId: string, currencyRaw?: string) {
  const currency = normalizeCurrency(currencyRaw);
  const treasuryCode = `TREASURY_${currency}`;
  const treasuryId = await upsertAccount(tx, {
    code: treasuryCode,
    name: `Main Treasury ${currency}`,
    type: "TREASURY",
    userId: null,
    currency,
  });

  const availableCode = `USER_AVAILABLE_${userId}_${currency}`;
  const blockedCode = `USER_BLOCKED_${userId}_${currency}`;

  const availableId = await upsertAccount(tx, {
    code: availableCode,
    name: `User Available ${currency}`,
    type: "USER_AVAILABLE",
    userId,
    currency,
  });

  const blockedId = await upsertAccount(tx, {
    code: blockedCode,
    name: `User Blocked ${currency}`,
    type: "USER_BLOCKED",
    userId,
    currency,
  });

  return {
    currency,
    treasuryId,
    availableId,
    blockedId,
  };
}

async function postTransfer(tx: TxClient, args: {
  transactionId?: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: number;
  currency: string;
  description: string;
  metadata?: Record<string, unknown>;
  idempotencyKey: string;
}) {
  const amount = parseMoney(args.amount);
  if (amount <= 0) throw new Error("INVALID_AMOUNT");

  const [inserted] = await tx.insert(ledgerEntriesTable).values({
    transactionId: args.transactionId || null,
    debitAccountId: args.debitAccountId,
    creditAccountId: args.creditAccountId,
    amount: toMoney(amount),
    currency: normalizeCurrency(args.currency),
    status: "POSTED",
    description: args.description,
    metadata: args.metadata || null,
    idempotencyKey: args.idempotencyKey,
  }).onConflictDoNothing({
    target: ledgerEntriesTable.idempotencyKey,
  }).returning({
    id: ledgerEntriesTable.id,
  });

  return inserted ? "POSTED" as const : "DUPLICATE" as const;
}

async function applyWalletDelta(tx: TxClient, userId: string, deltas: {
  availableDelta?: number;
  blockedDelta?: number;
}) {
  const wallet = await lockOrCreateWallet(tx, userId);

  const availableDelta = deltas.availableDelta || 0;
  const blockedDelta = deltas.blockedDelta || 0;

  const available = round2(parseMoney(wallet.balanceUsd) + availableDelta);
  const blocked = round2(parseMoney(wallet.balanceReserved) + blockedDelta);

  if (available < -0.0001) throw new Error("INSUFFICIENT_AVAILABLE_BALANCE");
  if (blocked < -0.0001) throw new Error("INSUFFICIENT_BLOCKED_BALANCE");

  await tx.update(walletsTable)
    .set({
      balanceUsd: toMoney(Math.max(0, available)),
      balanceReserved: toMoney(Math.max(0, blocked)),
      updatedAt: new Date(),
    })
    .where(eq(walletsTable.userId, userId));
}

export async function ensureWalletAndLedgerAccounts(tx: TxClient, userId: string, currency = DEFAULT_CURRENCY) {
  await ensureLedgerInfra();
  await lockOrCreateWallet(tx, userId);
  await ensureAccounts(tx, userId, currency);
}

export async function creditAvailableFromTreasury(tx: TxClient, args: {
  userId: string;
  amountUsd: number;
  transactionId?: string;
  currency?: string;
  idempotencyKey: string;
  description: string;
  metadata?: Record<string, unknown>;
}) {
  await ensureLedgerInfra();
  const accounts = await ensureAccounts(tx, args.userId, args.currency);
  const result = await postTransfer(tx, {
    transactionId: args.transactionId,
    debitAccountId: accounts.treasuryId,
    creditAccountId: accounts.availableId,
    amount: args.amountUsd,
    currency: accounts.currency,
    description: args.description,
    metadata: args.metadata,
    idempotencyKey: args.idempotencyKey,
  });

  if (result === "POSTED") {
    await applyWalletDelta(tx, args.userId, { availableDelta: args.amountUsd });
  }

  return result;
}

export async function moveAvailableToBlocked(tx: TxClient, args: {
  userId: string;
  amountUsd: number;
  transactionId?: string;
  currency?: string;
  idempotencyKey: string;
  description: string;
  metadata?: Record<string, unknown>;
}) {
  await ensureLedgerInfra();
  const accounts = await ensureAccounts(tx, args.userId, args.currency);
  const result = await postTransfer(tx, {
    transactionId: args.transactionId,
    debitAccountId: accounts.availableId,
    creditAccountId: accounts.blockedId,
    amount: args.amountUsd,
    currency: accounts.currency,
    description: args.description,
    metadata: args.metadata,
    idempotencyKey: args.idempotencyKey,
  });

  if (result === "POSTED") {
    await applyWalletDelta(tx, args.userId, {
      availableDelta: -args.amountUsd,
      blockedDelta: args.amountUsd,
    });
  }

  return result;
}

export async function settleBlockedToTreasury(tx: TxClient, args: {
  userId: string;
  amountUsd: number;
  transactionId?: string;
  currency?: string;
  idempotencyKey: string;
  description: string;
  metadata?: Record<string, unknown>;
}) {
  await ensureLedgerInfra();
  const accounts = await ensureAccounts(tx, args.userId, args.currency);
  const result = await postTransfer(tx, {
    transactionId: args.transactionId,
    debitAccountId: accounts.blockedId,
    creditAccountId: accounts.treasuryId,
    amount: args.amountUsd,
    currency: accounts.currency,
    description: args.description,
    metadata: args.metadata,
    idempotencyKey: args.idempotencyKey,
  });

  if (result === "POSTED") {
    await applyWalletDelta(tx, args.userId, { blockedDelta: -args.amountUsd });
  }

  return result;
}

export async function releaseBlockedToAvailable(tx: TxClient, args: {
  userId: string;
  amountUsd: number;
  transactionId?: string;
  currency?: string;
  idempotencyKey: string;
  description: string;
  metadata?: Record<string, unknown>;
}) {
  await ensureLedgerInfra();
  const accounts = await ensureAccounts(tx, args.userId, args.currency);
  const result = await postTransfer(tx, {
    transactionId: args.transactionId,
    debitAccountId: accounts.blockedId,
    creditAccountId: accounts.availableId,
    amount: args.amountUsd,
    currency: accounts.currency,
    description: args.description,
    metadata: args.metadata,
    idempotencyKey: args.idempotencyKey,
  });

  if (result === "POSTED") {
    await applyWalletDelta(tx, args.userId, {
      blockedDelta: -args.amountUsd,
      availableDelta: args.amountUsd,
    });
  }

  return result;
}

export async function adjustAvailableWithTreasury(tx: TxClient, args: {
  userId: string;
  deltaUsd: number;
  transactionId?: string;
  currency?: string;
  idempotencyKey: string;
  description: string;
  metadata?: Record<string, unknown>;
}) {
  const delta = parseMoney(args.deltaUsd);
  if (delta === 0) throw new Error("INVALID_AMOUNT");

  if (delta > 0) {
    return creditAvailableFromTreasury(tx, {
      userId: args.userId,
      amountUsd: delta,
      transactionId: args.transactionId,
      currency: args.currency,
      idempotencyKey: args.idempotencyKey,
      description: args.description,
      metadata: args.metadata,
    });
  }

  await ensureLedgerInfra();
  const amountUsd = Math.abs(delta);
  const accounts = await ensureAccounts(tx, args.userId, args.currency);
  const result = await postTransfer(tx, {
    transactionId: args.transactionId,
    debitAccountId: accounts.availableId,
    creditAccountId: accounts.treasuryId,
    amount: amountUsd,
    currency: accounts.currency,
    description: args.description,
    metadata: args.metadata,
    idempotencyKey: args.idempotencyKey,
  });

  if (result === "POSTED") {
    await applyWalletDelta(tx, args.userId, { availableDelta: -amountUsd });
  }

  return result;
}
