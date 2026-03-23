import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { notificationsTable, notificationCategoryEnum } from "@workspace/db";
import { eq, and, desc, count, type SQL } from "drizzle-orm";
import { requireActiveAuth as requireAuth, type AuthRequest } from "../middlewares/auth.js";

const router: IRouter = Router();

const VALID_CATEGORIES = notificationCategoryEnum.enumValues;

router.get("/notifications", requireAuth as never, async (req: AuthRequest, res) => {
  const { page = "1", filter = "all" } = req.query as { page: string; filter: string };
  const pageNum = parseInt(page);
  const limitNum = 20;
  const offset = (pageNum - 1) * limitNum;

  const conditions: SQL[] = [eq(notificationsTable.userId, req.userId!)];
  if (filter === "unread") {
    conditions.push(eq(notificationsTable.read, false));
  } else if ((VALID_CATEGORIES as readonly string[]).includes(filter)) {
    conditions.push(eq(notificationsTable.category, filter as typeof VALID_CATEGORIES[number]));
  }

  const [totalResult] = await db.select({ count: count() })
    .from(notificationsTable)
    .where(and(...conditions));

  const total = Number(totalResult.count);

  const notifications = await db.select()
    .from(notificationsTable)
    .where(and(...conditions))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(limitNum)
    .offset(offset);

  const [unreadResult] = await db.select({ count: count() })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, req.userId!), eq(notificationsTable.read, false)));

  res.json({
    notifications: notifications.map(n => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      read: n.read,
      category: n.category,
      actionUrl: n.actionUrl,
      createdAt: n.createdAt,
    })),
    total,
    unreadCount: Number(unreadResult.count),
  });
});

router.get("/notifications/unread-count", requireAuth as never, async (req: AuthRequest, res) => {
  const [result] = await db.select({ count: count() })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, req.userId!), eq(notificationsTable.read, false)));
  res.json({ count: Number(result.count) });
});

router.put("/notifications/:id/read", requireAuth as never, async (req: AuthRequest, res) => {
  const id = String(req.params.id);
  await db.update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, req.userId!)));
  res.json({ message: "Notification marked as read" });
});

router.put("/notifications/read-all", requireAuth as never, async (req: AuthRequest, res) => {
  await db.update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.userId, req.userId!), eq(notificationsTable.read, false)));
  res.json({ message: "All notifications marked as read" });
});

export default router;
