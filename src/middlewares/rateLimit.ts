/**
 * Redis-backed rate limiter (fixed-window).
 *
 * Per key we do the classic INCR + EXPIRE pattern:
 *   - First hit in a window: INCR returns 1, so we set the window TTL.
 *   - Every later hit: INCR bumps the count; TTL keeps ticking down.
 *   - Over the limit: reject 429 with a Retry-After header.
 *   - Window expires: key auto-deletes, counter resets. No cleanup job.
 *
 * INCR is atomic, so concurrent requests can't miscount.
 *
 * Fail-OPEN by design: if Redis is disabled or unreachable, we let the request
 * through (availability over strictness). A blocked login page is worse than a
 * briefly-unthrottled one — flip `failOpen` to false for sensitive routes if you
 * prefer the opposite trade-off.
 */

import type { Request, Response, NextFunction } from "express";
import { redis, k } from "../db/redis";
import { AppError, Err, getIp } from "../lib/core";
import { ErrorCode } from "../types/enums";

export interface RateLimitOptions {
    /** Max requests allowed within the window. */
    max: number;
    /** Window length in seconds. */
    windowSec: number;
    /** Key namespace so different limiters don't collide. Default: "rl". */
    prefix?: string;
    /** Derive the identity to throttle on. Default: client IP. */
    keyBy?: (req: Request) => string;
    /** Let requests through when Redis is down/disabled. Default: true. */
    failOpen?: boolean;
}

export const rateLimit = (opts: RateLimitOptions) => {
    const { max, windowSec, prefix = "rl", keyBy = getIp, failOpen = true } = opts;

    return async (req: Request, resp: Response, next: NextFunction): Promise<void> => {
        const key = k(`${prefix}:${keyBy(req)}:${req.path}`);

        try {
            const count = await redis.incr(key);

            if (count == 1) await redis.expire(key, windowSec);

            if (count > max) {
                const ttl = await redis.ttl(key);
                const retryAfter = ttl > 0 ? ttl : windowSec;
                resp.setHeader("Retry-After", String(retryAfter));
                throw new AppError(
                    ErrorCode.RateLimited,
                    `Too many requests. Please try again in ${retryAfter}s.`,
                    429,
                );
            }

            next();
        } catch (err) {
            if (err instanceof AppError) { Err(resp, err); return; }

            console.error("[rateLimit] error:", err instanceof Error ? err.message : err);
            if (failOpen) return next();
            Err(resp, new AppError(ErrorCode.ServerError, "Rate limiter unavailable.", 503));
        }
    };
}
