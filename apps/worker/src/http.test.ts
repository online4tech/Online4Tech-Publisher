import assert from "node:assert/strict";
import { test } from "node:test";
import worker, { type WorkerEnv } from "./http.js";

const env: WorkerEnv = {
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "test-token",
  APP_ORIGIN: "https://publisher.example.workers.dev",
};

test("health endpoint does not require external services", async () => {
  const response = await worker.fetch(
    new Request("https://publisher.example.workers.dev/api/health"),
    env,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok",
    service: "online4tech-publisher-worker",
  });
});

test("admin login rejects cross-origin requests before authentication", async () => {
  const response = await worker.fetch(
    new Request("https://publisher.example.workers.dev/api/admin/login", {
      method: "POST",
      headers: {
        Origin: "https://attacker.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: "not-a-real-password" }),
    }),
    env,
  );
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "ORIGIN_NOT_ALLOWED" });
});

test("non-API requests are delegated to static assets", async () => {
  const assetsEnv: WorkerEnv = {
    ...env,
    ASSETS: {
      async fetch() {
        return new Response("app-shell", { status: 200 });
      },
    },
  };
  const response = await worker.fetch(
    new Request("https://publisher.example.workers.dev/dashboard"),
    assetsEnv,
  );
  assert.equal(await response.text(), "app-shell");
});
