import { PrismaClient } from '@prisma/client'

// Schema version: increment this after any Prisma schema change to force cache invalidation
const PRISMA_SCHEMA_VERSION = 16;

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

// ── Database type detection ──
function getDatabaseUrl(): string {
  return process.env.DATABASE_URL || '';
}

function isTurso(): boolean {
  const url = getDatabaseUrl();
  return url.startsWith('libsql://') || url.startsWith('wss://');
}

// ── Lazy PrismaClient creation ──
function createPrismaClient(): PrismaClient {
  const DATABASE_URL = getDatabaseUrl();

  if (!DATABASE_URL) {
    // Build-time fallback: no database URL available
    console.warn('[db] DATABASE_URL not set — creating PrismaClient without adapter');
    return new PrismaClient({ log: ['error'] })
  }

  if (isTurso()) {
    // Turso (cloud SQLite) — use LibSQL adapter
    // Pass config object directly to PrismaLibSQL factory
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaLibSQL } = require('@prisma/adapter-libsql');
    const adapter = new PrismaLibSQL({
      url: DATABASE_URL,
      authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
    });
    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  // Local SQLite — standard PrismaClient
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

// ── Lazy singleton with getter ──
let _prismaInstance: PrismaClient | null = null;

function getPrismaInstance(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }
  if (!_prismaInstance) {
    _prismaInstance = createPrismaClient();
    if (process.env.NODE_ENV !== 'production') {
      globalForPrisma.prisma = _prismaInstance;
      globalForPrisma.prismaSchemaVersion = PRISMA_SCHEMA_VERSION;
    }
  }
  return _prismaInstance;
}

// Export the lazy db instance
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop: string | symbol) {
    const instance = getPrismaInstance();
    const value = (instance as any)[prop];
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
  has(_target, prop) {
    return prop in getPrismaInstance();
  },
});

// ── SQLite performance pragmas (local SQLite only) ──
let pragmasApplied = false;
async function applyPragmas() {
  if (pragmasApplied || isTurso() || !getDatabaseUrl()) return;
  pragmasApplied = true;
  try {
    const instance = getPrismaInstance();
    await instance.$queryRawUnsafe('PRAGMA journal_mode=WAL');
    await instance.$executeRawUnsafe('PRAGMA synchronous=NORMAL');
    await instance.$executeRawUnsafe('PRAGMA cache_size=-16000');
    await instance.$executeRawUnsafe('PRAGMA foreign_keys=ON');
    await instance.$executeRawUnsafe('PRAGMA temp_store=MEMORY');
  } catch {
    // Pragmas may not be supported in all environments
  }
}

if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
  setImmediate(() => applyPragmas());
}

// ── Export database type for health checks ──
export const DB_TYPE = isTurso() ? 'Turso (libSQL)' : 'SQLite (local)';
