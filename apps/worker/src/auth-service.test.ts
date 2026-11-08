import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { createAuthService, ADMIN_SESSION_TTL_SECONDS, type AuthStore } from "./auth-service.js";

class MemoryStore implements AuthStore {
  values = new Map<string, string>();
  counters = new Map<string, { count: number; ttlMs: number }>();
  async set(key: string, value: string, _ttl: number, nx = false) {
    if (nx && this.values.has(key)) return false;
    this.values.set(key, value);
    return true;
  }
  async exists(key: string) { return this.values.has(key); }
  async delete(key: string) { this.values.delete(key); }
  async consume(key: string, windowMs: number) {
    const current = this.counters.get(key) ?? { count: 0, ttlMs: windowMs };
    current.count += 1;
    this.counters.set(key, current);
    return current;
  }
  async take(key: string) {
    const value = this.values.get(key) ?? null;
    this.values.delete(key);
    return value;
  }
}

function passwordHash(password: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64url")}$${scryptSync(password, salt, 64).toString("base64url")}`;
}

test("login creates an opaque 8-hour session and verifies it", async () => {
  const service = createAuthService(new MemoryStore());
  const result = await service.login("correct horse battery staple", passwordHash("correct horse battery staple"), "192.0.2.1");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.expiresInSeconds, ADMIN_SESSION_TTL_SECONDS);
  assert.equal(await service.verify(result.token), true);
  await service.logout(result.token);
  assert.equal(await service.verify(result.token), false);
});

test("login rejects invalid credentials and throttles after five attempts", async () => {
  const service = createAuthService(new MemoryStore());
  const hash = passwordHash("correct password");
  for (let i = 0; i < 5; i++) {
    const result = await service.login("wrong password", hash, "198.51.100.8");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 401);
  }
  const blocked = await service.login("correct password", hash, "198.51.100.8");
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.status, 429);
});

test("OAuth state is random, bound to a live admin session, and one-time", async () => {
  const store = new MemoryStore();
  const service = createAuthService(store);
  const login = await service.login("password", passwordHash("password"), "203.0.113.5");
  assert.equal(login.ok, true);
  if (!login.ok) return;
  const started = await service.beginOAuth(login.token);
  assert.equal(started.ok, true);
  if (!started.ok) return;
  const sessionDigest = await service.consumeOAuthStateSession(started.state);
  assert.match(sessionDigest ?? "", /^[a-f0-9]{64}$/);
  assert.equal(await service.consumeOAuthState(started.state), false);
  await service.logout(login.token);
  const second = await service.beginOAuth(login.token);
  assert.equal(second.ok, false);
});

test("OAuth state rejects malformed and unknown values", async () => {
  const service = createAuthService(new MemoryStore());
  assert.equal(await service.consumeOAuthState("bad"), false);
  assert.equal(await service.consumeOAuthState("A".repeat(43)), false);
  assert.equal(createHash("sha256").update("sample").digest("hex").length, 64);
});
