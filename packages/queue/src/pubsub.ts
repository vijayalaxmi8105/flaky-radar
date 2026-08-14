import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const FLAKY_RADAR_EVENTS_CHANNEL = "flaky-radar:events";

export type FlakyRadarEvent =
  | { type: "run:completed"; repositoryId: string; ciRunId: string }
  | { type: "scores:recomputed"; repositoryId?: string };

// Separate connection for publishing — safe to share across publishers,
// does not enter subscriber mode.
let publisherConnection: Redis | null = null;

export function getPublisher(): Redis {
  if (!publisherConnection) {
    publisherConnection = new Redis(REDIS_URL);
  }
  return publisherConnection;
}

export async function publishEvent(event: FlakyRadarEvent): Promise<void> {
  const publisher = getPublisher();
  await publisher.publish(FLAKY_RADAR_EVENTS_CHANNEL, JSON.stringify(event));
}

// Dedicated connection for subscribing — ioredis puts a connection that
// calls .subscribe() into subscriber mode, so this must never be the same
// instance used for normal commands (e.g. queueConnection).
export function createSubscriber(): Redis {
  return new Redis(REDIS_URL);
}
