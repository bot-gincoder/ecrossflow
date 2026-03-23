import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, referralsTable, bonusesTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { requireActiveAuth as requireAuth, type AuthRequest } from "../middlewares/auth.js";

const router: IRouter = Router();

router.get("/referrals", requireAuth as never, async (req: AuthRequest, res) => {
  const user = await db.select({ referralCode: usersTable.referralCode })
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);

  if (!user.length) {
    res.status(404).json({ error: "Not Found" });
    return;
  }

  const code = user[0].referralCode;
  const APP_URL = process.env.APP_URL || "https://ecrossflow.com";
  const referralLink = `${APP_URL}/auth/register?ref=${code}`;

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
