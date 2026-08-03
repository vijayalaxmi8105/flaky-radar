import { prisma } from "@flaky-radar/db";
import { ParsedTestCase, TestExecutionStatus } from "./parseJunit";

// Schema stores short-form statuses: pass | fail | skip | error
const STATUS_MAP: Record<TestExecutionStatus, string> = {
  passed: "pass",
  failed: "fail",
  skipped: "skip",
  error: "error",
};

export interface UpsertJunitResultsParams {
  repositoryId: string;
  ciRunId: string;
  executedAt: Date;
  testCases: ParsedTestCase[];
}

export interface UpsertJunitResultsResult {
  testsUpserted: number;
  executionsCreated: number;
  skipped: boolean;
}

export async function upsertJunitResults(
  params: UpsertJunitResultsParams
): Promise<UpsertJunitResultsResult> {
  const { repositoryId, ciRunId, executedAt, testCases } = params;

  // Idempotency guard: don't reprocess an artifact we've already parsed
  // for this run (e.g. worker retry, webhook redelivery).
  const run = await prisma.ciRun.findUnique({
    where: { id: ciRunId },
    select: { artifactProcessedAt: true },
  });

  if (!run) {
    throw new Error(`CiRun ${ciRunId} not found — cannot upsert test executions`);
  }

  if (run.artifactProcessedAt) {
    return { testsUpserted: 0, executionsCreated: 0, skipped: true };
  }

  let testsUpserted = 0;
  let executionsCreated = 0;

  for (const tc of testCases) {
    const test = await prisma.test.upsert({
      where: {
        repositoryId_suiteName_testName: {
          repositoryId,
          suiteName: tc.suiteName,
          testName: tc.testName,
        },
      },
      create: {
        repositoryId,
        suiteName: tc.suiteName,
        testName: tc.testName,
        firstSeenAt: executedAt,
        lastSeenAt: executedAt,
      },
      update: {
        lastSeenAt: executedAt,
      },
    });
    testsUpserted++;

    await prisma.testExecution.create({
      data: {
        testId: test.id,
        ciRunId,
        status: STATUS_MAP[tc.status],
        durationMs: tc.durationMs,
        errorMessage: tc.errorMessage,
        stackTrace: tc.stackTrace,
        executedAt,
      },
    });
    executionsCreated++;
  }

  // Mark this run's artifact as processed so retries/redeliveries no-op.
  await prisma.ciRun.update({
    where: { id: ciRunId },
    data: { artifactProcessedAt: new Date() },
  });

  return { testsUpserted, executionsCreated, skipped: false };
}