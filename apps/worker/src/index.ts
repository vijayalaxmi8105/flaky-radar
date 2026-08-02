import { Worker, Job } from "bullmq";
import {
  queueConnection,
  CI_EVENTS_QUEUE_NAME,
  ciEventsDlq,
  type CiEventJobData,
} from "@flaky-radar/queue";
import { prisma } from "@flaky-radar/db";
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

  const delivery = await prisma.webhookDelivery.findUniqueOrThrow({
    where: { id: job.data.webhookDeliveryId },
  });

  const payload = delivery.payload as any;
  const runData = payload.workflow_run;
  const repoFullName = payload.repository?.full_name;

  if (!runData || !repoFullName) {
    throw new Error(
      `Malformed workflow_run payload: missing workflow_run or repository.full_name (deliveryId=${delivery.id})`
    );
  }

  const repository = await prisma.repository.findUnique({
    where: { fullName: repoFullName },
  });

  if (!repository) {
    throw new Error(
      `Unknown repository "${repoFullName}" — not registered in the system (deliveryId=${delivery.id})`
    );
  }

  const startedAt = runData.run_started_at ? new Date(runData.run_started_at) : null;
  const completedAt = runData.updated_at ? new Date(runData.updated_at) : null;
  const durationMs =
    startedAt && completedAt && runData.status === "completed"
      ? completedAt.getTime() - startedAt.getTime()
      : null;

  const ciRun = await prisma.ciRun.upsert({
    where: {
      repositoryId_githubRunId: {
        repositoryId: repository.id,
        githubRunId: BigInt(runData.id),
      },
    },
    update: {
      workflowName: runData.name,
      branch: runData.head_branch,
      commitSha: runData.head_sha,
      actor: runData.actor?.login ?? null,
      event: runData.event,
      status: runData.status,
      conclusion: runData.conclusion,
      attempt: runData.run_attempt ?? 1,
      startedAt,
      completedAt,
      durationMs,
    },
    create: {
      repositoryId: repository.id,
      githubRunId: BigInt(runData.id),
      workflowName: runData.name,
      branch: runData.head_branch,
      commitSha: runData.head_sha,
      actor: runData.actor?.login ?? null,
      event: runData.event,
      status: runData.status,
      conclusion: runData.conclusion,
      attempt: runData.run_attempt ?? 1,
      startedAt,
      completedAt,
      durationMs,
    },
  });

  logger.info(
    { jobId: job.id, ciRunId: ciRun.id, githubRunId: ciRun.githubRunId.toString() },
    "ci_runs upserted"
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

worker.on("failed", async (job, err) => {
  const attemptsMade = job?.attemptsMade ?? 0;
  const maxAttempts = job?.opts.attempts ?? 0;
  const willRetry = attemptsMade < maxAttempts;

  logger.error(
    {
      jobId: job?.id,
      attemptsMade,
      maxAttempts,
      willRetry,
      error: err.message,
    },
    "worker: job failed"
  );

  if (!willRetry && job) {
    try {
      await ciEventsDlq.add("dead-letter", {
        originalJobId: job.id ?? "unknown",
        originalQueue: CI_EVENTS_QUEUE_NAME,
        data: job.data,
        failedReason: err.message,
        attemptsMade,
        failedAt: new Date().toISOString(),
      });
      logger.warn(
        { jobId: job.id },
        "worker: job permanently failed, moved to DLQ"
      );
    } catch (dlqErr) {
      logger.error(
        { jobId: job.id, error: (dlqErr as Error).message },
        "worker: FAILED TO WRITE TO DLQ — job data may be lost"
      );
    }
  }
});

worker.on("error", (err) => {
  logger.error({ error: err.message }, "worker: unexpected error");
});

logger.info({ queue: CI_EVENTS_QUEUE_NAME }, "worker: listening for jobs");

process.on("SIGTERM", async () => {
  logger.info("worker: SIGTERM received, closing gracefully");
  await worker.close();
  await ciEventsDlq.close();
  process.exit(0);
});