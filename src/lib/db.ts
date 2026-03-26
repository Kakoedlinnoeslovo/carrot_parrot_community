import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

/**
 * Single PrismaClient for the whole Node process (dev + prod). Prevents pool
 * churn during Next.js dev HMR and avoids duplicate clients reconnecting to
 * Neon after idle closes.
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

globalForPrisma.prisma = prisma;
