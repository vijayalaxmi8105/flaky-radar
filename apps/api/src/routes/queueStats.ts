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

queueStatsRouter.get("/admin/dlq", async (req, res) => {
  try {
    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit ?? "20"), 10) || 20, 1),
      100
    );

    const jobs = await ciEventsDlq.getJobs(["waiting"], 0, limit - 1);

    res.json({
      count: jobs.length,
      jobs: jobs.map((job) => ({
        dlqJobId: job.id,
        ...job.data,
      })),
    });
  } catch (err) {
    res.status(500).json({
      error: "failed to fetch DLQ contents",
      message: (err as Error).message,
    });
  }
});