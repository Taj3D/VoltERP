import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

// Schema version: increment this after any Prisma schema change to force cache invalidation
const PRISMA_SCHEMA_VERSION = 13;

// ── Database type detection ──
// Turso/libsql URLs start with "libsql://" or "wss://"
// Local SQLite URLs start with "file:"

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

// ── Lazy PrismaClient creation ──
// We use a Proxy to defer PrismaClient creation until first property access.
// This prevents the "Collecting page data" build step from crashing when
// DATABASE_URL is unavailable during Vercel's static generation phase.

function getDatabaseUrl(): string {
  return process.env.DATABASE_URL || '';
}

function isTurso(): boolean {
  const url = getDatabaseUrl();
  return url.startsWith('libsql://') || url.startsWith('wss://');
}

function createPrismaClient(): PrismaClient {
  const DATABASE_URL = getDatabaseUrl();

  if (!DATABASE_URL) {
    // Build-time fallback: no database URL available
    // This PrismaClient won't actually work but prevents build crashes
    return new PrismaClient({ log: ['error'] })
  }

  if (isTurso()) {
    // Turso (cloud SQLite) — use LibSQL adapter
    const libsql = createClient({
      url: DATABASE_URL,
      authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
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

// Use a lazy proxy that creates the PrismaClient only on first access
// This avoids crash during Vercel build's "Collecting page data" phase
let _prismaClient: PrismaClient | null = null;

function getDb(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }
  if (!_prismaClient) {
    _prismaClient = createPrismaClient();
    if (process.env.NODE_ENV !== 'production') {
      globalForPrisma.prisma = _prismaClient;
      globalForPrisma.prismaSchemaVersion = PRISMA_SCHEMA_VERSION;
    }
  }
  return _prismaClient;
}

// Export a Proxy that lazily creates the PrismaClient on first property access
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const actual = getDb();
    const value = Reflect.get(actual, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(actual);
    }
    return value;
  },
});

// ── SQLite performance pragmas (local SQLite only) ──
// Defer pragma execution to first request (not at import time)
let pragmasApplied = false;
async function applyPragmas() {
  if (pragmasApplied || isTurso() || !getDatabaseUrl()) return;
  pragmasApplied = true;
  try {
    await db.$queryRawUnsafe('PRAGMA journal_mode=WAL');
    await db.$executeRawUnsafe('PRAGMA synchronous=NORMAL');
    await db.$executeRawUnsafe('PRAGMA cache_size=-16000');
    await db.$executeRawUnsafe('PRAGMA foreign_keys=ON');
    await db.$executeRawUnsafe('PRAGMA temp_store=MEMORY');
  } catch {
    // Pragmas may not be supported in all environments
  }
}

// Apply pragmas on next tick (after event loop is free)
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
  setImmediate(() => applyPragmas());
}

// ── Export database type for health checks ──
export const DB_TYPE = isTurso() ? 'Turso (libSQL)' : 'SQLite (local)';
