/**
 * scripts/seed-flaky-demo-data.ts
 *
 * Purpose-built demo data, separate from seed.ts (which is a minimal
 * smoke-test fixture). This script creates enough realistic execution
 * volume to actually exercise classify()'s STABLE / FLAKY / BROKEN paths
 * (MIN_SAMPLE = 10), which the current DB data can't do (max 6 executions
 * per test -> everything classifies as insufficient_data).
 *
 * Reuses the existing "acme/checkout-service" repo from seed.ts.
 * Creates 3 new tests, each with 20 executions on the repo's default_branch
 * ("main"), one CiRun per execution, spread over the last ~20 days:
 *
 *   - "stable checkout total calculation"      -> all pass
 *   - "flaky payment gateway timeout handling" -> irregular pass/fail alternation
 *   - "broken legacy tax calculator"           -> ~95%+ fail
 *
 * Safe to re-run: uses upsert for the repo (already idempotent in seed.ts)
 * and creates fresh Test/CiRun/TestExecution rows each run under new
 * suiteName/testName identity, so re-running just adds another batch.
 * Not idempotent by design -- this is disposable demo data, not a fixture
 * meant to be run exactly once.
 *
 * Run with:
 *   npx tsx scripts/seed-flaky-demo-data.ts
 */

import "dotenv/config";
import { PrismaClient } from "../packages/db/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const EXECUTIONS_PER_TEST = 20;
const SPREAD_DAYS = 20;

type Pattern = "stable" | "flaky" | "broken";

function statusForIndex(pattern: Pattern, index: number): "pass" | "fail" {
  switch (pattern) {
    case "stable":
      return "pass";
    case "broken":
      return index === 0 ? "pass" : "fail";
    case "flaky":
      return [0, 3, 4, 7, 8, 9, 13, 16, 19].includes(index) ? "pass" : "fail";
  }
}

async function seedTest(
  repositoryId: string,
  suiteName: string,
  testName: string,
  pattern: Pattern
) {
  const test = await prisma.test.upsert({
    where: {
      repositoryId_suiteName_testName: {
        repositoryId,
        suiteName,
        testName,
      },
    },
    update: {},
    create: { repositoryId, suiteName, testName },
  });

  for (let i = 0; i < EXECUTIONS_PER_TEST; i++) {
    const daysAgo = SPREAD_DAYS - (i / EXECUTIONS_PER_TEST) * SPREAD_DAYS;
    const executedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

    const run = await prisma.ciRun.create({
      data: {
        repositoryId,
        githubRunId: BigInt(Date.now()) * 1000n + BigInt(i) + BigInt(Math.floor(Math.random() * 1000)),
        workflowName: "CI",
        branch: "main",
        commitSha: `demo${pattern}${i}`,
        actor: "demo-seed",
        event: "push",
        status: "completed",
        conclusion: "success",
        startedAt: executedAt,
        completedAt: executedAt,
        durationMs: 60_000,
      },
    });

    const status = statusForIndex(pattern, i);

    await prisma.testExecution.create({
      data: {
        testId: test.id,
        ciRunId: run.id,
        status,
        durationMs: 300 + Math.floor(Math.random() * 200),
        executedAt,
      },
    });
  }

  console.log(`Seeded ${EXECUTIONS_PER_TEST} executions for "${testName}" (${pattern}) -> test ${test.id}`);
  return test.id;
}

async function main() {
  console.log("=== Seeding flaky-demo data ===\n");

  const repo = await prisma.repository.upsert({
    where: { fullName: "acme/checkout-service" },
    update: {},
    create: {
      githubId: 123456789n,
      owner: "acme",
      name: "checkout-service",
      fullName: "acme/checkout-service",
      defaultBranch: "main",
    },
  });
  console.log("Repository:", repo.fullName, `(${repo.id})\n`);

  await seedTest(repo.id, "checkout.spec.ts", "stable checkout total calculation", "stable");
  await seedTest(repo.id, "payment.spec.ts", "flaky payment gateway timeout handling", "flaky");
  await seedTest(repo.id, "tax.spec.ts", "broken legacy tax calculator", "broken");

  console.log("\n=== Seed complete ===");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());