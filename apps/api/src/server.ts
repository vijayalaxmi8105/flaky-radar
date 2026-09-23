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
import { webhookRouter } from "./webhooks/github.js";
import { logger } from "./logger.js";
import { register, apiRequestDuration } from "./metrics.js";

const app = express();
const allowedOriginPattern = /^http:\/\/localhost:\d+$/;
const allowedOrigins = [
  "https://flaky-radar.onrender.com", // dashboard
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOriginPattern.test(origin) || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use(requestLogger);

app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    const route = req.route?.path ?? req.path;
    apiRequestDuration
      .labels(req.method, route, String(res.statusCode))
      .observe(durationSeconds);
  });
  next();
});

app.use("/webhooks", webhookRouter);

app.use(express.json());
app.use("/api", rateLimit);
app.use(healthRouter);
app.use("/api", queueStatsRouter);
app.use("/api/auth", authRouter);
app.use("/api", runsRouter);
app.use("/api", repositoriesRouter);
app.use("/api", searchRouter);

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

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