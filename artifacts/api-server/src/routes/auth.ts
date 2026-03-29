import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { usersTable, walletsTable, referralsTable, notificationsTable, otpCodesTable } from "@workspace/db";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { signToken, requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { sendEmail, buildOtpEmail, buildEmailVerificationLinkEmailLocalized, buildAccountActivatedEmail, buildActionCardEmail } from "../services/email.js";
import { OAuth2Client } from "google-auth-library";
import { createHash } from "crypto";
import { ensureLedgerInfra, ensureWalletAndLedgerAccounts } from "../lib/ledger.js";
import { getBooleanSetting, getNumberSetting, getSystemSetting } from "../services/system-config.js";

const googleClient = process.env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  : null;
const JWT_SECRET: string = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable must be set");
  return secret;
})();
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

function getPublicAppUrl(): string {
  const raw = process.env.PUBLIC_APP_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  const domain = process.env.DOMAIN?.trim();
  if (domain) return `https://${domain.replace(/\/$/, "")}`;
  return "https://ecrossflow.com";
}

function renderTemplate(template: string, vars: Record<string, string | number>): string {
  let output = template;
  for (const [key, value] of Object.entries(vars)) {
    const pattern = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    output = output.replace(pattern, String(value));
  }
  return output;
}

function isTwilioConfigured(): boolean {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim() || "";
  const token = process.env.TWILIO_AUTH_TOKEN?.trim() || "";
  const phone = normalizeE164Phone(process.env.TWILIO_PHONE?.trim() || "");
  return Boolean(
    /^AC[a-zA-Z0-9]{32}$/.test(sid) &&
    token.length >= 16 &&
    phone
  );
}

function normalizeE164Phone(input?: string | null): string {
  if (!input) return "";
  const compact = input.replace(/[^\d+]/g, "");
  if (!compact.startsWith("+")) return "";
  const digits = compact.slice(1).replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return "";
  return `+${digits}`;
}

async function sendEmailVerificationLink(userId: string, role: string, email: string, preferredLanguage?: string): Promise<void> {
  const verificationToken = signToken(userId, role, false);
  const link = `${getPublicAppUrl()}/api/auth/confirm-email?token=${encodeURIComponent(verificationToken)}`;
  const cfg = await getSystemSetting<Record<string, unknown>>("notif_email_verification", {
    subject: "",
    bodyHtml: "",
    buttonLabel: "",
  });
  const subjectTpl = String(cfg?.subject || "").trim();
  const bodyTpl = String(cfg?.bodyHtml || "").trim();
  const buttonLabelTpl = String(cfg?.buttonLabel || "").trim();
  const locale = String(preferredLanguage || "fr").toLowerCase();
  const i18n = (() => {
    if (locale === "en") {
      return {
        title: "Confirm your email address",
        intro: "Your account is almost ready. Confirm your email to continue.",
        actionLabel: "Confirm my account",
        footerNote: "Security note: this confirmation link is personal and expires automatically.",
      };
    }
    if (locale === "es") {
      return {
        title: "Confirma tu correo electrónico",
        intro: "Tu cuenta está casi lista. Confirma tu correo para continuar.",
        actionLabel: "Confirmar mi cuenta",
        footerNote: "Nota de seguridad: este enlace de confirmación es personal y caduca automáticamente.",
      };
    }
    if (locale === "ht") {
      return {
        title: "Konfime adrès imèl ou",
        intro: "Kont ou prèske pare. Konfime imèl ou pou kontinye.",
        actionLabel: "Konfime kont mwen",
        footerNote: "Nòt sekirite: lyen konfimasyon sa a pèsonèl epi li ekspire otomatikman.",
      };
    }
    return {
      title: "Confirmez votre adresse email",
      intro: "Votre compte est presque prêt. Confirmez votre email pour continuer.",
      actionLabel: "Confirmer mon compte",
      footerNote: "Note de sécurité : ce lien de confirmation est personnel et expire automatiquement.",
    };
  })();
  const fallback = buildEmailVerificationLinkEmailLocalized(link, email, preferredLanguage);
  const payload = subjectTpl && bodyTpl
    ? buildActionCardEmail({
      to: email,
      subject: renderTemplate(subjectTpl, { app_name: "Ecrossflow" }),
      title: i18n.title,
      intro: i18n.intro,
      locale,
      rawHtml: renderTemplate(bodyTpl, {
        app_name: "Ecrossflow",
        verification_link: link,
        email,
      }),
      action: {
        label: buttonLabelTpl ? renderTemplate(buttonLabelTpl, { app_name: "Ecrossflow" }) : i18n.actionLabel,
        url: link,
      },
      footerNote: i18n.footerNote,
    })
    : fallback;
  await sendEmail(payload).catch(() => {
    console.warn(`[EMAIL] Verification link delivery failed for ${email}`);
  });
}

