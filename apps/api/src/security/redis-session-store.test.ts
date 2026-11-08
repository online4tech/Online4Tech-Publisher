import assert from "node:assert/strict";
import { test } from "node:test";
import type Redis from "ioredis";
import { createRedisSessionStore } from "./redis-session-store.js";

class FakeRedis {
  values = new Map<string, string>();
  expiries = new Map<string, number>();
  async set(key: string, value: string) { this.values.set(key, value); return "OK"; }
  async exists(key: string) { return this.values.has(key) ? 1 : 0; }
  async del(key: string) { const existed = this.values.delete(key); this.expiries.delete(key); return existed ? 1 : 0; }
  async eval(_script: string, _keyCount: number, key: string, windowMs: string) {
    const count = Number(this.values.get(key) ?? "0") + 1;
    this.values.set(key, String(count));
    if (count === 1) this.expiries.set(key, Number(windowMs));
    return [count, this.expiries.get(key) ?? Number(windowMs)];
  }
}

const fake = () => new FakeRedis() as unknown as Redis;

test("creates opaque sessions and verifies them through Redis", async () => {
  const redis = fake();
  const store = createRedisSessionStore(redis);
  const token = await store.create();
  assert.ok(token.length >= 40);
  assert.equal(await store.verify(token), true);
  assert.equal(await store.verify("not-a-session"), false);
});

test("logout revokes a session immediately", async () => {
  const store = createRedisSessionStore(fake());
  const token = await store.create();
  assert.equal(await store.verify(token), true);
  await store.revoke(token);
  assert.equal(await store.verify(token), false);
});

test("login throttling is shared through the Redis store", async () => {
  const redis = fake();
  const first = createRedisSessionStore(redis);
  const second = createRedisSessionStore(redis);
  assert.equal((await first.consumeLoginAttempt("127.0.0.1", 2, 900_000)).allowed, true);
  assert.equal((await second.consumeLoginAttempt("127.0.0.1", 2, 900_000)).allowed, true);
  const blocked = await first.consumeLoginAttempt("127.0.0.1", 2, 900_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
});

test("successful authentication clears the shared login counter", async () => {
  const redis = fake();
  const store = createRedisSessionStore(redis);
  await store.consumeLoginAttempt("192.0.2.1", 5, 900_000);
  await store.clearLoginAttempts("192.0.2.1");
  assert.equal((await store.consumeLoginAttempt("192.0.2.1", 5, 900_000)).remaining, 4);
});
