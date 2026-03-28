import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, referralsTable, bonusesTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { requireActiveAuth as requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { getSystemSetting } from "../services/system-config.js";

const router: IRouter = Router();

function renderTemplate(template: string, vars: Record<string, string>): string {
  let output = template;
  for (const [key, value] of Object.entries(vars)) {
    const pattern = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    output = output.replace(pattern, value);
  }
  return output;
}

router.get("/referrals", requireAuth as never, async (req: AuthRequest, res) => {
  const user = await db.select({ referralCode: usersTable.referralCode, username: usersTable.username })
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);

  if (!user.length) {
    res.status(404).json({ error: "Not Found" });
    return;
  }

  const code = user[0].referralCode;
  const APP_URL = process.env.APP_URL || "https://ecrossflow.com";
  const refCfg = await getSystemSetting<Record<string, unknown>>("notif_referral_link", {
    baseUrl: APP_URL,
    registerPath: "/auth/register",
    queryParam: "ref",
    whatsappTemplate: "Bonjour 👋 Rejoins {{app_name}} avec mon code {{referral_code}} et commence ici: {{referral_link}}",
    telegramTemplate: "🚀 Rejoins {{app_name}} | Code: {{referral_code}} | Lien: {{referral_link}}",
    genericTemplate: "Rejoins {{app_name}} avec mon code {{referral_code}}: {{referral_link}}",
  });
  const baseUrl = String(refCfg?.baseUrl || APP_URL).trim() || APP_URL;
  const registerPath = String(refCfg?.registerPath || "/auth/register").trim() || "/auth/register";
  const queryParam = String(refCfg?.queryParam || "ref").trim() || "ref";
  const whatsappTemplate = String(
    refCfg?.whatsappTemplate || "Bonjour 👋 Rejoins {{app_name}} avec mon code {{referral_code}} et commence ici: {{referral_link}}",
  ).trim();
  const telegramTemplate = String(
    refCfg?.telegramTemplate || "🚀 Rejoins {{app_name}} | Code: {{referral_code}} | Lien: {{referral_link}}",
  ).trim();
  const genericTemplate = String(
    refCfg?.genericTemplate || "Rejoins {{app_name}} avec mon code {{referral_code}}: {{referral_link}}",
  ).trim();

  let referralLink = `${APP_URL}/auth/register?ref=${code}`;
  try {
    const url = new URL(registerPath, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    url.searchParams.set(queryParam, code);
    referralLink = url.toString();
  } catch {
    referralLink = `${APP_URL}/auth/register?ref=${code}`;
  }
  const templateVars = {
    app_name: "Ecrossflow",
    username: user[0].username,
    referral_code: code,
    referral_link: referralLink,
  };
  const whatsappText = renderTemplate(whatsappTemplate, templateVars);
  const telegramText = renderTemplate(telegramTemplate, templateVars);
  const genericText = renderTemplate(genericTemplate, templateVars);
  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;
  const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(telegramText)}`;

  const referralsList = await db.select({
    id: referralsTable.id,
    referredId: referralsTable.referredId,
    bonusPaid: referralsTable.bonusPaid,
    createdAt: referralsTable.createdAt,
    username: usersTable.username,
    firstName: usersTable.firstName,
    status: usersTable.status,
  })
  .from(referralsTable)
  .innerJoin(usersTable, eq(referralsTable.referredId, usersTable.id))
  .where(eq(referralsTable.referrerId, req.userId!));

  const bonuses = await db.select({ amount: bonusesTable.amount })
    .from(bonusesTable)
    .where(and(eq(bonusesTable.userId, req.userId!), eq(bonusesTable.status, "PAID")));

  const totalBonusEarned = bonuses.reduce((sum, b) => sum + parseFloat(b.amount), 0);
  const activeReferrals = referralsList.filter(r => r.status === "ACTIVE").length;

  res.json({
    referralCode: code,
    referralLink,
    shareMessages: {
      whatsapp: whatsappText,
      telegram: telegramText,
      generic: genericText,
    },
    shareLinks: {
      whatsapp: whatsappShareUrl,
      telegram: telegramShareUrl,
    },
    whatsappShareUrl,
    telegramShareUrl,
    totalReferrals: referralsList.length,
    activeReferrals,
    pendingReferrals: referralsList.filter(r => r.status === "PENDING").length,
    totalBonusEarned: parseFloat(totalBonusEarned.toFixed(2)),
    referrals: referralsList.map(r => ({
      id: r.id,
      username: r.username,
      firstName: r.firstName,
      status: r.status,
      joinedAt: r.createdAt,
      bonusPaid: r.bonusPaid,
    })),
  });
});

export default router;
