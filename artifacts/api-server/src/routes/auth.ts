import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable, walletsTable, referralsTable, notificationsTable, otpCodesTable } from "@workspace/db";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { signToken, requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { sendEmail, buildOtpEmail } from "../services/email.js";
import { OAuth2Client } from "google-auth-library";
import { createHash } from "crypto";
import { ensureLedgerInfra, ensureWalletAndLedgerAccounts } from "../lib/ledger.js";

const googleClient = process.env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  : null;
let otpInfraReady = false;
let otpInfraPromise: Promise<void> | null = null;

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashOtp(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

async function ensureOtpInfra(): Promise<void> {
  if (otpInfraReady) return;
  if (otpInfraPromise) return otpInfraPromise;
  otpInfraPromise = (async () => {
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
    otpInfraReady = true;
  })();
  try {
    await otpInfraPromise;
  } finally {
    otpInfraPromise = null;
  }
}

async function saveOtpCode(userId: string, otp: string) {
  await ensureOtpInfra();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(otpCodesTable)
      .set({ consumedAt: now })
      .where(and(
        eq(otpCodesTable.userId, userId),
        eq(otpCodesTable.purpose, "EMAIL_VERIFICATION"),
        isNull(otpCodesTable.consumedAt),
      ));

    await tx.insert(otpCodesTable).values({
      userId,
      purpose: "EMAIL_VERIFICATION",
      codeHash: hashOtp(otp),
      attempts: 0,
      maxAttempts: 5,
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
    });
  });
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
    id: usersTable.id,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
    username: usersTable.username,
  }).from(usersTable).where(eq(usersTable.referralCode, code.toUpperCase())).limit(1);

  if (!user.length) {
    res.status(404).json({ error: "Not Found", message: "Invalid referral code" });
    return;
  }

  // Check if this is the platform starter code and already used
  const PLATFORM_CODE = (process.env.PLATFORM_REF_CODE || "ECFSTART").toUpperCase();
  if (code.toUpperCase() === PLATFORM_CODE) {
    const usageCount = await db.select({ count: referralsTable.id })
      .from(referralsTable)
      .where(eq(referralsTable.referrerId, user[0].id));
    if (usageCount.length > 0) {
      res.status(404).json({ error: "Not Found", message: "Ce code de démarrage a déjà été utilisé. Obtenez le code d'un membre actif." });
      return;
    }
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

router.post("/auth/google", async (req, res) => {
  await ensureLedgerInfra();
  if (!googleClient && !process.env.GOOGLE_CLIENT_ID) {
    res.status(503).json({ error: "Service Unavailable", message: "Google authentication is not configured on this server." });
    return;
  }

  const { accessToken, referralCode, phone } = req.body as {
    accessToken?: string;
    referralCode?: string;
    phone?: string;
  };

  if (!accessToken) {
    res.status(400).json({ error: "Bad Request", message: "Google access token required" });
    return;
  }

  let googlePayload: { sub: string; email: string; given_name?: string; family_name?: string; picture?: string; name?: string } | null = null;
  try {
    const response = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error("Failed to verify token");
    const info = await response.json() as {
      sub: string;
      email: string;
      given_name?: string;
      family_name?: string;
      picture?: string;
      name?: string;
    };
    if (!info.sub || !info.email) throw new Error("Invalid token payload");
    googlePayload = info;
  } catch {
    res.status(401).json({ error: "Unauthorized", message: "Invalid Google token" });
    return;
  }

  const { sub: googleId, email, given_name, family_name, picture, name } = googlePayload;

  const existing = await db.select()
    .from(usersTable)
    .where(or(
      eq(usersTable.googleId, googleId),
      eq(usersTable.email, email.toLowerCase())
    ))
    .limit(1);

  if (existing.length) {
    const user = existing[0];

    if (user.status === "SUSPENDED") {
      res.status(401).json({ error: "Unauthorized", message: "Account suspended" });
      return;
    }

    if (!user.googleId) {
      await db.update(usersTable)
        .set({ googleId, avatarUrl: user.avatarUrl || picture || null })
        .where(eq(usersTable.id, user.id));
    }

    const token = signToken(user.id, user.role, true);
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
        avatarUrl: user.avatarUrl || picture || null,
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
    return;
  }

  if (!referralCode) {
    res.status(200).json({
      code: "GOOGLE_NEW_USER",
      email,
      firstName: given_name || (name ? name.split(" ")[0] : ""),
      lastName: family_name || (name ? name.split(" ").slice(1).join(" ") : ""),
      avatarUrl: picture || null,
    });
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

  const firstName = given_name || (name ? name.split(" ")[0] : "") || "User";
  const lastName = family_name || (name ? name.split(" ").slice(1).join(" ") : "") || "";

  const baseUsername = email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 16);
  let candidateUsername = baseUsername;
  let usernameExists = true;
  let attempt = 0;
  while (usernameExists) {
    const check = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, candidateUsername))
      .limit(1);
    if (!check.length) { usernameExists = false; }
    else { attempt++; candidateUsername = `${baseUsername}${attempt}`; }
  }

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

  const placeholderHash = await bcrypt.hash(`GOOGLE_${googleId}_${Date.now()}`, 10);

  const newUser = await db.transaction(async (tx) => {
    const [createdUser] = await tx.insert(usersTable).values({
      firstName,
      lastName,
      username: candidateUsername,
      email: email.toLowerCase(),
      passwordHash: placeholderHash,
      googleId,
      phone: phone || null,
      avatarUrl: picture || null,
      referralCode: uniqueCode,
      referredBy: referrer[0].id,
      preferredLanguage: "fr",
      status: "ACTIVE",
      role: "USER",
      activatedAt: new Date(),
    }).returning();

    await tx.insert(walletsTable).values({
      userId: createdUser.id,
      balanceUsd: "0",
      balancePending: "0",
      balanceReserved: "0",
    });
    await ensureWalletAndLedgerAccounts(tx, createdUser.id, "USD");

    await tx.insert(referralsTable).values({
      referrerId: referrer[0].id,
      referredId: createdUser.id,
      bonusPaid: false,
    });

    await tx.insert(notificationsTable).values({
      userId: createdUser.id,
      type: "ACCOUNT_CREATED",
      title: "Bienvenue sur Ecrossflow !",
      message: "Votre compte a été créé via Google. Bienvenue dans la communauté !",
      category: "system",
      read: false,
    });

    return createdUser;
  });

  const token = signToken(newUser.id, newUser.role, true);

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

router.post("/auth/register", async (req, res) => {
  await ensureLedgerInfra();
  const { firstName, lastName, username, email, password, referralCode, phone, preferredLanguage } = req.body;

  if (!firstName || !lastName || !username || !email || !password || !referralCode || !phone) {
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

  const referrer = await db.select({ id: usersTable.id, referralCode: usersTable.referralCode })
    .from(usersTable)
    .where(eq(usersTable.referralCode, referralCode.toUpperCase()))
    .limit(1);

  if (!referrer.length) {
    res.status(400).json({ error: "Bad Request", message: "Invalid referral code" });
    return;
  }

  // ECFSTART is a one-time use platform starter code
  const PLATFORM_CODE = (process.env.PLATFORM_REF_CODE || "ECFSTART").toUpperCase();
  if (referralCode.toUpperCase() === PLATFORM_CODE) {
    const existingReferrals = await db.select({ id: referralsTable.id })
      .from(referralsTable)
      .where(eq(referralsTable.referrerId, referrer[0].id))
      .limit(1);
    if (existingReferrals.length > 0) {
      res.status(400).json({ error: "Bad Request", message: "Ce code de démarrage a déjà été utilisé. Demandez le code de parrainage d'un membre actif." });
      return;
    }
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

  const newUser = await db.transaction(async (tx) => {
    const [createdUser] = await tx.insert(usersTable).values({
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

    await tx.insert(walletsTable).values({
      userId: createdUser.id,
      balanceUsd: "0",
      balancePending: "0",
      balanceReserved: "0",
    });
    await ensureWalletAndLedgerAccounts(tx, createdUser.id, "USD");

    await tx.insert(referralsTable).values({
      referrerId: referrer[0].id,
      referredId: createdUser.id,
      bonusPaid: false,
    });

    await tx.insert(notificationsTable).values({
      userId: createdUser.id,
      type: "ACCOUNT_CREATED",
      title: "Bienvenue sur Ecrossflow !",
      message: "Votre compte a été créé avec succès. Complétez l'activation pour commencer.",
      category: "system",
      read: false,
    });

    return createdUser;
  });

  const token = signToken(newUser.id, newUser.role);
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

  if (!authReq.userId) {
    res.status(401).json({ error: "Unauthorized", message: "Not authenticated" });
    return;
  }

  const users = await db.select({ id: usersTable.id, email: usersTable.email, phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.id, authReq.userId))
    .limit(1);

  if (!users.length) {
    res.status(404).json({ error: "Not Found", message: "User not found" });
    return;
  }

  const { email, phone } = users[0];
  const method = (req.body?.method as string) || "email";
  const otp = generateOtp();
  await saveOtpCode(authReq.userId, otp);

  if (method === "sms" || method === "whatsapp") {
    const hasTwilio = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE;
    if (hasTwilio) {
      try {
        const accountSid = process.env.TWILIO_ACCOUNT_SID!;
        const authToken = process.env.TWILIO_AUTH_TOKEN!;
        const fromPhone = process.env.TWILIO_PHONE!;
        const toPhone = phone || "";
        if (toPhone) {
          const body = `Votre code Ecrossflow : ${otp}. Valable 10 minutes.`;
          const twilioTo = method === "whatsapp" ? `whatsapp:${toPhone}` : toPhone;
          const twilioFrom = method === "whatsapp" ? `whatsapp:${fromPhone}` : fromPhone;
          const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
            method: "POST",
            headers: {
              Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ To: twilioTo, From: twilioFrom, Body: body }).toString(),
          });
          if (!resp.ok) throw new Error("Twilio error");
          console.log(`[OTP] ${method.toUpperCase()} sent to ${toPhone}`);
          res.json({ message: "OTP sent", method, email });
          return;
        }
      } catch (err) {
        console.warn(`[OTP] ${method} delivery failed, falling back to email`, err);
      }
    } else {
      console.log(`[OTP] ${method.toUpperCase()} not configured, falling back to email`);
    }
  }

  // Default: email
  await sendEmail(buildOtpEmail(otp, email)).catch(() => {
    console.warn(`[OTP] Email delivery failed for ${email} — OTP code: ${otp}`);
  });

  res.json({ message: "OTP sent", method: "email", email });
});

router.post("/auth/resend-otp", requireAuth as never, async (req, res) => {
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

  const { email } = users[0];
  const otp = generateOtp();
  await saveOtpCode(authReq.userId, otp);

  await sendEmail(buildOtpEmail(otp, email)).catch(() => {
    console.warn(`[OTP] Email delivery failed for ${email} — OTP code: ${otp}`);
  });

  res.json({ message: "OTP resent", email });
});

router.post("/auth/verify-email", requireAuth as never, async (req, res) => {
  await ensureOtpInfra();
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

  const now = new Date();
  const entries = await db.select()
    .from(otpCodesTable)
    .where(and(
      eq(otpCodesTable.userId, authReq.userId),
      eq(otpCodesTable.purpose, "EMAIL_VERIFICATION"),
      isNull(otpCodesTable.consumedAt),
    ))
    .orderBy(desc(otpCodesTable.createdAt))
    .limit(1);

  if (!entries.length) {
    res.status(400).json({ error: "Bad Request", message: "No OTP found. Please request a new one." });
    return;
  }
  const entry = entries[0];

  if (now > entry.expiresAt) {
    await db.update(otpCodesTable)
      .set({ consumedAt: now })
      .where(eq(otpCodesTable.id, entry.id));
    res.status(400).json({ error: "Bad Request", message: "OTP expired. Please request a new one." });
    return;
  }

  const attemptsAfter = entry.attempts + 1;
  if (attemptsAfter > entry.maxAttempts) {
    await db.update(otpCodesTable)
      .set({ attempts: attemptsAfter, consumedAt: now })
      .where(eq(otpCodesTable.id, entry.id));
    res.status(429).json({ error: "Too Many Requests", message: "Too many attempts. Please request a new OTP." });
    return;
  }

  if (entry.codeHash !== hashOtp(otp)) {
    await db.update(otpCodesTable)
      .set({ attempts: attemptsAfter })
      .where(eq(otpCodesTable.id, entry.id));
    res.status(400).json({ error: "Bad Request", message: "Invalid OTP code." });
    return;
  }

  await db.transaction(async (tx) => {
    await tx.update(otpCodesTable)
      .set({ attempts: attemptsAfter, consumedAt: now })
      .where(eq(otpCodesTable.id, entry.id));

    await tx.update(usersTable)
      .set({ status: "ACTIVE", activatedAt: now })
      .where(eq(usersTable.id, authReq.userId!));
  });

  res.json({ message: "Email verified successfully" });
});

export default router;
