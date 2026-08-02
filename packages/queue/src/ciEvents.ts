import { Queue } from "bullmq";
import { queueConnection } from "./connection";

export const CI_EVENTS_QUEUE_NAME = "ci-events";
export const PROCESS_WORKFLOW_RUN_JOB = "process-workflow-run";

export interface CiEventJobData {
  webhookDeliveryId: string;
}

export const ciEventsQueue = new Queue<CiEventJobData>(CI_EVENTS_QUEUE_NAME, {
  connection: queueConnection,
});