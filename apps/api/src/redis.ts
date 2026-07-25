import Redis from "ioredis";

export const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  lazyConnect: false,
  maxRetriesPerRequest: 1, // don't let a readiness check hang forever retrying
});