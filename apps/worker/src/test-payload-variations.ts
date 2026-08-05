import "dotenv/config";
import { prisma } from "@flaky-radar/db";
import { processCiEvent } from "./processors/processor.js";
import type { Job } from "bullmq";
import type { CiEventJobData } from "@flaky-radar/queue";

const REPO_FULL_NAME = "test-owner/variation-repo";

// Variation 1: triggered by a direct push to main
const PUSH_PAYLOAD = {
  action: "completed",
  workflow_run: {
    id: 888001,
    name: "CI",
    head_branch: "main",
    head_sha: "push111aaa",
    run_attempt: 1,
    event: "push",
    status: "completed",
    conclusion: "success",
    run_started_at: "2026-08-01T09:00:00Z",
    updated_at: "2026-08-01T09:04:30Z",
    actor: { login: "alice" },
  },
  repository: { full_name: REPO_FULL_NAME },
};

// Variation 2: triggered by a pull_request, different actor, failed conclusion
const PR_PAYLOAD = {
  action: "completed",
  workflow_run: {
    id: 888002,
    name: "CI",
    head_branch: "feature/add-login",
    head_sha: "pr222bbb",
    run_attempt: 2,
    event: "pull_request",
    status: "completed",
    conclusion: "failure",
    run_started_at: "2026-08-01T09:10:00Z",
    updated_at: "2026-08-01T09:13:15Z",
    actor: { login: "bob" },
  },
  repository: { full_name: REPO_FULL_NAME },
};

function fakeJob(webhookDeliveryId: string): Job<CiEventJobData> {
  return {
    id: "fake-job-" + Date.now() + "-" + Math.random().toString(36).slice(2),
    data: { webhookDeliveryId } as CiEventJobData,
    attemptsMade: 0,
    opts: { attempts: 5 },
  } as unknown as Job<CiEventJobData>;
}

async function processPayload(label: string, payload: any) {
  const delivery = await prisma.webhookDelivery.create({
    data: {
      githubDeliveryId: `variation-test-${payload.workflow_run.id}`,
      eventType: "workflow_run",
      payload,
    },
  });
  await processCiEvent(fakeJob(delivery.id));

  const row = await prisma.ciRun.findUniqueOrThrow({
    where: {
      repositoryId_githubRunId: {
        repositoryId: (await prisma.repository.findUniqueOrThrow({
          where: { fullName: REPO_FULL_NAME },
        })).id,
        githubRunId: BigInt(payload.workflow_run.id),
      },
    },
  });

  console.log(`\n--- ${label} ---`);
  const expected = payload.workflow_run;
  const checks: [string, boolean][] = [
    ["branch", row.branch === expected.head_branch],
    ["commitSha", row.commitSha === expected.head_sha],
    ["actor", row.actor === expected.actor.login],
    ["event", row.event === expected.event],
    ["status", row.status === expected.status],
    ["conclusion", row.conclusion === expected.conclusion],
    ["attempt", row.attempt === expected.run_attempt],
  ];
  let allPass = true;
  for (const [field, pass] of checks) {
    console.log(`  ${pass ? "✅" : "❌"} ${field}: ${(row as any)[field]}`);
    if (!pass) allPass = false;
  }
  return allPass;
}

async function main() {
  console.log("=== Payload variation test: push vs pull_request ===");

  const repo = await prisma.repository.create({
    data: {
      githubId: 999003n,
      owner: "test-owner",
      name: "variation-repo",
      fullName: REPO_FULL_NAME,
    },
  });
  console.log("✅ Created repository:", repo.id);

  const pushOk = await processPayload("push payload", PUSH_PAYLOAD);
  const prOk = await processPayload("pull_request payload", PR_PAYLOAD);

  console.log("\n--- Summary ---");
  console.log(pushOk && prOk ? "✅ PASS: both payload variations mapped correctly" : "❌ FAILED: field mismatch detected above");

  // Cleanup
  await prisma.ciRun.deleteMany({ where: { repositoryId: repo.id } });
  await prisma.webhookDelivery.deleteMany({
    where: { githubDeliveryId: { in: [`variation-test-888001`, `variation-test-888002`] } },
  });
  await prisma.repository.deleteMany({ where: { id: repo.id } });
  console.log("✅ Cleanup complete");
}

main()
  .catch((e) => {
    console.error("Unexpected error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());