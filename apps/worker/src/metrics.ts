import client from "prom-client";

export const register = new client.Registry();

client.collectDefaultMetrics({ register });

export const jobProcessingDuration = new client.Histogram({
  name: "flaky_radar_job_processing_duration_seconds",
  help: "Time taken to process a CI event job in the worker pipeline",
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});