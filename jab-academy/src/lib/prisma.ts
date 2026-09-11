import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Vercel's serverless filesystem is read-only outside /tmp. Since this project
// ships without an external database, each cold start copies the pre-seeded
// SQLite snapshot into /tmp so reads/writes work for the life of that instance.
function resolveDatasourceUrl(): string | undefined {
  if (!process.env.VERCEL) return undefined;
  const tmpPath = "/tmp/jab-academy.db";
  if (!fs.existsSync(tmpPath)) {
    const seedPath = path.join(process.cwd(), "prisma", "seed.db");
    fs.copyFileSync(seedPath, tmpPath);
  }
  return `file:${tmpPath}`;
}

const datasourceUrl = resolveDatasourceUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
