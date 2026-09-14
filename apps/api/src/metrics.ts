import client from "prom-client";

export const register = new client.Registry();

client.collectDefaultMetrics({ register });

export const webhookReceivedCounter = new client.Counter({
  name: "flaky_radar_webhooks_received_total",
  help: "Total number of GitHub webhook deliveries received",
  labelNames: ["event_type"] as const,
  registers: [register],
});

export const jobProcessingDuration = new client.Histogram({
  name: "flaky_radar_job_processing_duration_seconds",
  help: "Time taken to process a CI event job in the worker pipeline",
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

export const apiRequestDuration = new client.Histogram({
  name: "flaky_radar_api_request_duration_seconds",
  help: "API request latency in seconds",
  labelNames: ["method", "route", "status_code"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
});