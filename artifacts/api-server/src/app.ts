import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { getBooleanSetting } from "./services/system-config.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));

app.use(async (req, res, next) => {
  if (!req.path.startsWith("/api/")) {
    next();
    return;
  }
  if (req.path.startsWith("/api/health") || req.path.startsWith("/api/admin")) {
    next();
    return;
  }
  const maintenance = await getBooleanSetting("maintenance_mode", false);
  if (!maintenance) {
    next();
    return;
  }
  res.status(503).json({
    error: "Service Unavailable",
    message: "Platform is temporarily in maintenance mode. Please try again shortly.",
  });
});

app.use("/api", router);

export default app;
