import RedisPkg from "ioredis";

const IORedis: any = RedisPkg as unknown as any;

export const redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  lazyConnect: false,
  maxRetriesPerRequest: 1, // don't let a readiness check hang forever retrying
});