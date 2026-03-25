import { db } from "@workspace/db";
import { boardsTable, usersTable, walletsTable, boardInstancesTable } from "@workspace/db";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";

const BOARDS = [
  { id: "F", rankOrder: 1, entryFee: "2.00", multiplier: 8, totalGain: "16.00", nextBoardDeduction: "8.00", withdrawable: "6.00", colorTheme: "gray" },
  { id: "E", rankOrder: 2, entryFee: "8.00", multiplier: 8, totalGain: "64.00", nextBoardDeduction: "32.00", withdrawable: "24.00", colorTheme: "bronze" },
  { id: "D", rankOrder: 3, entryFee: "32.00", multiplier: 8, totalGain: "256.00", nextBoardDeduction: "128.00", withdrawable: "96.00", colorTheme: "silver" },
  { id: "C", rankOrder: 4, entryFee: "128.00", multiplier: 8, totalGain: "1024.00", nextBoardDeduction: "512.00", withdrawable: "384.00", colorTheme: "gold" },
  { id: "B", rankOrder: 5, entryFee: "512.00", multiplier: 8, totalGain: "4096.00", nextBoardDeduction: "2048.00", withdrawable: "1536.00", colorTheme: "platinum" },
  { id: "A", rankOrder: 6, entryFee: "2048.00", multiplier: 8, totalGain: "16384.00", nextBoardDeduction: "8192.00", withdrawable: "6143.00", colorTheme: "emerald" },
  { id: "S", rankOrder: 7, entryFee: "8192.00", multiplier: 8, totalGain: "65536.00", nextBoardDeduction: "0.00", withdrawable: "50000.00", colorTheme: "diamond" },
];

