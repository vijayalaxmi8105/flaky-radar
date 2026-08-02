import { Worker, Job } from "bullmq";
import {
  queueConnection,
  CI_EVENTS_QUEUE_NAME,
  type CiEventJobData,
} from "@flaky-radar/queue";
import { logger } from "./logger";

async function processCiEvent(job: Job<CiEventJobData>) {
  const attemptNumber = job.attemptsMade + 1;

  logger.info(
    {
      jobId: job.id,
      attemptNumber,
      maxAttempts: job.opts.attempts,
      data: job.data,
    },
    "ci-events job received"
  );

  if ((job.data as any).forceFail) {
    logger.warn({ jobId: job.id, attemptNumber }, "intentionally throwing (test mode)");
    throw new Error(`Intentional failure for test (attempt ${attemptNumber})`);
  }

  logger.info({ jobId: job.id }, "ci-events job processed successfully");
}

const worker = new Worker<CiEventJobData>(CI_EVENTS_QUEUE_NAME, processCiEvent, {
  connection: queueConnection,
  concurrency: 1,
});

worker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "worker: job completed");
});

worker.on("failed", (job, err) => {
  logger.error(
    {
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      maxAttempts: job?.opts.attempts,
      willRetry: (job?.attemptsMade ?? 0) < (job?.opts.attempts ?? 0),
      error: err.message,
    },
    "worker: job failed"
  );
});

worker.on("error", (err) => {
  logger.error({ error: err.message }, "worker: unexpected error");
});

logger.info({ queue: CI_EVENTS_QUEUE_NAME }, "worker: listening for jobs");

process.on("SIGTERM", async () => {
  logger.info("worker: SIGTERM received, closing gracefully");
  await worker.close();
  process.exit(0);
});