/**
 * scripts/recompute-flaky-scores.ts
 *
 * Manual, one-off recompute of the `flaky_scores` cache table.
 *
 * This is a stand-in for the not-yet-built BullMQ repeatable scheduled job
 * (originally planned as Day 19). It exists so that `GET /api/repositories`
 * (list) and other endpoints can read `reliabilityScore` from cached data
 * instead of live-recomputing per request, per Section 11's "expensive work
 * must not happen inline" principle.
 *
 * Scope for this run:
 *   - Iterates every Test in the DB.
 *   - Skips (does not write a row for) any test with zero executions on its
 *     repository's default_branch, consistent with the topFlakyTests
 *     exclusion rule from the repository-detail endpoint (Day 23).
 *   - Uses a fixed 30-day rolling window (WINDOW_DAYS) for all tests.
 *   - Writes classification lowercase (stable | flaky | broken |
 *     insufficient_data) to match the FlakyScore.classification column's
 *     documented contract, even though classify() returns uppercase.
 *
 * Run with:
 *   pnpm exec ts-node scripts/recompute-flaky-scores.ts
 *   (or: npx tsx scripts/recompute-flaky-scores.ts, depending on project setup)
 *
 * NOT a BullMQ job. No scheduling, no retries, no queue involvement.
 * That's intentionally a separate, later slice.
 */

import { prisma } from "@flaky-radar/db";
import {
  failureRate,
  alternationRate,
  classify,
  type TestExecution,
} from "@flaky-radar/analytics";

const WINDOW_DAYS = 30;

function toLowerClassification(classification: string): string {
  return classification.toLowerCase();
}

async function recomputeForTest(test: {
  id: string;
  repositoryId: string;
}): Promise<"written" | "skipped"> {
  const repository = await prisma.repository.findUniqueOrThrow({
    where: { id: test.repositoryId },
    select: { defaultBranch: true },
  });

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - WINDOW_DAYS);

  const executions = await prisma.testExecution.findMany({
    where: {
      testId: test.id,
      executedAt: { gte: windowStart },
      ciRun: { branch: repository.defaultBranch },
    },
    orderBy: { executedAt: "asc" },
    select: { status: true },
  });

  if (executions.length === 0) {
    return "skipped";
  }

  const typedExecutions: TestExecution[] = executions.map((e) => ({
    status: e.status as TestExecution["status"],
  }));

  const failureRateResult = failureRate(typedExecutions);
  const alternationRateResult = alternationRate(typedExecutions);

  const { classification, confidence_score: confidenceScore } = classify({
    failure_rate: failureRateResult.failureRate,
    alternation_rate: alternationRateResult.alternationRate,
    total_executions: failureRateResult.totalExecutions,
  });

  await prisma.flakyScore.create({
    data: {
      testId: test.id,
      windowDays: WINDOW_DAYS,
      passRate: 1 - failureRateResult.failureRate,
      failureRate: failureRateResult.failureRate,
      totalExecutions: failureRateResult.totalExecutions,
      classification: toLowerClassification(classification),
      confidenceScore,
    },
  });

  return "written";
}

async function main() {
  const tests = await prisma.test.findMany({
    select: { id: true, repositoryId: true },
  });

  let written = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`Recomputing flaky_scores for ${tests.length} tests (window=${WINDOW_DAYS}d)...`);

  for (const test of tests) {
    try {
      const result = await recomputeForTest(test);
      if (result === "written") written++;
      else skipped++;
    } catch (err) {
      failed++;
      console.error(`Failed to recompute test ${test.id}:`, err);
    }
  }

  console.log(`Done. written=${written} skipped=${skipped} failed=${failed}`);
}

main()
  .catch((err) => {
    console.error("Fatal error in recompute-flaky-scores:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });