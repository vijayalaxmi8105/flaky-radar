import { Router } from "express";
import { ciEventsQueue, ciEventsDlq } from "@flaky-radar/queue";

export const queueStatsRouter = Router();

queueStatsRouter.get("/admin/queue-stats", async (_req, res) => {
  try {
    const [ciEventsCounts, dlqCounts] = await Promise.all([
      ciEventsQueue.getJobCounts(
        "waiting",
        "active",
        "completed",
        "failed",
        "delayed"
      ),
      ciEventsDlq.getJobCounts("waiting"),
    ]);

    res.json({
      ciEvents: {
        waiting: ciEventsCounts.waiting ?? 0,
        active: ciEventsCounts.active ?? 0,
        completed: ciEventsCounts.completed ?? 0,
        failed: ciEventsCounts.failed ?? 0,
        delayed: ciEventsCounts.delayed ?? 0,
      },
      dlq: {
        size: dlqCounts.waiting ?? 0,
      },
    });
  } catch (err) {
    res.status(500).json({
      error: "failed to fetch queue stats",
      message: (err as Error).message,
    });
  }
});