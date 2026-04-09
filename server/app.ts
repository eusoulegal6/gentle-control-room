import cors from "cors";
import express from "express";
import helmet from "helmet";

import { config } from "./config.js";
import { ApiError } from "./lib/errors.js";
import { errorHandler } from "./middleware/error-handler.js";
import { requireAuth } from "./middleware/auth.js";
import { adminAlertsRouter } from "./routes/admin-alerts.js";
import { adminAuthRouter } from "./routes/admin-auth.js";
import { adminUsersRouter } from "./routes/admin-users.js";
import { desktopAlertsRouter } from "./routes/desktop-alerts.js";
import { desktopAuthRouter } from "./routes/desktop-auth.js";
import { healthRouter } from "./routes/health.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: false,
    }),
  );
  app.use(express.json());

  app.use("/api", healthRouter);
  app.use("/api/admin/auth", adminAuthRouter);
  app.use("/api/admin/users", requireAuth("admin"), adminUsersRouter);
  app.use("/api/admin/alerts", requireAuth("admin"), adminAlertsRouter);
  app.use("/api/desktop/auth", desktopAuthRouter);
  app.use("/api/desktop/alerts", requireAuth("desktop"), desktopAlertsRouter);

  app.use((_req, _res, next) => {
    next(new ApiError(404, "Route not found."));
  });

  app.use(errorHandler);

  return app;
}
