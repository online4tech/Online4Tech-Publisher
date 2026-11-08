import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { z } from "zod";
import { prisma } from "@o4t/db";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url().default("http://localhost:5173"),
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

app.get("/api/ready", async (_request, reply) => {
  try {
    await prisma.$queryRaw\`SELECT 1\`;
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