async function seed() {
  // Ensure payment webhook audit infrastructure exists, even if schema sync is skipped.
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE payment_event_status AS ENUM ('RECEIVED','PROCESSED','IGNORED','FAILED');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS payment_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      provider varchar(30) NOT NULL,
      event_id varchar(120) NOT NULL,
      event_type varchar(50) NOT NULL,
      reference_id varchar(100),
      transaction_id uuid REFERENCES transactions(id),
      status payment_event_status NOT NULL DEFAULT 'RECEIVED',
      payload jsonb NOT NULL,
      error text,
      received_at timestamptz NOT NULL DEFAULT now(),
      processed_at timestamptz
    );
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_events_provider_event_id ON payment_events(provider, event_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_payment_events_reference ON payment_events(reference_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_payment_events_transaction ON payment_events(transaction_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_payment_events_status_received ON payment_events(status, received_at);`);
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE otp_purpose AS ENUM ('EMAIL_VERIFICATION','WITHDRAWAL');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS otp_codes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id),
      purpose otp_purpose NOT NULL,
      code_hash varchar(128) NOT NULL,
      amount_usd numeric(18,2),
      attempts integer NOT NULL DEFAULT 0,
      max_attempts integer NOT NULL DEFAULT 5,
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_otp_user_purpose_created ON otp_codes(user_id, purpose, created_at);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_otp_expires_at ON otp_codes(expires_at);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_otp_consumed_at ON otp_codes(consumed_at);`);
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
  await db.execute(sql`
    INSERT INTO ledger_accounts (code, name, type, user_id, currency, active)
    SELECT 'USER_AVAILABLE_' || w.user_id::text || '_USD', 'User Available USD', 'USER_AVAILABLE', w.user_id, 'USD', true
    FROM wallets w
    ON CONFLICT (code) DO NOTHING;
  `);
  await db.execute(sql`
    INSERT INTO ledger_accounts (code, name, type, user_id, currency, active)
    SELECT 'USER_BLOCKED_' || w.user_id::text || '_USD', 'User Blocked USD', 'USER_BLOCKED', w.user_id, 'USD', true
    FROM wallets w
    ON CONFLICT (code) DO NOTHING;
  `);
  await db.execute(sql`
    INSERT INTO ledger_entries (
      transaction_id,
      debit_account_id,
      credit_account_id,
      amount,
      currency,
      status,
      description,
      metadata,
      idempotency_key
    )
    SELECT
      NULL,
      treasury.id,
      available.id,
      w.balance_usd,
      'USD',
      'POSTED',
      'Bootstrap available balance',
      jsonb_build_object('source', 'seed-bootstrap', 'scope', 'available'),
      'bootstrap:available:' || w.user_id::text
    FROM wallets w
    INNER JOIN ledger_accounts treasury ON treasury.code = 'TREASURY_USD'
    INNER JOIN ledger_accounts available ON available.code = ('USER_AVAILABLE_' || w.user_id::text || '_USD')
    WHERE w.balance_usd::numeric > 0
    ON CONFLICT (idempotency_key) DO NOTHING;
  `);
  await db.execute(sql`
    INSERT INTO ledger_entries (
      transaction_id,
      debit_account_id,
      credit_account_id,
      amount,
      currency,
      status,
      description,
      metadata,
      idempotency_key
    )
    SELECT
      NULL,
      treasury.id,
      blocked.id,
      w.balance_reserved,
      'USD',
      'POSTED',
      'Bootstrap blocked balance',
      jsonb_build_object('source', 'seed-bootstrap', 'scope', 'blocked'),
      'bootstrap:blocked:' || w.user_id::text
    FROM wallets w
    INNER JOIN ledger_accounts treasury ON treasury.code = 'TREASURY_USD'
    INNER JOIN ledger_accounts blocked ON blocked.code = ('USER_BLOCKED_' || w.user_id::text || '_USD')
    WHERE w.balance_reserved::numeric > 0
    ON CONFLICT (idempotency_key) DO NOTHING;
  `);

  console.log("Seeding boards...");
  for (const board of BOARDS) {
    await db.insert(boardsTable).values(board).onConflictDoUpdate({
      target: boardsTable.id,
      set: {
        entryFee: board.entryFee,
        totalGain: board.totalGain,
        nextBoardDeduction: board.nextBoardDeduction,
        withdrawable: board.withdrawable,
        colorTheme: board.colorTheme,
      },
    });
  }
  console.log("Boards seeded!");

  console.log("Checking admin user...");
  const existing = await db.select().from(usersTable).where(eq(usersTable.role, "ADMIN")).limit(1);

  if (!existing.length) {
    const adminPassword = process.env.ADMIN_SEED_PASSWORD;
    if (!adminPassword) {
      throw new Error("ADMIN_SEED_PASSWORD environment variable must be set to create the admin account");
    }
    console.log("Creating admin user...");
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const adminEmail = process.env.ADMIN_SEED_EMAIL || "admin@ecrossflow.com";
    const adminReferralCode = process.env.ADMIN_SEED_REFERRAL_CODE || "ECFADMIN0";
    const [admin] = await db.insert(usersTable).values({
      firstName: "Admin",
      lastName: "Ecrossflow",
      username: "admin",
      email: adminEmail,
      passwordHash,
      referralCode: adminReferralCode,
      status: "ACTIVE",
      role: "ADMIN",
      currentBoard: "F",
      activatedAt: new Date(),
    }).returning();

    await db.insert(walletsTable).values({
      userId: admin.id,
      balanceUsd: "1000.00",
      balancePending: "0",
      balanceReserved: "0",
    });

    await db.insert(boardInstancesTable).values({
      boardId: "F",
      instanceNumber: 1,
      rankerId: admin.id,
      status: "WAITING",
      slotsFilled: 0,
      totalCollected: "0",
    });

    console.log(`Admin created: ${adminEmail}`);
    console.log(`Admin referral code: ${adminReferralCode}`);
  } else {
    console.log("Admin already exists, seeding board instances if missing...");
    const adminId = existing[0].id;
    const existingInstances = await db.select().from(boardInstancesTable).where(eq(boardInstancesTable.boardId, "F")).limit(1);
    if (!existingInstances.length) {
      await db.insert(boardInstancesTable).values({
        boardId: "F",
        instanceNumber: 1,
        rankerId: adminId,
        status: "WAITING",
        slotsFilled: 0,
        totalCollected: "0",
      });
      console.log("Board F instance created");
    }
  }

  // Final backfill after potential user/admin creation in this seed run.
  await db.execute(sql`
    INSERT INTO ledger_accounts (code, name, type, user_id, currency, active)
    SELECT 'USER_AVAILABLE_' || w.user_id::text || '_USD', 'User Available USD', 'USER_AVAILABLE', w.user_id, 'USD', true
    FROM wallets w
    ON CONFLICT (code) DO NOTHING;
  `);
  await db.execute(sql`
    INSERT INTO ledger_accounts (code, name, type, user_id, currency, active)
    SELECT 'USER_BLOCKED_' || w.user_id::text || '_USD', 'User Blocked USD', 'USER_BLOCKED', w.user_id, 'USD', true
    FROM wallets w
    ON CONFLICT (code) DO NOTHING;
  `);
  await db.execute(sql`
    INSERT INTO ledger_entries (
      transaction_id, debit_account_id, credit_account_id, amount, currency, status, description, metadata, idempotency_key
    )
    SELECT
      NULL, treasury.id, available.id, w.balance_usd, 'USD', 'POSTED',
      'Bootstrap available balance', jsonb_build_object('source', 'seed-bootstrap', 'scope', 'available'),
      'bootstrap:available:' || w.user_id::text
    FROM wallets w
    INNER JOIN ledger_accounts treasury ON treasury.code = 'TREASURY_USD'
    INNER JOIN ledger_accounts available ON available.code = ('USER_AVAILABLE_' || w.user_id::text || '_USD')
    WHERE w.balance_usd::numeric > 0
    ON CONFLICT (idempotency_key) DO NOTHING;
  `);
  await db.execute(sql`
    INSERT INTO ledger_entries (
      transaction_id, debit_account_id, credit_account_id, amount, currency, status, description, metadata, idempotency_key
    )
    SELECT
      NULL, treasury.id, blocked.id, w.balance_reserved, 'USD', 'POSTED',
      'Bootstrap blocked balance', jsonb_build_object('source', 'seed-bootstrap', 'scope', 'blocked'),
      'bootstrap:blocked:' || w.user_id::text
    FROM wallets w
    INNER JOIN ledger_accounts treasury ON treasury.code = 'TREASURY_USD'
    INNER JOIN ledger_accounts blocked ON blocked.code = ('USER_BLOCKED_' || w.user_id::text || '_USD')
    WHERE w.balance_reserved::numeric > 0
    ON CONFLICT (idempotency_key) DO NOTHING;
  `);

  console.log("Seed complete!");
  process.exit(0);
}

seed().catch(console.error);
