import { redis } from '../redis';

const DEDUPE_TTL_SECONDS = 60 * 60 * 24; // 24h — matches GitHub's practical retry window

/**
 * Atomically claims a delivery ID.
 * Returns true if this is the FIRST time we've seen it (caller should process).
 * Returns false if it's a duplicate (caller should short-circuit).
 */
export async function claimDeliveryId(deliveryId: string): Promise<boolean> {
  const key = `webhook:dedupe:${deliveryId}`;
  // SET key value NX EX ttl -> 'OK' if set, null if key already existed
  const result = await redis.set(key, '1', 'EX', DEDUPE_TTL_SECONDS, 'NX');
  return result === 'OK';
}