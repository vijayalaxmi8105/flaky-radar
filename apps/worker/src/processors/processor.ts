import type { Job } from "bullmq";
import type { CiEventJobData } from "@flaky-radar/queue";
import { prisma } from "@flaky-radar/db";
import { logger } from "../logger.js";
import { fetchJunitXmlForRun } from "../junit/fetchJunitArtifact.js";
import { parseJunitXml } from "../junit/parseJunit.js";
import { upsertJunitResults } from "../junit/upsertTestExecutions.js";

export async function processCiEvent(job: Job<CiEventJobData>) {
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

  if (runData.status === "completed") {
    const [owner, repo] = repoFullName.split("/");
    try {
      const xml = await fetchJunitXmlForRun({
        owner,
        repo,
        githubRunId: ciRun.githubRunId,
      });

      if (xml) {
        const testCases = parseJunitXml(xml);
        const result = await upsertJunitResults({
          repositoryId: repository.id,
          ciRunId: ciRun.id,
          executedAt: completedAt ?? new Date(),
          testCases,
        });
        logger.info(
          { jobId: job.id, ciRunId: ciRun.id, ...result },
          "junit results upserted"
        );
      }
    } catch (err) {
      logger.error(
        { jobId: job.id, ciRunId: ciRun.id, err },
        "failed to fetch/parse junit artifact"
      );
    }
  }

  if ((job.data as any).forceFail) {
    logger.warn({ jobId: job.id, attemptNumber }, "intentionally throwing (test mode)");
    throw new Error(`Intentional failure for test (attempt ${attemptNumber})`);
  }

  logger.info({ jobId: job.id }, "ci-events job processed successfully");
}
