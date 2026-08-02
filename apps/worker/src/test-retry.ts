import { QueueEvents } from "bullmq";
import {
  queueConnection,
  ciEventsQueue,
  CI_EVENTS_QUEUE_NAME,
} from "@flaky-radar/queue";

async function main() {
  const queueEvents = new QueueEvents(CI_EVENTS_QUEUE_NAME, {
    connection: queueConnection,
  });
  await queueEvents.waitUntilReady();

  let lastTs: number | null = null;

  function record(event: string) {
    const now = Date.now();
    const deltaMs = lastTs === null ? null : now - lastTs;
    lastTs = now;
    console.log(
      `[${new Date(now).toISOString()}] ${event}` +
        (deltaMs !== null ? ` (+${(deltaMs / 1000).toFixed(2)}s since last)` : "")
    );
  }

  queueEvents.on("active", ({ jobId }) => record(`active   jobId=${jobId}`));
  queueEvents.on("failed", ({ jobId, failedReason }) =>
    record(`failed   jobId=${jobId} reason="${failedReason}"`)
  );
  queueEvents.on("completed", ({ jobId }) => record(`completed jobId=${jobId}`));

  const job = await ciEventsQueue.add("process-workflow-run", {
    webhookDeliveryId: "test-retry-day9",
    forceFail: true,
  } as any);

  console.log(`Enqueued job ${job.id} — expect fails at ~0s, 2s, 6s, 14s, 30s\n`);

  await new Promise((resolve) => setTimeout(resolve, 45_000));

  const failedJobs = await ciEventsQueue.getFailed();
  const stillThere = failedJobs.find((j) => j.id === job.id);

  console.log("\n--- Summary ---");
  console.log(
    stillThere
      ? `Job ${job.id} landed in FAILED set (attemptsMade=${stillThere.attemptsMade})`
      : `Job ${job.id} NOT found in failed set — investigate`
  );

  await queueEvents.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("test-retry error:", err);
  process.exit(1);
});