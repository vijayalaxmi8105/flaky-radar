import "dotenv/config";
import { prisma } from "@flaky-radar/db";
import { processCiEvent } from "./processors/processor";
import type { Job } from "bullmq";
import type { CiEventJobData } from "@flaky-radar/queue";

const SAMPLE_PAYLOAD = {
  action: "completed",
  workflow_run: {
    id: 777001,
    name: "CI",
    head_branch: "main",
    head_sha: "abc123def456",
    run_attempt: 1,
    event: "push",
    status: "completed",
    conclusion: "success",
    run_started_at: "2026-08-01T10:00:00Z",
    updated_at: "2026-08-01T10:05:00Z",
    actor: { login: "octocat" },
  },
  repository: { full_name: "test-owner/idempotency-repo" },
};

function fakeJob(webhookDeliveryId: string): Job<CiEventJobData> {
  return {
    id: "fake-job-" + Date.now(),
    data: { webhookDeliveryId } as CiEventJobData,
    attemptsMade: 0,
    opts: { attempts: 5 },
  } as unknown as Job<CiEventJobData>;
}

async function main() {
  console.log("=== Idempotency test: replay same delivery twice ===\n");

  // 1. Set up a fresh repository
  const repo = await prisma.repository.create({
    data: {
      githubId: 999002n,
      owner: "test-owner",
      name: "idempotency-repo",
      fullName: "test-owner/idempotency-repo",
    },
  });
  console.log("✅ Created repository:", repo.id);

  // 2. Create ONE webhook_deliveries row (simulating the first delivery)
  const delivery = await prisma.webhookDelivery.create({
    data: {
      githubDeliveryId: "idempotency-test-delivery-1",
      eventType: "workflow_run",
      payload: SAMPLE_PAYLOAD,
    },
  });
  console.log("✅ Created webhook_delivery:", delivery.id, "\n");

  // 3. Process it TWICE (simulating GitHub redelivery of the same event)
  console.log("--- First processing pass ---");
  await processCiEvent(fakeJob(delivery.id));

  console.log("\n--- Second processing pass (replay) ---");
  await processCiEvent(fakeJob(delivery.id));

  // 4. Assert exactly one ci_runs row exists for this repo+run
  const rows = await prisma.ciRun.findMany({
    where: { repositoryId: repo.id, githubRunId: 777001n },
  });

  console.log("\n--- Result ---");
  if (rows.length === 1) {
    console.log("✅ PASS: exactly one ci_runs row exists after replay");
    const row = rows[0];
    console.log({
      branch: row.branch,
      commitSha: row.commitSha,
      actor: row.actor,
      event: row.event,
      status: row.status,
      conclusion: row.conclusion,
      durationMs: row.durationMs,
    });
  } else {
    console.log(`❌ FAILED: expected 1 row, found ${rows.length}`);
  }

  // 5. Cleanup
  await prisma.ciRun.deleteMany({ where: { repositoryId: repo.id } });
  await prisma.webhookDelivery.deleteMany({ where: { id: delivery.id } });
  await prisma.repository.deleteMany({ where: { id: repo.id } });
  console.log("\n✅ Cleanup complete");
}

main()
  .catch((e) => {
    console.error("Unexpected error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());