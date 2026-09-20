import { PrismaClient } from "@prisma/client";

/**
 * Single Prisma client for the whole app. Next.js dev hot-reload re-evaluates
 * modules, so pin it to globalThis exactly like the in-memory store did.
 */
const globalForPrisma = globalThis as unknown as { __upsasPrisma?: PrismaClient };

export const prisma =
  globalForPrisma.__upsasPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.__upsasPrisma = prisma;
