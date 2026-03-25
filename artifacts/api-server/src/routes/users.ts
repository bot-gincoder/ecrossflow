import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireActiveAuth as requireAuth, type AuthRequest } from "../middlewares/auth.js";

const router: IRouter = Router();

router.get("/users/me", requireAuth as never, async (req: AuthRequest, res) => {
  const users = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!users.length) {
    res.status(404).json({ error: "Not Found", message: "User not found" });
    return;
  }
  const user = users[0];
  res.json({
    id: user.id,
    accountNumber: user.accountNumber,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    referralCode: user.referralCode,
    status: user.status,
    role: user.role,
    kycStatus: user.kycStatus,
    preferredLanguage: user.preferredLanguage,
    preferredCurrency: user.preferredCurrency,
    preferredTheme: user.preferredTheme,
    currentBoard: user.currentBoard,
    createdAt: user.createdAt,
  });
});

router.put("/users/me", requireAuth as never, async (req: AuthRequest, res) => {
  const { firstName, lastName, phone } = req.body as { firstName?: string; lastName?: string; phone?: string };
  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (firstName) updates.firstName = firstName;
  if (lastName) updates.lastName = lastName;
  if (phone !== undefined) updates.phone = phone;
  updates.updatedAt = new Date();

  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, req.userId!)).returning();
  res.json({
    id: updated.id,
    accountNumber: updated.accountNumber,
    firstName: updated.firstName,
    lastName: updated.lastName,
    username: updated.username,
    email: updated.email,
    phone: updated.phone,
    avatarUrl: updated.avatarUrl,
    referralCode: updated.referralCode,
    status: updated.status,
    role: updated.role,
    kycStatus: updated.kycStatus,
    preferredLanguage: updated.preferredLanguage,
    preferredCurrency: updated.preferredCurrency,
    preferredTheme: updated.preferredTheme,
    currentBoard: updated.currentBoard,
    createdAt: updated.createdAt,
  });
});

router.put("/users/me/settings", requireAuth as never, async (req: AuthRequest, res) => {
  const { preferredLanguage, preferredCurrency, preferredTheme } = req.body as {
    preferredLanguage?: string;
    preferredCurrency?: string;
    preferredTheme?: string;
  };
  const updates: Partial<typeof usersTable.$inferInsert> = { updatedAt: new Date() };
  if (preferredLanguage) updates.preferredLanguage = preferredLanguage;
  if (preferredCurrency) updates.preferredCurrency = preferredCurrency;
  if (preferredTheme) updates.preferredTheme = preferredTheme;

  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, req.userId!)).returning();
  res.json({
    id: updated.id,
    accountNumber: updated.accountNumber,
    firstName: updated.firstName,
    lastName: updated.lastName,
    username: updated.username,
    email: updated.email,
    phone: updated.phone,
    avatarUrl: updated.avatarUrl,
    referralCode: updated.referralCode,
    status: updated.status,
    role: updated.role,
    kycStatus: updated.kycStatus,
    preferredLanguage: updated.preferredLanguage,
    preferredCurrency: updated.preferredCurrency,
    preferredTheme: updated.preferredTheme,
    currentBoard: updated.currentBoard,
    createdAt: updated.createdAt,
  });
});

router.patch("/users/preferences", requireAuth as never, async (req: AuthRequest, res) => {
  const { preferredLanguage, preferredCurrency, preferredTheme, phone } = req.body as {
    preferredLanguage?: string;
    preferredCurrency?: string;
    preferredTheme?: string;
    phone?: string;
  };
  const updates: Partial<typeof usersTable.$inferInsert> = { updatedAt: new Date() };
  if (preferredLanguage) updates.preferredLanguage = preferredLanguage;
  if (preferredCurrency) updates.preferredCurrency = preferredCurrency;
  if (preferredTheme) updates.preferredTheme = preferredTheme;
  if (phone !== undefined) updates.phone = phone || null;

  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, req.userId!)).returning();
  res.json({
    id: updated.id,
    accountNumber: updated.accountNumber,
    firstName: updated.firstName,
    lastName: updated.lastName,
    username: updated.username,
    email: updated.email,
    phone: updated.phone,
    avatarUrl: updated.avatarUrl,
    referralCode: updated.referralCode,
    status: updated.status,
    role: updated.role,
    kycStatus: updated.kycStatus,
    preferredLanguage: updated.preferredLanguage,
    preferredCurrency: updated.preferredCurrency,
    preferredTheme: updated.preferredTheme,
    currentBoard: updated.currentBoard,
    createdAt: updated.createdAt,
  });
});

router.post("/users/me/kyc/request", requireAuth as never, async (req: AuthRequest, res) => {
  const [updated] = await db.update(usersTable)
    .set({
      kycStatus: "PENDING",
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, req.userId!))
    .returning({
      id: usersTable.id,
      kycStatus: usersTable.kycStatus,
    });

  res.json({
    message: "KYC request submitted",
    user: updated,
  });
});

export default router;
