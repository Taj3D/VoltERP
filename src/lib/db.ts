import { PrismaClient } from '@prisma/client'

// Schema version: increment this after any Prisma schema change to force cache invalidation
const PRISMA_SCHEMA_VERSION = 6;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaSchemaVersion?: number
}

// If cached client is missing models (after schema update), clear it
if (globalForPrisma.prisma && typeof (globalForPrisma.prisma as any).auditLog === 'undefined') {
  globalForPrisma.prisma = undefined
}
// Invalidate cache if schema version has changed
if (globalForPrisma.prisma && globalForPrisma.prismaSchemaVersion !== PRISMA_SCHEMA_VERSION) {
  globalForPrisma.prisma = undefined
  globalForPrisma.prismaSchemaVersion = PRISMA_SCHEMA_VERSION
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

// SQLite performance pragmas
// Note: PRAGMA journal_mode=WAL returns a result, so we use $queryRawUnsafe
// Other PRAGMAs don't return results, so $executeRawUnsafe is fine
db.$queryRawUnsafe('PRAGMA journal_mode=WAL').catch(() => {
  // WAL mode may not be supported in all environments
})
db.$executeRawUnsafe('PRAGMA synchronous=NORMAL').catch(() => {})
db.$executeRawUnsafe('PRAGMA cache_size=-16000').catch(() => {}) // 16MB cache
db.$executeRawUnsafe('PRAGMA foreign_keys=ON').catch(() => {})
db.$executeRawUnsafe('PRAGMA temp_store=MEMORY').catch(() => {})

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
  globalForPrisma.prismaSchemaVersion = PRISMA_SCHEMA_VERSION
}
