import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable, walletsTable, referralsTable, notificationsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { signToken, requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { sendEmail, buildOtpEmail } from "../services/email.js";

interface OtpEntry {
  otp: string;
  userId: string;
  expiresAt: number;
  attempts: number;
}

const otpStore = new Map<string, OtpEntry>();

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function cleanOtpStore() {
  const now = Date.now();
  for (const [key, entry] of otpStore.entries()) {
    if (entry.expiresAt < now) otpStore.delete(key);
  }
}

const router: IRouter = Router();

function generateReferralCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "ECF";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

router.get("/auth/verify-referral", async (req, res) => {
  const { code } = req.query as { code: string };
  if (!code) {
    res.status(400).json({ error: "Bad Request", message: "Code required" });
    return;
  }

  const user = await db.select({
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
    username: usersTable.username,
  }).from(usersTable).where(eq(usersTable.referralCode, code.toUpperCase())).limit(1);

  if (!user.length) {
    res.status(404).json({ error: "Not Found", message: "Invalid referral code" });
    return;
  }

  res.json({
    valid: true,
    referrerName: `${user[0].firstName} ${user[0].lastName}`,
    referrerUsername: user[0].username,
  });
});

router.get("/auth/check-username", async (req, res) => {
  const { username } = req.query as { username: string };
  if (!username) {
    res.status(400).json({ error: "Bad Request", message: "Username required" });
    return;
  }

  const existing = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, username.toLowerCase()))
    .limit(1);

  res.json({ available: !existing.length });
});

router.post("/auth/register", async (req, res) => {
  const { firstName, lastName, username, email, password, referralCode, phone, preferredLanguage } = req.body;

  if (!firstName || !lastName || !username || !email || !password || !referralCode) {
    res.status(400).json({ error: "Bad Request", message: "Missing required fields" });
    return;
  }

  if (username.length < 3 || username.length > 20 || !/^[a-z0-9_]+$/.test(username.toLowerCase())) {
    res.status(400).json({ error: "Bad Request", message: "Invalid username format" });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: "Bad Request", message: "Password must be at least 8 characters" });
    return;
  }

  const referrer = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.referralCode, referralCode.toUpperCase()))
    .limit(1);

  if (!referrer.length) {
    res.status(400).json({ error: "Bad Request", message: "Invalid referral code" });
    return;
  }

  const existing = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(or(eq(usersTable.email, email.toLowerCase()), eq(usersTable.username, username.toLowerCase())))
    .limit(1);

  if (existing.length) {
    res.status(409).json({ error: "Conflict", message: "Email or username already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  let uniqueCode = generateReferralCode();
  let codeExists = true;
  while (codeExists) {
    const check = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.referralCode, uniqueCode))
      .limit(1);
    if (!check.length) codeExists = false;
    else uniqueCode = generateReferralCode();
  }

  const [newUser] = await db.insert(usersTable).values({
    firstName,
    lastName,
    username: username.toLowerCase(),
    email: email.toLowerCase(),
    passwordHash,
    phone: phone || null,
    referralCode: uniqueCode,
    referredBy: referrer[0].id,
    preferredLanguage: preferredLanguage || "fr",
    status: "PENDING",
    role: "USER",
  }).returning();

  await db.insert(walletsTable).values({
    userId: newUser.id,
    balanceUsd: "0",
    balancePending: "0",
    balanceReserved: "0",
  });

  await db.insert(referralsTable).values({
    referrerId: referrer[0].id,
    referredId: newUser.id,
    bonusPaid: false,
  });

  await db.insert(notificationsTable).values({
    userId: newUser.id,
    type: "ACCOUNT_CREATED",
    title: "Bienvenue sur Ecrossflow !",
    message: `Votre compte a été créé avec succès. Complétez l'activation pour commencer.`,
    category: "system",
    read: false,
  });

  const token = signToken(newUser.id, newUser.role);
  const { passwordHash: _, ...userWithoutPassword } = newUser;

  res.status(201).json({
    token,
    user: {
      id: newUser.id,
      accountNumber: newUser.accountNumber,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      username: newUser.username,
      email: newUser.email,
      phone: newUser.phone,
      avatarUrl: newUser.avatarUrl,
      referralCode: newUser.referralCode,
      status: newUser.status,
      role: newUser.role,
      preferredLanguage: newUser.preferredLanguage,
      preferredCurrency: newUser.preferredCurrency,
      preferredTheme: newUser.preferredTheme,
      currentBoard: newUser.currentBoard,
      createdAt: newUser.createdAt,
    },
  });
});

