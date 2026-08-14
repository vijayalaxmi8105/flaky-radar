import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { attachLiveUpdates } from "./ws/liveUpdates.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { healthRouter } from "./routes/health.js";
import { queueStatsRouter } from "./routes/queueStats.js";
import { authRouter } from "./routes/auth.js";
import { runsRouter } from "./routes/runs.js";
import { searchRouter } from "./routes/search.js";
import { repositoriesRouter } from "./routes/repositories.js";
// import { webhookRouter } from "./webhooks/github.js";
import { logger } from "./logger.js";

const app = express();

const allowedOriginPattern = /^http:\/\/localhost:\d+$/;

app.use(
  cors({
    origin: (origin, callback) => {
      // No origin (e.g. curl, server-to-server) — allow.
      if (!origin || allowedOriginPattern.test(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(requestLogger);
app.use(express.json());
app.use("/api", rateLimit);
// app.use("/webhooks", webhookRouter);
app.use(healthRouter);
app.use("/api", queueStatsRouter);
app.use("/api/auth", authRouter);
app.use("/api", runsRouter);
app.use("/api", repositoriesRouter);
app.use("/api", searchRouter);

const httpServer = createServer(app);

if (process.env.NODE_ENV !== "test") {
  attachLiveUpdates(httpServer);
}

const PORT = Number(process.env.PORT ?? 3000);
if (process.env.NODE_ENV !== "test") {
  httpServer.listen(PORT, () => {
    logger.info({ port: PORT }, "api server listening");
  });
}

export { app, httpServer };