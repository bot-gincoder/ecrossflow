import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";

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
    preferredLanguage: user.preferredLanguage,
    preferredCurrency: user.preferredCurrency,
    preferredTheme: user.preferredTheme,
    currentBoard: user.currentBoard,
    createdAt: user.createdAt,
  });
});

router.put("/users/me", requireAuth as never, async (req: AuthRequest, res) => {
  const { firstName, lastName, phone } = req.body;
  const updates: any = {};
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
    preferredLanguage: updated.preferredLanguage,
    preferredCurrency: updated.preferredCurrency,
    preferredTheme: updated.preferredTheme,
    currentBoard: updated.currentBoard,
    createdAt: updated.createdAt,
  });
});

router.put("/users/me/settings", requireAuth as never, async (req: AuthRequest, res) => {
  const { preferredLanguage, preferredCurrency, preferredTheme } = req.body;
  const updates: any = { updatedAt: new Date() };
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
    preferredLanguage: updated.preferredLanguage,
    preferredCurrency: updated.preferredCurrency,
    preferredTheme: updated.preferredTheme,
    currentBoard: updated.currentBoard,
    createdAt: updated.createdAt,
  });
});

export default router;
