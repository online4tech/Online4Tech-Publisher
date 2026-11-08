import "dotenv/config";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

connection.on("error", (error) => {
  console.error("[worker] Redis connection error:", error.message);
});

try {
  await connection.connect();
  await connection.ping();
  console.info("[worker] Redis connection established.");
  console.info("[worker] Publishing consumer is intentionally disabled until the Meta publishing pipeline is implemented and tested.");
} catch (error) {
  console.error("[worker] Could not connect to Redis:", error);
  process.exitCode = 1;
} finally {
  await connection.quit();
}