import type { AuthStore } from "./auth-service.js";

const RATE_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]) end
local ttl = redis.call("PTTL", KEYS[1])
if ttl < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { count, ttl }
`;

const TAKE_SCRIPT = `
local value = redis.call("GET", KEYS[1])
if value then redis.call("DEL", KEYS[1]) end
return value
`;

export class UpstashAuthStore implements AuthStore {
  private readonly endpoint: string;

  constructor(url: string, private readonly token: string) {
    this.endpoint = url.replace(/\/$/, "");
    if (!/^https:\/\//.test(this.endpoint) || !token) {
      throw new Error("Upstash REST configuration is invalid");
    }
  }

  private async command<T>(path: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.endpoint}/${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      console.error("Upstash REST network failure", error instanceof Error ? error.name : "UnknownError");
      throw new Error("SESSION_STORE_UNAVAILABLE");
    }

    const responseText = await response.text();
    let payload: { result?: T; error?: string };
    try {
      payload = JSON.parse(responseText) as { result?: T; error?: string };
    } catch {
      console.error("Upstash REST returned invalid JSON", { status: response.status });
      throw new Error("SESSION_STORE_UNAVAILABLE");
    }

    if (!response.ok || payload.error) {
      console.error("Upstash REST command rejected", {
        status: response.status,
        error: typeof payload.error === "string" ? payload.error.slice(0, 180) : "No error detail",
      });
      throw new Error("SESSION_STORE_UNAVAILABLE");
    }
    return payload.result as T;
  }

  async set(key: string, value: string, ttlSeconds: number, onlyIfAbsent = false) {
    const args = ["SET", key, value, "EX", String(ttlSeconds)];
    if (onlyIfAbsent) args.push("NX");
    const result = await this.command<string | null>("", args);
    return result === "OK";
  }

  async exists(key: string) {
    return Number(await this.command<number>("", ["EXISTS", key])) === 1;
  }

  async delete(key: string) {
    await this.command<number>("", ["DEL", key]);
  }

  async consume(key: string, windowMs: number) {
    const result = await this.command<[number, number]>("", ["EVAL", RATE_SCRIPT, "1", key, String(windowMs)]);
    return { count: Number(result[0]), ttlMs: Number(result[1]) };
  }

  async take(key: string) {
    return this.command<string | null>("", ["EVAL", TAKE_SCRIPT, "1", key]);
  }
}
