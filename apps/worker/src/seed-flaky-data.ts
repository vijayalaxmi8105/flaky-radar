import "dotenv/config";
import { prisma } from "@flaky-radar/db";
import { upsertJunitResults } from "./junit/upsertTestExecutions.js";
import type { ParsedTestCase } from "./junit/parseJunit.js";

const REPO_FULL_NAME = "test-owner/seed-repo";
const BRANCH = "main";

// Pattern: alternates pass/fail frequently -> should classify FLAKY
const FLAKY_PATTERN: ParsedTestCase["status"][] = [
  "passed", "failed", "passed", "failed", "passed",
  "failed", "passed", "passed", "failed", "passed",
  "failed", "passed",
];

// Pattern: always passes -> should classify STABLE
const STABLE_PATTERN: ParsedTestCase["status"][] = new Array(12).fill("passed");

async function seedTest(
  repositoryId: string,
  suiteName: string,
  testName: string,
  pattern: ParsedTestCase["status"][]
) {
  const baseTime = Date.parse("2026-07-01T09:00:00Z");
  for (let i = 0; i < pattern.length; i++) {
    const githubRunId = BigInt(
      // deterministic, unique per test+index so reruns don't collide
      `9${Math.abs(hashCode(testName))}${i}`.slice(0, 15)
    );
    const startedAt = new Date(baseTime + i * 3600_000);
    const completedAt = new Date(startedAt.getTime() + 120_000);

    const ciRun = await prisma.ciRun.upsert({
      where: {
        repositoryId_githubRunId: { repositoryId, githubRunId },
      },
      update: {},
      create: {
        repositoryId,
        githubRunId,
        workflowName: "CI",
        branch: BRANCH,
        commitSha: `seed-${testName}-${i}`,
        actor: "seed-script",
        event: "push",
        status: "completed",
        conclusion: pattern[i] === "passed" ? "success" : "failure",
        attempt: 1,
        startedAt,
        completedAt,
      },
    });

    const testCases: ParsedTestCase[] = [
      {
        suiteName,
        testName,
        status: pattern[i],
        durationMs: 500,
        errorMessage: pattern[i] === "passed" ? null : "seeded failure",
        stackTrace: null,
      },
    ];

    await upsertJunitResults({
      repositoryId,
      ciRunId: ciRun.id,
      executedAt: completedAt,
      testCases,
    });
  }
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

async function main() {
  const repo = await prisma.repository.upsert({
    where: { fullName: REPO_FULL_NAME },
    update: {},
    create: {
      githubId: 999555n,
      owner: "test-owner",
      name: "seed-repo",
      fullName: REPO_FULL_NAME,
    },
  });
  console.log("Repository:", repo.id);

  await seedTest(repo.id, "IntegrationSuite", "flaky_login_test", FLAKY_PATTERN);
  console.log("Seeded flaky_login_test:", FLAKY_PATTERN.length, "executions");

  await seedTest(repo.id, "IntegrationSuite", "stable_health_check", STABLE_PATTERN);
  console.log("Seeded stable_health_check:", STABLE_PATTERN.length, "executions");

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());