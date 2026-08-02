import Redis from "ioredis";

export const queueConnection = new Redis(
  process.env.REDIS_URL || "redis://localhost:6379",
  {
    maxRetriesPerRequest: null, // required by BullMQ — do not change this
  }
);