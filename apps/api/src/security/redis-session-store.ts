import { createHash, randomBytes } from "node:crypto";
import type Redis from "ioredis";

const SESSION_PREFIX = "o4t:admin:session:";
const RATE_PREFIX = "o4t:admin:login-rate:";
const SESSION_TTL_SECONDS = 8 * 60 * 60;

const RATE_LIMIT_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
if ttl < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { count, ttl }
`;

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Redis-backed opaque admin sessions and shared login throttling.
 * Only a SHA-256 digest of the browser bearer token is stored in Redis.
 */
export function createRedisSessionStore(redis: Redis) {
  return {
    async create(): Promise<string> {
      const token = randomBytes(32).toString("base64url");
      await redis.set(
        SESSION_PREFIX + digest(token),
        "1",
        "EX",
        SESSION_TTL_SECONDS,
      );
      return token;
    },

    async verify(token: string | undefined): Promise<boolean> {
      if (!token || token.length > 128) return false;
      return (await redis.exists(SESSION_PREFIX + digest(token))) === 1;
    },

    async revoke(token: string | undefined): Promise<void> {
      if (!token || token.length > 128) return;
      await redis.del(SESSION_PREFIX + digest(token));
    },

    async consumeLoginAttempt(
      identity: string,
      limit: number,
      windowMs: number,
    ): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }> {
      const safeIdentity = digest(identity);
      const result = await redis.eval(
        RATE_LIMIT_SCRIPT,
        1,
        RATE_PREFIX + safeIdentity,
        String(windowMs),
      ) as [number, number];
      const count = Number(result[0]);
      const ttl = Math.max(0, Number(result[1]));
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        retryAfterMs: ttl,
      };
    },

    async clearLoginAttempts(identity: string): Promise<void> {
      await redis.del(RATE_PREFIX + digest(identity));
    },
  };
}

export const ADMIN_SESSION_TTL_SECONDS = SESSION_TTL_SECONDS;
