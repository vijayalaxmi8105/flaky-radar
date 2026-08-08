
import "dotenv/config";
import express from "express";
import { requestLogger } from "./middleware/requestLogger.js";
import { healthRouter } from "./routes/health.js";
import { queueStatsRouter } from "./routes/queueStats.js";
import { authRouter } from "./routes/auth.js";
import { runsRouter } from "./routes/runs.js";
import { repositoriesRouter } from "./routes/repositories.js";
// import { webhookRouter } from "./webhooks/github.js";
import { logger } from "./logger.js";

const app = express();

app.use(requestLogger);
app.use(express.json());
// app.use("/webhooks", webhookRouter);
app.use(healthRouter);
app.use("/api", queueStatsRouter);
app.use("/api/auth", authRouter);
app.use("/api", runsRouter);
app.use("/api", repositoriesRouter);

const PORT = Number(process.env.PORT ?? 3000);
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    logger.info({ port: PORT }, "api server listening");
  });
}

export { app };