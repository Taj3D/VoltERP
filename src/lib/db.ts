import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// If cached client is missing models (after schema update), clear it
if (globalForPrisma.prisma && typeof (globalForPrisma.prisma as any).auditLog === 'undefined') {
  globalForPrisma.prisma = undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

// Enable SQLite WAL mode for better concurrent read/write performance
db.$executeRawUnsafe('PRAGMA journal_mode=WAL').catch(() => {
  // WAL mode may not be supported in all environments
})

// Optimize SQLite performance pragmas
db.$executeRawUnsafe('PRAGMA synchronous=NORMAL').catch(() => {})
db.$executeRawUnsafe('PRAGMA cache_size=-64000').catch(() => {}) // 64MB cache
db.$executeRawUnsafe('PRAGMA foreign_keys=ON').catch(() => {})
db.$executeRawUnsafe('PRAGMA temp_store=MEMORY').catch(() => {})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
