import { createHmac } from "crypto";
import { db, ledgerAccountsTable, ledgerEntriesTable, usersTable, walletsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

type Mismatch = {
  userId: string;
  username: string;
  walletAvailable: number;
  ledgerAvailable: number;
  walletBlocked: number;
  ledgerBlocked: number;
  deltaAvailable: number;
  deltaBlocked: number;
};

function envNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function sendWebhookAlert(payload: Record<string, unknown>) {
  const url = process.env.RECON_ALERT_WEBHOOK_URL || "";
  if (!url) return;

  const body = JSON.stringify(payload);
  const secret = process.env.RECON_ALERT_WEBHOOK_SECRET || "";
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (secret) {
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    headers["x-ecrossflow-signature"] = `sha256=${signature}`;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
    });
    if (!res.ok) {
      console.error(`[RECON] Alert webhook failed: ${res.status}`);
    }
  } catch (error) {
    console.error("[RECON] Alert webhook error:", error);
  }
}

async function run() {
  const tolerance = envNumber("RECON_TOLERANCE_USD", 0.01);

  // If these tables are missing, the platform isn't ready for production reconciliation.
  await db.select({ id: ledgerAccountsTable.id }).from(ledgerAccountsTable).limit(1);
  await db.select({ id: ledgerEntriesTable.id }).from(ledgerEntriesTable).limit(1);

  const walletRows = await db.select({
    userId: walletsTable.userId,
    username: usersTable.username,
    walletAvailable: walletsTable.balanceUsd,
    walletBlocked: walletsTable.balanceReserved,
  })
    .from(walletsTable)
    .innerJoin(usersTable, eq(walletsTable.userId, usersTable.id));

  const ledgerResult = await db.execute(sql`
    SELECT
      a.user_id::text AS user_id,
      a.type::text AS type,
      (
        COALESCE(SUM(CASE WHEN le.credit_account_id = a.id AND le.status = 'POSTED' THEN le.amount ELSE 0 END), 0)
        -
        COALESCE(SUM(CASE WHEN le.debit_account_id = a.id AND le.status = 'POSTED' THEN le.amount ELSE 0 END), 0)
      )::numeric(18,2) AS ledger_balance
    FROM ledger_accounts a
    LEFT JOIN ledger_entries le
      ON le.credit_account_id = a.id OR le.debit_account_id = a.id
    WHERE a.user_id IS NOT NULL
      AND a.type IN ('USER_AVAILABLE', 'USER_BLOCKED')
    GROUP BY a.user_id, a.type
  `);

  const ledgerByUser = new Map<string, { available: number; blocked: number }>();
  for (const row of ledgerResult.rows as Array<Record<string, unknown>>) {
    const userId = String(row.user_id || "");
    const type = String(row.type || "");
    const balance = Number.parseFloat(String(row.ledger_balance || "0"));
    if (!userId) continue;
    const current = ledgerByUser.get(userId) || { available: 0, blocked: 0 };
    if (type === "USER_AVAILABLE") current.available = Number.isFinite(balance) ? balance : 0;
    if (type === "USER_BLOCKED") current.blocked = Number.isFinite(balance) ? balance : 0;
    ledgerByUser.set(userId, current);
  }

  const mismatches: Mismatch[] = [];
  for (const row of walletRows) {
    const expected = ledgerByUser.get(row.userId) || { available: 0, blocked: 0 };
    const walletAvailable = Number.parseFloat(row.walletAvailable);
    const walletBlocked = Number.parseFloat(row.walletBlocked);
    const deltaAvailable = Number.parseFloat((walletAvailable - expected.available).toFixed(2));
    const deltaBlocked = Number.parseFloat((walletBlocked - expected.blocked).toFixed(2));
    if (Math.abs(deltaAvailable) > tolerance || Math.abs(deltaBlocked) > tolerance) {
      mismatches.push({
        userId: row.userId,
        username: row.username,
        walletAvailable: Number.parseFloat(walletAvailable.toFixed(2)),
        ledgerAvailable: Number.parseFloat(expected.available.toFixed(2)),
        walletBlocked: Number.parseFloat(walletBlocked.toFixed(2)),
        ledgerBlocked: Number.parseFloat(expected.blocked.toFixed(2)),
        deltaAvailable,
        deltaBlocked,
      });
    }
  }

  const totals = walletRows.reduce((acc, row) => {
    acc.walletAvailable += Number.parseFloat(row.walletAvailable);
    acc.walletBlocked += Number.parseFloat(row.walletBlocked);
    const ledger = ledgerByUser.get(row.userId) || { available: 0, blocked: 0 };
    acc.ledgerAvailable += ledger.available;
    acc.ledgerBlocked += ledger.blocked;
    return acc;
  }, { walletAvailable: 0, walletBlocked: 0, ledgerAvailable: 0, ledgerBlocked: 0 });

  const summary = {
    ok: mismatches.length === 0,
    checkedUsers: walletRows.length,
    mismatchCount: mismatches.length,
    tolerance,
    totals: {
      walletAvailable: Number.parseFloat(totals.walletAvailable.toFixed(2)),
      walletBlocked: Number.parseFloat(totals.walletBlocked.toFixed(2)),
      ledgerAvailable: Number.parseFloat(totals.ledgerAvailable.toFixed(2)),
      ledgerBlocked: Number.parseFloat(totals.ledgerBlocked.toFixed(2)),
    },
    mismatches,
    at: new Date().toISOString(),
  };

  console.log(JSON.stringify(summary, null, 2));

  if (mismatches.length > 0) {
    await sendWebhookAlert({
      level: "critical",
      title: "Ledger reconciliation mismatch detected",
      summary,
    });
    process.exit(1);
  }
}

run().catch(async (error) => {
  console.error("[RECON] FAILED:", error);
  await sendWebhookAlert({
    level: "error",
    title: "Ledger reconciliation script failed",
    message: error instanceof Error ? error.message : "UNKNOWN_ERROR",
  });
  process.exit(2);
});
