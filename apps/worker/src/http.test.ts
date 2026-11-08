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


test("Meta status endpoint requires an admin session", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    new Response(JSON.stringify({ result: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  const response = await worker.fetch(
    new Request("https://publisher.example.workers.dev/api/admin/meta/status"),
    env,
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "ADMIN_AUTH_REQUIRED" });
});

test("Meta status endpoint reports publishing disabled until OAuth storage is implemented", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    new Response(JSON.stringify({ result: 1 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  const configuredEnv: WorkerEnv = {
    ...env,
    META_APP_ID: "test-app-id",
    META_APP_SECRET: "test-app-secret",
    META_CONFIG_ID: "test-config-id",
    META_OAUTH_REDIRECT_URI: "https://publisher.example.workers.dev/api/meta/oauth/callback",
    TOKEN_ENCRYPTION_KEY: "test-encryption-key",
  };
  const response = await worker.fetch(
    new Request("https://publisher.example.workers.dev/api/admin/meta/status", {
      headers: { Cookie: "o4t_admin_session=test-session" },
    }),
    configuredEnv,
  );
  assert.equal(response.status, 200);
  const payload = await response.json() as {
    oauthConfigured: boolean;
    connected: boolean;
    publishingEnabled: boolean;
    accounts: unknown[];
  };
  assert.equal(payload.oauthConfigured, true);
  assert.equal(payload.connected, false);
  assert.equal(payload.publishingEnabled, false);
  assert.deepEqual(payload.accounts, []);
});
