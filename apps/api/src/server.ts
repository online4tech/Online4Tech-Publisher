import "dotenv/config";
import { timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Redis from "ioredis";
import { z } from "zod";
import { prisma } from "@o4t/db";
import {
  clearSessionCookie,
  readCookie,
  sessionCookie,
  verifyAdminPassword,
} from "./security/admin-auth.js";
import { createRedisSessionStore, ADMIN_SESSION_TTL_SECONDS } from "./security/redis-session-store.js";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url().default("http://localhost:5173"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  ADMIN_PASSWORD_HASH: z.string().optional(),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_CONFIG_ID: z.string().optional(),
  META_ACCESS_TOKEN: z.string().optional(),
  META_CONNECTION_TEST_KEY: z.string().optional(),
  META_CONNECTION_TEST_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  META_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v27.0"),
  META_OAUTH_REDIRECT_URI: z.string().optional(),
});

const env = envSchema.parse(process.env);
const app = Fastify({
  logger: { level: env.NODE_ENV === "production" ? "info" : "debug" },
  trustProxy: env.NODE_ENV === "production",
});
const redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
const sessions = createRedisSessionStore(redis);
const expectedOrigin = new URL(env.APP_URL).origin;
const secureCookies = env.NODE_ENV === "production";
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

redis.on("error", (error) => app.log.error({ err: error }, "Redis connection error"));

await app.register(helmet);
await app.register(cors, {
  origin: expectedOrigin,
  credentials: true,
});

app.addHook("preHandler", async (request, reply) => {
  const path = request.url.split("?")[0];
  if (!path.startsWith("/api/admin/")) return;

  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.origin;
    if (origin !== expectedOrigin) {
      return reply.code(403).send({ error: "ORIGIN_NOT_ALLOWED", message: "الطلب مرفوض" });
    }
  }

  if (path === "/api/admin/login" || path === "/api/admin/logout") return;

  try {
    const token = readCookie(request.headers.cookie);
    if (!(await sessions.verify(token))) {
      return reply.code(401).send({ error: "ADMIN_AUTH_REQUIRED", message: "سجّل الدخول للمتابعة" });
    }
  } catch {
    return reply.code(503).send({ error: "SESSION_STORE_UNAVAILABLE", message: "خدمة الجلسات غير متاحة مؤقتًا" });
  }
});

app.get("/api/health", async () => ({
  status: "ok",
  service: "online4tech-publisher-api",
  timestamp: new Date().toISOString(),
}));

app.get("/api/admin/session", async () => ({
  authenticated: true,
  expiresInSeconds: ADMIN_SESSION_TTL_SECONDS,
}));

