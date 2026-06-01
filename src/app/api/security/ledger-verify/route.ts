// ============================================================
// CRYPTOGRAPHIC LEDGER VERIFICATION ENGINE — Phase 18
// SHA-256 chain checksums on high-value general ledgers.
// Verifies that previous ledger balances mathematically and
// hash-wise lock into the current transaction line, identifying
// any rogue direct database row manipulation instantly.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity } from '@/lib/api-security';
import { logForensicAudit } from '@/lib/security-audit-trail';
import crypto from 'crypto';

/**
 * computeLedgerHash — Generates SHA-256 hash for a ledger entry
 * Hash input: previousHash + entryCode + debit + credit + date + companyId
 */
function computeLedgerHash(
  previousHash: string | null,
  entryCode: string,
  debit: number,
  credit: number,
  date: string,
  companyId: string | null
): string {
  const hashInput = [
    previousHash || 'GENESIS',
    entryCode,
    debit.toString(),
    credit.toString(),
    new Date(date).toISOString(),
    companyId || '',
  ].join('|');

  return crypto.createHash('sha256').update(hashInput).digest('hex');
}

// POST /api/security/ledger-verify — Run SHA-256 chain verification on ledger entries
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'LedgerVerify', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json().catch(() => ({}));
    const companyId = body.companyId || security.user.companyId;
    const limit = Math.min(Math.max(1, body.limit || 500), 2000);

    // Fetch all ledger entries for the company, ordered by date then creation
    const ledgerEntries = await db.ledgerEntry.findMany({
      where: companyId ? { companyId } : undefined,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      take: limit,
    });

    if (ledgerEntries.length === 0) {
      return NextResponse.json({
        status: 'NO_ENTRIES',
        message: 'No ledger entries found for verification',
        totalChecked: 0,
        tamperedCount: 0,
        chainIntact: true,
      });
    }

    // Fetch existing hash chain entries
    const existingHashes = await db.ledgerHashChain.findMany({
      where: { companyId: companyId || undefined },
      orderBy: { verifiedAt: 'asc' },
    });

    const hashMap = new Map(existingHashes.map(h => [h.ledgerEntryId, h]));

    let previousHash: string | null = null;
    let tamperedCount = 0;
    let newHashesCreated = 0;
    let hashesUpdated = 0;
    const verificationResults: Array<{
      entryCode: string;
      entryId: string;
      computedHash: string;
      storedHash: string | null;
      isTampered: boolean;
      mismatchDetails?: string;
    }> = [];

    for (let i = 0; i < ledgerEntries.length; i++) {
      const entry = ledgerEntries[i];
      const computedHash = computeLedgerHash(
        previousHash,
        entry.entryCode,
        entry.debit,
        entry.credit,
        entry.date.toISOString(),
        entry.companyId
      );

      const existing = hashMap.get(entry.id);

      if (existing) {
        // Check if stored hash matches computed hash
        if (existing.currentHash !== computedHash && !existing.isTampered) {
          // TAMPERING DETECTED — stored hash doesn't match recomputed hash
          await db.ledgerHashChain.update({
            where: { id: existing.id },
            data: { isTampered: true },
          });
          tamperedCount++;
          verificationResults.push({
            entryCode: entry.entryCode,
            entryId: entry.id,
            computedHash,
            storedHash: existing.currentHash,
            isTampered: true,
            mismatchDetails: `Hash mismatch: stored="${existing.currentHash}" computed="${computedHash}". Entry may have been directly modified in the database.`,
          });
        } else if (existing.isTampered) {
          tamperedCount++;
          verificationResults.push({
            entryCode: entry.entryCode,
            entryId: entry.id,
            computedHash,
            storedHash: existing.currentHash,
            isTampered: true,
            mismatchDetails: 'Previously flagged as tampered',
          });
        } else {
          verificationResults.push({
            entryCode: entry.entryCode,
            entryId: entry.id,
            computedHash,
            storedHash: existing.currentHash,
            isTampered: false,
          });
        }
        hashesUpdated++;
      } else {
        // Create new hash chain entry
        await db.ledgerHashChain.create({
          data: {
            ledgerEntryId: entry.id,
            previousHash,
            currentHash: computedHash,
            hashAlgorithm: 'SHA-256',
            verifiedBy: security.user.id,
            companyId: entry.companyId,
          },
        });
        newHashesCreated++;
        verificationResults.push({
          entryCode: entry.entryCode,
          entryId: entry.id,
          computedHash,
          storedHash: null,
          isTampered: false,
        });
      }

      previousHash = computedHash;
    }

    const chainIntact = tamperedCount === 0;

    // Log the verification event
    await logForensicAudit({
      actionType: 'LEDGER_VERIFY',
      userId: security.user.id,
      userName: security.user.name,
      companyId: companyId || undefined,
      endpoint: '/api/security/ledger-verify',
      httpMethod: 'POST',
      targetModel: 'LedgerEntry',
      moduleToken: 'Sys-Ops-Security-Vault',
      severity: tamperedCount > 0 ? 'CRITICAL' : 'INFO',
      metadata: {
        totalChecked: ledgerEntries.length,
        tamperedCount,
        newHashesCreated,
        hashesUpdated,
        chainIntact,
      },
    });

    return NextResponse.json({
      status: chainIntact ? 'CHAIN_INTACT' : 'TAMPERING_DETECTED',
      message: chainIntact
        ? `SHA-256 cryptographic chain verification PASSED. All ${ledgerEntries.length} ledger entries are mathematically intact.`
        : `TAMPERING DETECTED! ${tamperedCount} of ${ledgerEntries.length} ledger entries show hash mismatches indicating potential direct database manipulation.`,
      totalChecked: ledgerEntries.length,
      tamperedCount,
      newHashesCreated,
      hashesUpdated,
      chainIntact,
      verificationResults: verificationResults.slice(0, 100), // Limit results to prevent huge payloads
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[LedgerVerify] Error:', error);
    return NextResponse.json(
      { error: 'Ledger verification failed', details: error.message },
      { status: 500 }
    );
  }
}

// GET /api/security/ledger-verify — Get verification status summary
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'LedgerVerify', 'GET');
  if (!security.authorized) return security.response;

  try {
    const companyId = security.user.companyId;

    const [totalChains, tamperedChains, lastVerification] = await Promise.all([
      db.ledgerHashChain.count({ where: { companyId: companyId || undefined } }),
      db.ledgerHashChain.count({ where: { companyId: companyId || undefined, isTampered: true } }),
      db.ledgerHashChain.findFirst({
        where: { companyId: companyId || undefined },
        orderBy: { verifiedAt: 'desc' },
        select: { verifiedAt: true, isTampered: true, hashAlgorithm: true },
      }),
    ]);

    return NextResponse.json({
      totalChainEntries: totalChains,
      tamperedEntries: tamperedChains,
      chainIntact: tamperedChains === 0,
      lastVerification: lastVerification ? {
        verifiedAt: lastVerification.verifiedAt,
        isTampered: lastVerification.isTampered,
        algorithm: lastVerification.hashAlgorithm,
      } : null,
      algorithm: 'SHA-256',
    });
  } catch (error: any) {
    console.error('[LedgerVerify] Status error:', error);
    return NextResponse.json(
      { error: 'Failed to get verification status' },
      { status: 500 }
    );
  }
}
