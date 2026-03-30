/**
 * Prisma ORM client — type-safe SQL access (Postgres) generated from `prisma/schema.prisma`.
 *
 * Python analogy: similar role to SQLAlchemy’s `Session` + models, or Django’s ORM, but
 * connection pooling and query building are handled by Prisma’s Rust engine.
 *
 * We attach one `PrismaClient` to `globalThis` in development so Next.js hot-reload does not
 * create a new DB pool on every file save (like a module-level singleton in Python that
 * survives `importlib.reload` quirks — here we enforce it explicitly).
 */
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