app.post("/api/admin/login", async (request, reply) => {
  if (!env.ADMIN_PASSWORD_HASH) {
    return reply.code(503).send({
      error: "ADMIN_AUTH_NOT_CONFIGURED",
      message: "إعداد الدخول الإداري غير مكتمل على السيرفر",
    });
  }

  const body = z.object({ password: z.string().min(1).max(256) }).safeParse(request.body);
  if (!body.success) {
    return reply.code(400).send({ error: "INVALID_REQUEST", message: "بيانات الدخول غير صحيحة" });
  }

  let rate;
  try {
    rate = await sessions.consumeLoginAttempt(request.ip, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  } catch {
    return reply.code(503).send({ error: "RATE_LIMIT_STORE_UNAVAILABLE", message: "تعذر التحقق من محاولات الدخول. حاول لاحقًا." });
  }

  if (!rate.allowed) {
    reply.header("Retry-After", String(Math.max(1, Math.ceil(rate.retryAfterMs / 1000))));
    return reply.code(429).send({
      error: "LOGIN_RATE_LIMITED",
      message: "محاولات دخول كثيرة. انتظر قليلًا ثم حاول مرة أخرى.",
    });
  }

  if (!verifyAdminPassword(body.data.password, env.ADMIN_PASSWORD_HASH)) {
    return reply.code(401).send({ error: "INVALID_CREDENTIALS", message: "كلمة المرور غير صحيحة" });
  }

  try {
    await sessions.clearLoginAttempts(request.ip);
    const token = await sessions.create();
    reply.header("Set-Cookie", sessionCookie(token, secureCookies));
    return { authenticated: true, expiresInSeconds: ADMIN_SESSION_TTL_SECONDS };
  } catch {
    return reply.code(503).send({ error: "SESSION_STORE_UNAVAILABLE", message: "تعذر إنشاء جلسة آمنة. حاول مرة أخرى." });
  }
});

app.post("/api/admin/logout", async (request, reply) => {
  try {
    await sessions.revoke(readCookie(request.headers.cookie));
    reply.header("Set-Cookie", clearSessionCookie(secureCookies));
    return { authenticated: false };
  } catch {
    return reply.code(503).send({ error: "SESSION_STORE_UNAVAILABLE", message: "تعذر إنهاء الجلسة على الخادم. حاول مرة أخرى." });
  }
});

app.get("/api/meta/status", async () => ({
  provider: "meta",
  graphApiVersion: env.META_GRAPH_API_VERSION,
  appConfigured: Boolean(env.META_APP_ID && env.META_APP_SECRET && env.META_CONFIG_ID),
  tokenConfigured: Boolean(env.META_ACCESS_TOKEN),
  connectionTestProtected: Boolean(env.META_CONNECTION_TEST_KEY),
  connectionTestEnabled: env.META_CONNECTION_TEST_ENABLED && env.NODE_ENV !== "production",
  connection: "not_tested",
}));

app.post("/api/meta/connection-test", async (request, reply) => {
  // This temporary endpoint is deliberately unavailable in production.
  if (env.NODE_ENV === "production" || !env.META_CONNECTION_TEST_ENABLED) {
    return reply.code(404).send({ error: "NOT_FOUND", message: "المسار غير موجود" });
  }

  if (!env.META_ACCESS_TOKEN || !env.META_CONNECTION_TEST_KEY) {
    return reply.code(503).send({
      error: "META_NOT_CONFIGURED",
      message: "إعدادات اختبار اتصال Meta غير مكتملة على السيرفر",
    });
  }

  const suppliedKey = request.headers["x-meta-connection-test-key"];
  if (typeof suppliedKey !== "string") {
    return reply.code(401).send({ error: "UNAUTHORIZED", message: "غير مصرح" });
  }

  const expected = Buffer.from(env.META_CONNECTION_TEST_KEY);
  const supplied = Buffer.from(suppliedKey);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return reply.code(401).send({ error: "UNAUTHORIZED", message: "غير مصرح" });
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/me?fields=id,name`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${env.META_ACCESS_TOKEN}` },
        signal: AbortSignal.timeout(10_000),
      },
    );

    const payload = (await response.json().catch(() => null)) as
      | { id?: string; name?: string; error?: { code?: number } }
      | null;

    if (!response.ok || !payload?.id) {
      return reply.code(502).send({
        error: "META_TOKEN_CHECK_FAILED",
        message: "Meta لم تقبل بيانات الاتصال. راجع صلاحية التوكن ونوعه.",
        metaCode: payload?.error?.code ?? null,
      });
    }

    return {
      provider: "meta",
      connection: "token_valid",
      account: { id: payload.id, name: payload.name ?? null },
      note: "تم التحقق من قبول التوكن فقط؛ لم يتم بعد التحقق من صلاحيات أصول Instagram أو النشر والرسائل.",
    };
  } catch {
    return reply.code(502).send({
      error: "META_UNREACHABLE",
      message: "تعذر الوصول إلى Meta حاليًا. حاول مرة أخرى لاحقًا.",
    });
  }
});

app.get("/api/ready", async (_request, reply) => {
  try {
    await Promise.all([prisma.$connect(), redis.ping()]);
    return { status: "ready", database: "connected", redis: "connected" };
  } catch (error) {
    app.log.error({ err: error }, "API readiness check failed");
    return reply.code(503).send({ status: "not_ready", database: "or_redis_unavailable" });
  }
});

app.setNotFoundHandler((_request, reply) => {
  return reply.code(404).send({ error: "NOT_FOUND", message: "المسار غير موجود" });
});

app.setErrorHandler((error, _request, reply) => {
  app.log.error({ err: error }, "Unhandled API error");
  return reply.code(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "حصل خطأ غير متوقع",
  });
});

const close = async () => {
  await app.close();
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  process.exit(0);
};

process.on("SIGINT", close);
process.on("SIGTERM", close);

try {
  await redis.connect();
  await app.listen({ host: "0.0.0.0", port: env.PORT });
} catch (error) {
  app.log.error(error);
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  process.exit(1);
}
