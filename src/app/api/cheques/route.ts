import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose, maskForVatAuditor } from '@/lib/api-security';

// GET /api/cheques - List all cheques with bank and toBank relations
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Cheques', 'GET');
  if (!security.authorized) return security.response;

  const role = security.user.role;

  try {
    const items = await db.cheque.findMany({
      where: { isActive: true },
      include: {
        bank: true,
        toBank: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Apply VAT Auditor masking to the amount field
    const masked = items.map((item) =>
      maskForVatAuditor(item, role, ['amount'])
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('Error fetching cheques:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cheques' },
      { status: 500 }
    );
  }
}

// POST /api/cheques - Create a new cheque with auto-generated chequeCode
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Cheques', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const {
      bankId,
      chequeNo,
      chequeDate,
      amount,
      type,
      toBankId,
      payee,
      description,
      status,
    } = body;

    // Validate required fields
    if (!bankId || !chequeNo || !chequeDate || amount === undefined || amount === null || !type) {
      return NextResponse.json(
        { error: 'bankId, chequeNo, chequeDate, amount, and type are required' },
        { status: 400 }
      );
    }

    // Block negative, zero, or null amount
    const transactionAmount = Number(amount);
    if (isNaN(transactionAmount) || transactionAmount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be a positive number' },
        { status: 400 }
      );
    }

    // Validate type
    if (!['Incoming', 'Outgoing'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid cheque type. Must be "Incoming" or "Outgoing".' },
        { status: 400 }
      );
    }

    // Same-bank block: if toBankId is provided and equals bankId
    if (toBankId && toBankId === bankId) {
      return NextResponse.json(
        { error: 'Source and destination bank cannot be the same' },
        { status: 400 }
      );
    }

    // Period-close lock check
    const chequeDateValue = new Date(chequeDate);
    const periodLock = await checkPeriodClose(chequeDateValue);
    if (periodLock) return periodLock;

    const result = await db.$transaction(async (tx) => {
      // Auto-generate chequeCode as CHQ-XXXXX (5-digit zero-padded, sequential)
      const lastCheque = await tx.cheque.findFirst({
        orderBy: { chequeCode: 'desc' },
        select: { chequeCode: true },
      });

      let nextNum = 1;
      if (lastCheque?.chequeCode) {
        const match = lastCheque.chequeCode.match(/CHQ-(\d+)/);
        if (match) {
          nextNum = parseInt(match[1], 10) + 1;
        }
      }
      const chequeCode = `CHQ-${String(nextNum).padStart(5, '0')}`;

      // For Outgoing cheques: validate source bank has sufficient balance (like Withdraw)
      if (type === 'Outgoing') {
        const sourceBank = await tx.bank.findUnique({ where: { id: bankId } });
        if (!sourceBank) {
          throw new Error(`Bank with id ${bankId} not found`);
        }
        if (sourceBank.currentBalance < transactionAmount) {
          throw new Error(
            `Insufficient bank balance. Available: ${sourceBank.currentBalance}, Requested: ${transactionAmount}`
          );
        }
      }

      // Validate source bank exists for Incoming as well
      if (type === 'Incoming') {
        const sourceBank = await tx.bank.findUnique({ where: { id: bankId } });
        if (!sourceBank) {
          throw new Error(`Bank with id ${bankId} not found`);
        }
      }

      // Create the Cheque record
      // companyId multi-tenant: NOT added on create (let withApiSecurity handle tenant context)
      const cheque = await tx.cheque.create({
        data: {
          chequeCode,
          bankId,
          chequeNo,
          chequeDate: chequeDateValue,
          amount: transactionAmount,
          type,
          status: status || 'Pending',
          toBankId: toBankId || null,
          payee: payee || null,
          description: description || null,
          isActive: true,
        },
        include: {
          bank: true,
          toBank: true,
        },
      });

      // Create AuditLog with module 'Cheques'
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Cheques',
          recordId: cheque.id,
          recordLabel: chequeCode,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            chequeCode,
            type,
            bankId,
            chequeNo,
            amount: transactionAmount,
            toBankId: toBankId || null,
            status: cheque.status,
          }),
        },
      });

      return cheque;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating cheque:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to create cheque';
    const statusCode =
      message.includes('Insufficient') ||
      message.includes('not found') ||
      message.includes('required') ||
      message.includes('Invalid') ||
      message.includes('positive') ||
      message.includes('cannot be the same')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
