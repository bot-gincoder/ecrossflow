import { db } from "@workspace/db";
import { boardsTable, usersTable, walletsTable, boardInstancesTable } from "@workspace/db";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

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

  console.log("Seed complete!");
  process.exit(0);
}

seed().catch(console.error);
