import "dotenv/config";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

let shuttingDown = false;

connection.on("error", (error) => {
  // Avoid printing connection URLs or environment values.
  console.error("[worker] Redis connection error:", error.message);
});

const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`[worker] Received ${signal}; closing Redis connection.`);
  try {
    await connection.quit();
  } finally {
    process.exit(0);
  }
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await connection.connect();
  await connection.ping();
  console.info("[worker] Redis connection established.");
  console.info("[worker] Worker runtime is online; scheduled publishing remains disabled until the Meta publishing pipeline is implemented and tested.");
  // Keep this service alive for its future queue consumer; no publishing jobs are processed yet.
} catch (error) {
  console.error("[worker] Could not connect to Redis:", error instanceof Error ? error.message : "Unknown error");
  await connection.quit().catch(() => undefined);
  process.exit(1);
}
