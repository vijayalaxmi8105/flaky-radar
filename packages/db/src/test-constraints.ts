import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== Constraint verification ===\n");

  // 1. Set up one valid repo + run + test to violate against
  const repo = await prisma.repository.create({
    data: {
      githubId: 999001n,
      owner: "test-owner",
      name: "test-repo",
      fullName: "test-owner/test-repo",
    },
  });
  console.log("✅ Created base repository:", repo.id);

  const run = await prisma.ciRun.create({
    data: {
      repositoryId: repo.id,
      githubRunId: 555001n,
      workflowName: "CI",
      branch: "main",
      commitSha: "abc123",
      event: "push",
      status: "completed",
    },
  });
  console.log("✅ Created base ci_run:", run.id);

  const test = await prisma.test.create({
    data: {
      repositoryId: repo.id,
      suiteName: "unit",
      testName: "adds numbers correctly",
    },
  });
  console.log("✅ Created base test:", test.id, "\n");

  // 2. Try to violate unique (repositoryId, githubRunId) on ci_runs
  try {
    await prisma.ciRun.create({
      data: {
        repositoryId: repo.id,
        githubRunId: 555001n, // duplicate on purpose
        workflowName: "CI",
        branch: "main",
        commitSha: "def456",
        event: "push",
        status: "completed",
      },
    });
    console.log("❌ FAILED: duplicate githubRunId was allowed!");
  } catch (e: any) {
    console.log("✅ PASS: duplicate (repositoryId, githubRunId) rejected —", e.code);
  }

  // 3. Try to violate unique (repositoryId, suiteName, testName) on tests
  try {
    await prisma.test.create({
      data: {
        repositoryId: repo.id,
        suiteName: "unit",
        testName: "adds numbers correctly", // duplicate on purpose
      },
    });
    console.log("❌ FAILED: duplicate test identity was allowed!");
  } catch (e: any) {
    console.log("✅ PASS: duplicate (repositoryId, suiteName, testName) rejected —", e.code);
  }

  // 4. Try to violate unique githubDeliveryId on webhook_deliveries
  await prisma.webhookDelivery.create({
    data: {
      githubDeliveryId: "delivery-abc-1",
      eventType: "workflow_run",
      payload: { fake: true },
    },
  });
  try {
    await prisma.webhookDelivery.create({
      data: {
        githubDeliveryId: "delivery-abc-1", // duplicate on purpose
        eventType: "workflow_run",
        payload: { fake: true },
      },
    });
    console.log("❌ FAILED: duplicate githubDeliveryId was allowed!");
  } catch (e: any) {
    console.log("✅ PASS: duplicate githubDeliveryId rejected —", e.code);
  }

  // 5. Try to violate FK — create a test_execution pointing at a nonexistent test
  try {
    await prisma.testExecution.create({
      data: {
        testId: "00000000-0000-0000-0000-000000000000", // doesn't exist
        ciRunId: run.id,
        status: "pass",
      },
    });
    console.log("❌ FAILED: FK to nonexistent test was allowed!");
  } catch (e: any) {
    console.log("✅ PASS: FK violation on testId rejected —", e.code);
  }

  // 6. Try to violate unique email on users
  await prisma.user.create({
    data: { email: "dev@example.com", role: "admin" },
  });
  try {
    await prisma.user.create({
      data: { email: "dev@example.com", role: "member" }, // duplicate on purpose
    });
    console.log("❌ FAILED: duplicate email was allowed!");
  } catch (e: any) {
    console.log("✅ PASS: duplicate email rejected —", e.code);
  }

  console.log("\n=== Cleaning up test data ===");
  await prisma.testExecution.deleteMany({});
  await prisma.flakyScore.deleteMany({});
  await prisma.test.deleteMany({ where: { repositoryId: repo.id } });
  await prisma.ciRun.deleteMany({ where: { repositoryId: repo.id } });
  await prisma.webhookDelivery.deleteMany({ where: { githubDeliveryId: "delivery-abc-1" } });
  await prisma.user.deleteMany({ where: { email: "dev@example.com" } });
  await prisma.repository.deleteMany({ where: { id: repo.id } });
  console.log("✅ Cleanup complete");
}

main()
  .catch((e) => console.error("Unexpected error:", e))
  .finally(() => prisma.$disconnect());