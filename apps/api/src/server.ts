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