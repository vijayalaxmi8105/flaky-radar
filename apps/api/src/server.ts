import "dotenv/config";
import express from "express";
import { requestLogger } from "./middleware/requestLogger";
import { healthRouter } from "./routes/health";
import { queueStatsRouter } from "./routes/queueStats";
import { webhookRouter } from "./webhooks/github";
import { logger } from "./logger";

const app = express();

app.use(requestLogger);
app.use("/webhooks", webhookRouter);
app.use(express.json());
app.use(healthRouter);
app.use("/api", queueStatsRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info({ port: PORT }, "api server listening");
});