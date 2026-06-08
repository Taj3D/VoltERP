import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  maskFinancialArray,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// Valid bankType values
const VALID_BANK_TYPES = ['Bank', 'MFS', 'CashDrawer'] as const;
type BankType = (typeof VALID_BANK_TYPES)[number];

/**
 * Strip HTML tags from a string to prevent XSS in text fields.
 */
function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Banks', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;
  const role = security.user.role;

  try {
    const items = await db.bank.findMany({
      where: {
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        chartOfAccount: true,
        bankTransactions: {
          where: { isActive: true },
          select: { type: true, amount: true },
        },
      },
    });

    // Calculate currentBalance dynamically: openingBalance + deposits - withdrawals
    const computed = items.map((bank) => {
      const depositTotal = bank.bankTransactions
        .filter((t: any) => t.type === 'Deposit')
        .reduce((sum: number, t: any) => safeFinancialAdd(sum, t.amount), 0);
      const withdrawTotal = bank.bankTransactions
        .filter((t: any) => t.type === 'Withdraw' || t.type === 'Transfer')
        .reduce((sum: number, t: any) => safeFinancialAdd(sum, t.amount), 0);
      const computedBalance = safeFinancialSubtract(
        safeFinancialAdd(bank.openingBalance, depositTotal),
        withdrawTotal
      );
      // Use computed balance; if it differs from stored, update the record
      const { bankTransactions, ...bankData } = bank;
      return { ...bankData, currentBalance: computedBalance };
    });

    // Background: sync any stale currentBalance values
    computed.forEach(async (bank) => {
      const original = items.find((b) => b.id === bank.id);
      if (original && Math.abs(original.currentBalance - bank.currentBalance) > 0.01) {
        await db.bank
          .update({ where: { id: bank.id }, data: { currentBalance: bank.currentBalance } })
          .catch(() => {});
      }
    });

    // Apply VAT Auditor masking with extra fields
    const masked = maskFinancialArray(computed, role, ['accountNo', 'currentBalance', 'openingBalance']);

    return NextResponse.json(masked);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch banks' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Banks', 'POST');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const body = await request.json();

    // ── Batch mode support ──
    if (body.batchMode === true && Array.isArray(body.data)) {
      const records = await db.$transaction(async (tx) => {
        const created: any[] = [];
        for (const item of body.data) {
          const bankName = stripHtml(String(item.bankName || ''));
          const branch = item.branch ? stripHtml(String(item.branch)) : null;
          const accountNo = stripHtml(String(item.accountNo || ''));
          const accountHolder = stripHtml(String(item.accountHolder || ''));

          if (!bankName || !accountNo || !accountHolder) continue; // Skip invalid

          const bankType: BankType = item.bankType || 'Bank';
          if (!VALID_BANK_TYPES.includes(bankType)) continue;

          const rawOpening = Number(item.openingBalance ?? 0);
          if (rawOpening < 0) continue;
          const openingBalance = safeFinancialRound(rawOpening);

          // Duplicate account number check within company
          const existingAccount = await tx.bank.findFirst({
            where: {
              ...(companyId ? { companyId } : {}),
              accountNo,
              isActive: true,
            },
          });
          if (existingAccount) continue; // Skip duplicates in batch

          // COA auto-mapping (same as single mode)
          let assetsRoot = await tx.chartOfAccount.findFirst({
            where: { classification: 'Asset', parentAccountId: null, companyId: companyId || null, isActive: true },
          });
          if (!assetsRoot) {
            const assetsCount = await tx.chartOfAccount.count();
            assetsRoot = await tx.chartOfAccount.create({
              data: { code: `COA-${String(assetsCount + 1).padStart(5, '0')}`, name: 'Assets', classification: 'Asset', companyId: companyId || null, isActive: true },
            });
          }

          let liquidNode = await tx.chartOfAccount.findFirst({
            where: { name: 'Liquid/Cash Equivalents', parentAccountId: assetsRoot.id, companyId: companyId || null, isActive: true },
          });
          if (!liquidNode) {
            const liquidCount = await tx.chartOfAccount.count();
            liquidNode = await tx.chartOfAccount.create({
              data: { code: `COA-${String(liquidCount + 1).padStart(5, '0')}`, name: 'Liquid/Cash Equivalents', classification: 'Asset', parentAccountId: assetsRoot.id, companyId: companyId || null, isActive: true },
            });
          }

          const bankCoaCount = await tx.chartOfAccount.count();
          const bankCoaNode = await tx.chartOfAccount.create({
            data: {
              code: `COA-${String(bankCoaCount + 1).padStart(5, '0')}`,
              name: `${bankName} - ${accountNo}`,
              classification: 'Asset',
              parentAccountId: liquidNode.id,
              openingBalance,
              openingBalanceType: 'Dr',
              companyId: companyId || null,
              isActive: true,
            },
          });

          const bank = await tx.bank.create({
            data: {
              bankName,
              bankType,
              branch,
              accountNo,
              accountHolder,
              openingBalance,
              currentBalance: openingBalance,
              companyId: companyId || null,
              chartOfAccountId: bankCoaNode.id,
              isActive: item.isActive ?? true,
            },
            include: { chartOfAccount: true },
          });

          created.push(bank);
        }

        // Single audit log for batch
        await logUserActivity({
          tx: tx,
          action: 'IMPORT',
          module: 'Sys-Catalog-Core',
          recordId: 'BATCH',
          recordLabel: `Batch import: ${created.length} bank(s)`,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ count: created.length, names: created.map((b: any) => b.bankName), companyId }),
        });

        return created;
      });

      return NextResponse.json({ success: true, count: records.length, data: records }, { status: 201 });
    }

    // ── Text Sanitizer: strip HTML tags ──
    const bankName = stripHtml(String(body.bankName || ''));
    const branch = body.branch ? stripHtml(String(body.branch)) : null;
    const accountNo = stripHtml(String(body.accountNo || ''));
    const accountHolder = stripHtml(String(body.accountHolder || ''));

    // ── Required Field Validation ──
    if (!bankName) {
      return NextResponse.json(
        { error: 'bankName is required and cannot be empty' },
        { status: 400 }
      );
    }
    if (!accountNo) {
      return NextResponse.json(
        { error: 'accountNo is required and cannot be empty' },
        { status: 400 }
      );
    }

    // ── Bank Type Validation ──
    const bankType: BankType = body.bankType || 'Bank';
    if (!VALID_BANK_TYPES.includes(bankType)) {
      return NextResponse.json(
        { error: `Invalid bankType "${bankType}". Must be one of: ${VALID_BANK_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // ── Opening Balance Validation ──
    const rawOpening = Number(body.openingBalance ?? 0);
    if (rawOpening < 0) {
      return NextResponse.json(
        { error: 'Opening balance must be zero or positive.' },
        { status: 400 }
      );
    }
    const openingBalance = safeFinancialRound(rawOpening);

    // ── Duplicate account number check within company ──
    const existingAccount = await db.bank.findFirst({
      where: {
        ...(companyId ? { companyId } : {}),
        accountNo,
        isActive: true,
      },
    });
    if (existingAccount) {
      return NextResponse.json(
        { error: `A bank account with account number "${accountNo}" already exists in this company.` },
        { status: 409 }
      );
    }

    // ── COA Auto-Mapping + Bank Creation (atomic transaction with extended timeout) ──
    const record = await db.$transaction(async (tx) => {
      // Step 1: Find or create "Assets" root CoA node
      let assetsRoot = await tx.chartOfAccount.findFirst({
        where: {
          classification: 'Asset',
          parentAccountId: null,
          companyId: companyId || null,
          isActive: true,
        },
      });
      if (!assetsRoot) {
        const assetsCount = await tx.chartOfAccount.count();
        assetsRoot = await tx.chartOfAccount.create({
          data: {
            code: `COA-${String(assetsCount + 1).padStart(5, '0')}`,
            name: 'Assets',
            classification: 'Asset',
            companyId: companyId || null,
            isActive: true,
          },
        });
      }

      // Step 2: Find or create "Liquid/Cash Equivalents" child under Assets
      let liquidNode = await tx.chartOfAccount.findFirst({
        where: {
          name: 'Liquid/Cash Equivalents',
          parentAccountId: assetsRoot.id,
          companyId: companyId || null,
          isActive: true,
        },
      });
      if (!liquidNode) {
        const liquidCount = await tx.chartOfAccount.count();
        liquidNode = await tx.chartOfAccount.create({
          data: {
            code: `COA-${String(liquidCount + 1).padStart(5, '0')}`,
            name: 'Liquid/Cash Equivalents',
            classification: 'Asset',
            parentAccountId: assetsRoot.id,
            companyId: companyId || null,
            isActive: true,
          },
        });
      }

      // Step 3: Create a dedicated CoA node for this specific bank account
      const bankCoaCount = await tx.chartOfAccount.count();
      const bankCoaNode = await tx.chartOfAccount.create({
        data: {
          code: `COA-${String(bankCoaCount + 1).padStart(5, '0')}`,
          name: `${bankName} - ${accountNo}`,
          classification: 'Asset',
          parentAccountId: liquidNode.id,
          openingBalance: openingBalance,
          openingBalanceType: 'Dr',
          companyId: companyId || null,
          isActive: true,
        },
      });

      // Step 4: Create the Bank record with chartOfAccountId linked
      const bank = await tx.bank.create({
        data: {
          bankName,
          bankType,
          branch,
          accountNo,
          accountHolder,
          openingBalance,
          currentBalance: openingBalance,
          companyId: companyId || null,
          chartOfAccountId: bankCoaNode.id,
          isActive: body.isActive ?? true,
        },
        include: { chartOfAccount: true },
      });

      // Step 5: Log audit with module 'Sys-Catalog-Core'
      await logUserActivity({
          tx: tx,
        action: 'CREATE',
        module: 'Sys-Catalog-Core',
        recordId: bank.id,
        recordLabel: bank.bankName || bank.accountNo || bank.id,
        userId: security.user?.id || 'system',
        userName: security.user?.name || 'System',
        details: JSON.stringify({
          bankName: bank.bankName,
          bankType: bank.bankType,
          accountNo: bank.accountNo,
          openingBalance,
          currentBalance: openingBalance,
          chartOfAccountId: bankCoaNode.id,
          coaCode: bankCoaNode.code,
          coaName: bankCoaNode.name,
          companyId,
        }),
      });

      return bank;
    }, { timeout: 15000 });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create bank' },
      { status: 500 }
    );
  }
}
