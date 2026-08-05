import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== Seeding fake data ===\n");

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
  console.log("✅ Repository:", repo.fullName, `(${repo.id})`);

  const realRepo = await prisma.repository.upsert({
    where: { fullName: "vijayalaxmi8105/flaky-radar" },
    update: {},
    create: {
      githubId: 1311617597n,
      owner: "vijayalaxmi8105",
      name: "flaky-radar",
      fullName: "vijayalaxmi8105/flaky-radar",
      defaultBranch: "main",
    },
  });
  console.log("✅ Repository:", realRepo.fullName, `(${realRepo.id})`);

  const run = await prisma.ciRun.upsert({
    where: {
      repositoryId_githubRunId: {
        repositoryId: repo.id,
        githubRunId: 987654321n,
      },
    },
    update: {},
    create: {
      repositoryId: repo.id,
      githubRunId: 987654321n,
      workflowName: "CI",
      branch: "main",
      commitSha: "a1b2c3d4e5f6",
      actor: "octocat",
      event: "push",
      status: "completed",
      conclusion: "success",
      startedAt: new Date(Date.now() - 60_000),
      completedAt: new Date(),
      durationMs: 60_000,
    },
  });
  console.log("✅ CiRun:", run.githubRunId.toString(), `(${run.id})`);

  const test = await prisma.test.upsert({
    where: {
      repositoryId_suiteName_testName: {
        repositoryId: repo.id,
        suiteName: "checkout.spec.ts",
        testName: "should apply discount code at checkout",
      },
    },
    update: {},
    create: {
      repositoryId: repo.id,
      suiteName: "checkout.spec.ts",
      testName: "should apply discount code at checkout",
    },
  });
  console.log("✅ Test:", test.testName, `(${test.id})`);

  const execution = await prisma.testExecution.create({
    data: {
      testId: test.id,
      ciRunId: run.id,
      status: "pass",
      durationMs: 342,
      executedAt: new Date(),
    },
  });
  console.log("✅ TestExecution:", execution.id, `[${execution.status}]`);

  console.log("\n=== Seed complete ===");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());