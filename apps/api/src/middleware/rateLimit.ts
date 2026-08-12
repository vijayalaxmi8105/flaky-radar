import type { Request, Response, NextFunction } from "express";
import { redis } from "../redis.js";
import { sendError } from "../lib/apiError.js";

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

const AUTHENTICATED_LIMIT: RateLimitOptions = {
  windowMs: 60_000,
  maxRequests: 120,
};

const ANONYMOUS_LIMIT: RateLimitOptions = {
  windowMs: 60_000,
  maxRequests: 30,
};

export async function rateLimit(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).user?.sub as string | undefined;
  const { key, options } = userId
    ? { key: `ratelimit:user:${userId}`, options: AUTHENTICATED_LIMIT }
    : { key: `ratelimit:ip:${req.ip}`, options: ANONYMOUS_LIMIT };

  try {
    const count = await redis.incr(key);

    if (count === 1) {
      // first hit in this window — start the clock
      await redis.pexpire(key, options.windowMs);
    }

    if (count > options.maxRequests) {
      const ttlMs = await redis.pttl(key);
      const retryAfterSeconds = Math.ceil((ttlMs > 0 ? ttlMs : options.windowMs) / 1000);
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return sendError(
        req,
        res,
        "RATE_LIMITED",
        `Rate limit exceeded. Retry after ${retryAfterSeconds}s.`
      );
    }

    res.setHeader("X-RateLimit-Limit", String(options.maxRequests));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, options.maxRequests - count)));
    return next();
  } catch (err) {
    // fail open — a Redis blip shouldn't take down the whole API
    req.log?.warn({ err }, "rate limit check failed, allowing request through");
    return next();
  }
}