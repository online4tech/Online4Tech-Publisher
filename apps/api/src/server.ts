import "dotenv/config";
import { timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { z } from "zod";
import { prisma } from "@o4t/db";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url().default("http://localhost:5173"),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_CONFIG_ID: z.string().optional(),
  META_ACCESS_TOKEN: z.string().optional(),
  META_CONNECTION_TEST_KEY: z.string().optional(),
  META_GRAPH_API_VERSION: z.string().regex(/^v\\d+\\.\\d+$/).default("v27.0"),
  META_OAUTH_REDIRECT_URI: z.string().optional(),
});

const env = envSchema.parse(process.env);
const app = Fastify({
  logger: { level: env.NODE_ENV === "production" ? "info" : "debug" },
  trustProxy: env.NODE_ENV === "production",
});

await app.register(helmet);
await app.register(cors, {
  origin: env.APP_URL,
  credentials: true,
});

app.get("/api/health", async () => ({
  status: "ok",
  service: "online4tech-publisher-api",
  timestamp: new Date().toISOString(),
}));

app.get("/api/meta/status", async () => ({
  provider: "meta",
  graphApiVersion: env.META_GRAPH_API_VERSION,
  appConfigured: Boolean(env.META_APP_ID && env.META_APP_SECRET && env.META_CONFIG_ID),
  tokenConfigured: Boolean(env.META_ACCESS_TOKEN),
  connectionTestProtected: Boolean(env.META_CONNECTION_TEST_KEY),
  connection: "not_tested",
}));

app.post("/api/meta/connection-test", async (request, reply) => {
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
    await prisma.$connect();
    return { status: "ready", database: "connected" };
  } catch (error) {
    app.log.error({ err: error }, "Database readiness check failed");
    return reply.code(503).send({ status: "not_ready", database: "unavailable" });
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
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", close);
process.on("SIGTERM", close);

try {
  await app.listen({ host: "0.0.0.0", port: env.PORT });
} catch (error) {
  app.log.error(error);
  await prisma.$disconnect();
  process.exit(1);
}
