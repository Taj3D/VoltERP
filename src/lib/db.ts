import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

// Schema version: increment this after any Prisma schema change to force cache invalidation
const PRISMA_SCHEMA_VERSION = 11;

// ── Database type detection ──
// Turso/libsql URLs start with "libsql://" or "wss://"
// Local SQLite URLs start with "file:"
const DATABASE_URL = process.env.DATABASE_URL || '';
const IS_TURSO = DATABASE_URL.startsWith('libsql://') || DATABASE_URL.startsWith('wss://');

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

// ── Create PrismaClient with appropriate adapter ──
function createPrismaClient(): PrismaClient {
  if (IS_TURSO) {
    // Turso (cloud SQLite) — use LibSQL adapter
    const libsql = createClient({
      url: DATABASE_URL,
      authToken: process.env.DATABASE_AUTH_TOKEN,
    })
    const adapter = new PrismaLibSql(libsql)
    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    })
  }

  // Local SQLite — standard PrismaClient
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

// ── SQLite performance pragmas (local SQLite only) ──
// These PRAGMAs only work on local SQLite — not on Turso (HTTP-based)
if (!IS_TURSO) {
  db.$queryRawUnsafe('PRAGMA journal_mode=WAL').catch(() => {
    // WAL mode may not be supported in all environments
  })
  db.$executeRawUnsafe('PRAGMA synchronous=NORMAL').catch(() => {})
  db.$executeRawUnsafe('PRAGMA cache_size=-16000').catch(() => {}) // 16MB cache
  db.$executeRawUnsafe('PRAGMA foreign_keys=ON').catch(() => {})
  db.$executeRawUnsafe('PRAGMA temp_store=MEMORY').catch(() => {})
}

// ── Export database type for health checks ──
export const DB_TYPE = IS_TURSO ? 'Turso (libSQL)' : 'SQLite (local)';

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
  globalForPrisma.prismaSchemaVersion = PRISMA_SCHEMA_VERSION
}
