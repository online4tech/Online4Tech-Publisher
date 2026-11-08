import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Creates a request-scoped Prisma client backed by Cloudflare Hyperdrive.
 * The caller must disconnect it in a finally block.
 */
export function createWorkerPrismaClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter, log: ["error"] });
}
