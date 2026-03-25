import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import usersRouter from "./users.js";
import boardsRouter from "./boards.js";
import walletRouter from "./wallet.js";
import transactionsRouter from "./transactions.js";
import referralsRouter from "./referrals.js";
import notificationsRouter from "./notifications.js";
import adminRouter from "./admin.js";
import paymentsRouter from "./payments.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(boardsRouter);
router.use(walletRouter);
router.use(transactionsRouter);
router.use(referralsRouter);
router.use(notificationsRouter);
router.use(adminRouter);
router.use(paymentsRouter);

export default router;