async function sendAccountActivatedNotificationEmail(email: string, preferredLanguage?: string): Promise<void> {
  const cfg = await getSystemSetting<Record<string, unknown>>("notif_email_notification", {
    subject: "",
    bodyHtml: "",
  });
  const minDeposit = await getNumberSetting("min_deposit_usd", 2);
  const subjectTpl = String(cfg?.subject || "").trim();
  const bodyTpl = String(cfg?.bodyHtml || "").trim();
  const fallback = buildAccountActivatedEmail(email, preferredLanguage);
  const payload = subjectTpl && bodyTpl
    ? {
      to: email,
      subject: renderTemplate(subjectTpl, { app_name: "Ecrossflow", min_deposit_usd: minDeposit }),
      html: renderTemplate(bodyTpl, {
        app_name: "Ecrossflow",
        min_deposit_usd: minDeposit,
        email,
      }),
    }
    : fallback;
  await sendEmail(payload).catch(() => {
    console.warn(`[EMAIL] Activation success email failed for ${email}`);
  });
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

  const { accessToken, referralCode, phone, preferredLanguage } = req.body as {
    accessToken?: string;
    referralCode?: string;
    phone?: string;
    preferredLanguage?: string;
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

    if (user.status === "PENDING") {
      await sendEmailVerificationLink(user.id, user.role, user.email, user.preferredLanguage);
      res.status(403).json({
        error: "Forbidden",
        code: "EMAIL_NOT_VERIFIED",
        email: user.email,
        message: "Email not verified. A confirmation link has been sent.",
      });
      return;
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
      message: "Votre compte a été créé via Google. Bienvenue dans la communauté !",
      category: "system",
      read: false,
    });

    return createdUser;
  });

  await sendEmailVerificationLink(newUser.id, newUser.role, newUser.email, newUser.preferredLanguage);
  res.status(201).json({
    code: "EMAIL_NOT_VERIFIED",
    email: newUser.email,
    message: "Compte créé. Un lien de confirmation a été envoyé sur votre email Google.",
  });
});

router.get("/auth/confirm-email", async (req, res) => {
  const token = String(req.query?.token || "");
  const defaultLocale = (process.env.DEFAULT_LOCALE || "fr").toLowerCase();
  const baseUrl = getPublicAppUrl();
  const loginUrl = `${baseUrl}/${defaultLocale}/auth/login`;

  if (!token) {
    res.redirect(`${loginUrl}?verified=missing_token`);
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId?: string };
    const userId = decoded?.userId;
    if (!userId) {
      res.redirect(`${loginUrl}?verified=invalid_token`);
      return;
    }

    const users = await db.select({
      id: usersTable.id,
      email: usersTable.email,
      preferredLanguage: usersTable.preferredLanguage,
    })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!users.length) {
      res.redirect(`${loginUrl}?verified=user_not_found`);
      return;
    }
    const user = users[0];
    const userLocale = (user.preferredLanguage || defaultLocale).toLowerCase();
    const userLoginUrl = `${baseUrl}/${userLocale}/auth/login`;

    const now = new Date();
    await db.update(usersTable)
      .set({ status: "ACTIVE", activatedAt: now })
      .where(eq(usersTable.id, userId));

    await sendAccountActivatedNotificationEmail(user.email, user.preferredLanguage);

    res.redirect(`${userLoginUrl}?verified=success`);
  } catch {
    res.redirect(`${loginUrl}?verified=invalid_or_expired`);
  }
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