router.post("/auth/login", async (req, res) => {
  const { emailOrUsername, password, rememberMe } = req.body;

  if (!emailOrUsername || !password) {
    res.status(400).json({ error: "Bad Request", message: "Email/username and password required" });
    return;
  }

  const users = await db.select()
    .from(usersTable)
    .where(or(
      eq(usersTable.email, emailOrUsername.toLowerCase()),
      eq(usersTable.username, emailOrUsername.toLowerCase())
    ))
    .limit(1);

  if (!users.length) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
    return;
  }

  const user = users[0];

  if (user.status === "SUSPENDED") {
    res.status(401).json({ error: "Unauthorized", message: "Account suspended" });
    return;
  }

  if (user.status === "PENDING") {
    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
      return;
    }
    const verificationToken = signToken(user.id, user.role, false);
    res.status(403).json({
      error: "Forbidden",
      message: "Email not verified. Please check your inbox for the verification code.",
      code: "EMAIL_NOT_VERIFIED",
      email: user.email,
      verificationToken,
    });
    return;
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
    return;
  }

  const token = signToken(user.id, user.role, rememberMe);

  res.json({
    token,
    user: {
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
    },
  });
});

router.post("/auth/logout", requireAuth as never, (req, res) => {
  res.json({ message: "Logged out successfully" });
});

router.post("/auth/send-otp", requireAuth as never, async (req, res) => {
  const authReq = req as AuthRequest;
  cleanOtpStore();

  if (!authReq.userId) {
    res.status(401).json({ error: "Unauthorized", message: "Not authenticated" });
    return;
  }

  const users = await db.select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, authReq.userId))
    .limit(1);

  if (!users.length) {
    res.status(404).json({ error: "Not Found", message: "User not found" });
    return;
  }

  const { email } = users[0];
  const otp = generateOtp();
  const key = `otp:${email}`;

  otpStore.set(key, {
    otp,
    userId: authReq.userId,
    expiresAt: Date.now() + 10 * 60 * 1000,
    attempts: 0,
  });

  await sendEmail(buildOtpEmail(otp, email)).catch(() => {
    console.warn(`[OTP] Email delivery failed for ${email}`);
  });

  res.json({ message: "OTP sent", email });
});

router.post("/auth/resend-otp", requireAuth as never, async (req, res) => {
  const authReq = req as AuthRequest;
  cleanOtpStore();

  if (!authReq.userId) {
    res.status(401).json({ error: "Unauthorized", message: "Not authenticated" });
    return;
  }

  const users = await db.select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, authReq.userId))
    .limit(1);

  if (!users.length) {
    res.status(404).json({ error: "Not Found", message: "User not found" });
    return;
  }

  const { email } = users[0];
  const otp = generateOtp();
  const key = `otp:${email}`;

  otpStore.set(key, {
    otp,
    userId: authReq.userId,
    expiresAt: Date.now() + 10 * 60 * 1000,
    attempts: 0,
  });

  await sendEmail(buildOtpEmail(otp, email)).catch(() => {
    console.warn(`[OTP] Email delivery failed for ${email}`);
  });

  res.json({ message: "OTP resent", email });
});

router.post("/auth/verify-email", requireAuth as never, async (req, res) => {
  const authReq = req as AuthRequest;

  if (!authReq.userId) {
    res.status(401).json({ error: "Unauthorized", message: "Not authenticated" });
    return;
  }

  const users = await db.select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, authReq.userId))
    .limit(1);

  if (!users.length) {
    res.status(404).json({ error: "Not Found", message: "User not found" });
    return;
  }

  const { otp } = req.body as { otp?: string };
  if (!otp) {
    res.status(400).json({ error: "Bad Request", message: "OTP required" });
    return;
  }

  const email = users[0].email;
  const key = `otp:${email}`;
  const entry = otpStore.get(key);

  if (!entry) {
    res.status(400).json({ error: "Bad Request", message: "No OTP found. Please request a new one." });
    return;
  }

  if (entry.userId !== authReq.userId) {
    res.status(403).json({ error: "Forbidden", message: "OTP does not belong to this account." });
    return;
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(key);
    res.status(400).json({ error: "Bad Request", message: "OTP expired. Please request a new one." });
    return;
  }

  entry.attempts++;
  if (entry.attempts > 5) {
    otpStore.delete(key);
    res.status(429).json({ error: "Too Many Requests", message: "Too many attempts. Please request a new OTP." });
    return;
  }

  if (entry.otp !== otp) {
    res.status(400).json({ error: "Bad Request", message: "Invalid OTP code." });
    return;
  }

  otpStore.delete(key);

  await db.update(usersTable)
    .set({ status: "ACTIVE", activatedAt: new Date() })
    .where(eq(usersTable.id, authReq.userId));

  res.json({ message: "Email verified successfully" });
});

export default router;
