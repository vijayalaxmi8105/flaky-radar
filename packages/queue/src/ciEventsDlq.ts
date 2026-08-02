import { Queue } from "bullmq";
import { queueConnection } from "./connection";

export const CI_EVENTS_DLQ_NAME = "ci-events-dlq";

export interface CiEventDlqJobData {
  originalJobId: string;
  originalQueue: string;
  data: unknown;
  failedReason: string;
  attemptsMade: number;
  failedAt: string; // ISO timestamp
}

export const ciEventsDlq = new Queue<CiEventDlqJobData>(CI_EVENTS_DLQ_NAME, {
  connection: queueConnection,
  defaultJobOptions: {
    // DLQ jobs are terminal by design — no retries, keep them around
    // until someone inspects/clears them.
    removeOnComplete: false,
    removeOnFail: false,
  },
});