router.get("/auth/otp-delivery-options", requireAuth as never, async (req, res) => {
  const authReq = req as AuthRequest;
  if (!authReq.userId) {
    res.status(401).json({ error: "Unauthorized", message: "Not authenticated" });
    return;
  }

  const rows = await db.select({ phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.id, authReq.userId))
    .limit(1);

  if (!rows.length) {
    res.status(404).json({ error: "Not Found", message: "User not found" });
    return;
  }

  const phone = normalizeE164Phone(rows[0].phone);
  const twilioReady = isTwilioConfigured();
  const smsEnabled = await getBooleanSetting("enable_sms_otp", true);
  const whatsappEnabled = await getBooleanSetting("enable_whatsapp_otp", false);
  const smsAvailable = smsEnabled && twilioReady && Boolean(phone);
  res.json({
    methods: {
      email: { available: true },
      sms: { available: smsAvailable },
      whatsapp: { available: whatsappEnabled && smsAvailable },
    },
    phonePresent: Boolean(phone),
  });
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
  const smsEnabled = await getBooleanSetting("enable_sms_otp", true);
  const whatsappEnabled = await getBooleanSetting("enable_whatsapp_otp", false);
  if (method === "whatsapp" && !whatsappEnabled) {
    res.status(400).json({ error: "Bad Request", message: "WhatsApp OTP is currently disabled" });
    return;
  }
  if (method === "sms" && !smsEnabled) {
    res.status(400).json({ error: "Bad Request", message: "SMS OTP is currently disabled" });
    return;
  }
  const otp = generateOtp();
  await saveOtpCode(authReq.userId, otp);
  const otpValidityMinutes = 10;
  const smsCfg = await getSystemSetting<Record<string, unknown>>("notif_sms_otp", {
    body: "Votre code {{otp}}. Valable {{minutes}} minutes.",
  });
  const emailOtpCfg = await getSystemSetting<Record<string, unknown>>("notif_email_otp", {
    subject: "",
    bodyHtml: "",
  });
  const smsBody = renderTemplate(String(smsCfg?.body || "Votre code {{otp}}. Valable {{minutes}} minutes."), {
    otp,
    minutes: otpValidityMinutes,
    app_name: "Ecrossflow",
  });
  const emailSubjectTpl = String(emailOtpCfg?.subject || "").trim();
  const emailBodyTpl = String(emailOtpCfg?.bodyHtml || "").trim();
  const defaultOtpEmail = buildOtpEmail(otp, email);
  const otpEmailPayload = emailSubjectTpl && emailBodyTpl
    ? {
      to: email,
      subject: renderTemplate(emailSubjectTpl, { otp, minutes: otpValidityMinutes, app_name: "Ecrossflow" }),
      html: renderTemplate(emailBodyTpl, { otp, minutes: otpValidityMinutes, app_name: "Ecrossflow", email }),
    }
    : defaultOtpEmail;

  if (method === "sms") {
    const hasTwilio = isTwilioConfigured();
    if (hasTwilio) {
      try {
        const accountSid = process.env.TWILIO_ACCOUNT_SID!;
        const authToken = process.env.TWILIO_AUTH_TOKEN!;
        const fromPhone = normalizeE164Phone(process.env.TWILIO_PHONE!);
        const toPhone = normalizeE164Phone(phone);
        if (toPhone) {
          const twilioTo = toPhone;
          const twilioFrom = fromPhone;
          const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
            method: "POST",
            headers: {
              Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ To: twilioTo, From: twilioFrom, Body: smsBody }).toString(),
          });
          if (!resp.ok) {
            const raw = await resp.text();
            throw new Error(`Twilio error ${resp.status}: ${raw.slice(0, 300)}`);
          }
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
  await sendEmail(otpEmailPayload).catch(() => {
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

  const users = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    preferredLanguage: usersTable.preferredLanguage,
  })
    .from(usersTable)
    .where(eq(usersTable.id, authReq.userId))
    .limit(1);

  if (!users.length) {
    res.status(404).json({ error: "Not Found", message: "User not found" });
    return;
  }

  const { email } = users[0];
  const otp = generateOtp();
  const otpValidityMinutes = 10;
  const emailOtpCfg = await getSystemSetting<Record<string, unknown>>("notif_email_otp", {
    subject: "",
    bodyHtml: "",
  });
  const emailSubjectTpl = String(emailOtpCfg?.subject || "").trim();
  const emailBodyTpl = String(emailOtpCfg?.bodyHtml || "").trim();
  const defaultOtpEmail = buildOtpEmail(otp, email);
  const otpEmailPayload = emailSubjectTpl && emailBodyTpl
    ? {
      to: email,
      subject: renderTemplate(emailSubjectTpl, { otp, minutes: otpValidityMinutes, app_name: "Ecrossflow" }),
      html: renderTemplate(emailBodyTpl, { otp, minutes: otpValidityMinutes, app_name: "Ecrossflow", email }),
    }
    : defaultOtpEmail;
  await saveOtpCode(authReq.userId, otp);

  await sendEmail(otpEmailPayload).catch(() => {
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

  await sendAccountActivatedNotificationEmail(users[0].email, users[0].preferredLanguage);

  res.json({ message: "Email verified successfully" });
});

export default router;
