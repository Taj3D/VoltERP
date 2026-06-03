import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose, maskForVatAuditor } from '@/lib/api-security';

// GET /api/cheques/[id] - Get single cheque with all relations
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Cheques', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const item = await db.cheque.findUnique({
      where: { id },
      include: {
        bank: true,
        toBank: true,
      },
    });

    if (!item) {
      return NextResponse.json(
        { error: 'Cheque not found' },
        { status: 404 }
      );
    }

    const role = security.user.role;
    const masked = maskForVatAuditor(item, role, ['amount']);

    return NextResponse.json(masked);
  } catch (error) {
    console.error('Error fetching cheque:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cheque' },
      { status: 500 }
    );
  }
}

// PUT /api/cheques/[id] - Update cheque with status transition handling
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Cheques', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
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

    // Fetch existing record
    const existing = await db.cheque.findUnique({
      where: { id },
      include: {
        bank: true,
        toBank: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Cheque not found' },
        { status: 404 }
      );
    }

    // Block amount changes after creation (amount is immutable once created)
    if (amount !== undefined && Number(amount) !== existing.amount) {
      return NextResponse.json(
        { error: 'Amount cannot be changed after creation' },
        { status: 400 }
      );
    }

    // Period-close lock check
    const checkDate = chequeDate ? new Date(chequeDate) : (existing.chequeDate || new Date());
    const periodLock = await checkPeriodClose(checkDate);
    if (periodLock) return periodLock;

    // Same-bank block if toBankId is being updated
    const effectiveToBankId = toBankId !== undefined ? (toBankId || null) : existing.toBankId;
    const effectiveBankId = bankId || existing.bankId;
    if (effectiveToBankId && effectiveToBankId === effectiveBankId) {
      return NextResponse.json(
        { error: 'Source and destination bank cannot be the same' },
        { status: 400 }
      );
    }

    // Determine if status is changing
    const newStatus = status || existing.status;
    const statusChanged = newStatus !== existing.status;
    const isCleared = statusChanged && newStatus === 'Cleared';
    const isBounced = statusChanged && newStatus === 'Bounced';

    // Prevent re-clearing or re-bouncing already processed cheques
    if (statusChanged && existing.status === 'Cleared' && newStatus !== 'Cleared') {
      return NextResponse.json(
        { error: 'Cannot change status of a cleared cheque. Please delete and recreate if needed.' },
        { status: 400 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      // ── Status transition: CLEARED ──────────────────────────
      if (isCleared) {
        const chequeAmount = existing.amount;
        const chequeDateValue = existing.chequeDate;

        if (existing.type === 'Incoming') {
          // Incoming cheque cleared: increment bank.currentBalance by amount
          const bank = await tx.bank.findUnique({ where: { id: existing.bankId } });
          if (!bank) {
            throw new Error(`Bank with id ${existing.bankId} not found`);
          }

          const updatedBalance = bank.currentBalance + chequeAmount;
          await tx.bank.update({
            where: { id: existing.bankId },
            data: { currentBalance: updatedBalance },
          });

          // If toBankId is provided and Incoming: also increment toBank.currentBalance
          if (existing.toBankId) {
            const toBank = await tx.bank.findUnique({ where: { id: existing.toBankId } });
            if (!toBank) {
              throw new Error(`Destination bank with id ${existing.toBankId} not found`);
            }
            const toBankUpdatedBalance = toBank.currentBalance + chequeAmount;
            await tx.bank.update({
              where: { id: existing.toBankId },
              data: { currentBalance: toBankUpdatedBalance },
            });
          }

          // Create LedgerEntry pair: Dr: Bank, Cr: Cheque Payable
          const bankAccountName = bank.bankName;
          await tx.ledgerEntry.create({
            data: {
              date: chequeDateValue,
              account: bankAccountName,
              particulars: `Cheque cleared - ${existing.chequeCode}`,
              debit: chequeAmount,
              credit: 0,
              reference: existing.chequeCode,
              referenceType: 'Cheque',
            },
          });
          await tx.ledgerEntry.create({
            data: {
              date: chequeDateValue,
              account: 'Cheque Payable',
              particulars: `Cheque cleared - ${existing.chequeCode}`,
              debit: 0,
              credit: chequeAmount,
              reference: existing.chequeCode,
              referenceType: 'Cheque',
            },
          });

          // If toBankId: create additional ledger entry for the destination bank
          if (existing.toBankId) {
            const toBank = await tx.bank.findUnique({ where: { id: existing.toBankId } });
            if (toBank) {
              await tx.ledgerEntry.create({
                data: {
                  date: chequeDateValue,
                  account: toBank.bankName,
                  particulars: `Cheque cleared (inter-bank deposit) - ${existing.chequeCode}`,
                  debit: chequeAmount,
                  credit: 0,
                  reference: existing.chequeCode,
                  referenceType: 'Cheque',
                },
              });
              await tx.ledgerEntry.create({
                data: {
                  date: chequeDateValue,
                  account: 'Cash in Hand',
                  particulars: `Cheque cleared (inter-bank deposit) - ${existing.chequeCode}`,
                  debit: 0,
                  credit: chequeAmount,
                  reference: existing.chequeCode,
                  referenceType: 'Cheque',
                },
              });
            }
          }
        } else if (existing.type === 'Outgoing') {
          // Outgoing cheque cleared: decrement source bank.currentBalance (with sufficient balance check)
          const bank = await tx.bank.findUnique({ where: { id: existing.bankId } });
          if (!bank) {
            throw new Error(`Bank with id ${existing.bankId} not found`);
          }

          if (bank.currentBalance < chequeAmount) {
            throw new Error(
              `Insufficient bank balance. Available: ${bank.currentBalance}, Requested: ${chequeAmount}`
            );
          }

          const updatedBalance = bank.currentBalance - chequeAmount;
          await tx.bank.update({
            where: { id: existing.bankId },
            data: { currentBalance: updatedBalance },
          });

          // Create LedgerEntry pair: Dr: Cheque Receivable, Cr: Bank
          await tx.ledgerEntry.create({
            data: {
              date: chequeDateValue,
              account: 'Cheque Receivable',
              particulars: `Cheque cleared - ${existing.chequeCode}`,
              debit: chequeAmount,
              credit: 0,
              reference: existing.chequeCode,
              referenceType: 'Cheque',
            },
          });
          await tx.ledgerEntry.create({
            data: {
              date: chequeDateValue,
              account: bank.bankName,
              particulars: `Cheque cleared - ${existing.chequeCode}`,
              debit: 0,
              credit: chequeAmount,
              reference: existing.chequeCode,
              referenceType: 'Cheque',
            },
          });
        }

        // Update the cheque status to Cleared
        const updated = await tx.cheque.update({
          where: { id },
          data: {
            status: 'Cleared',
            ...(chequeNo !== undefined && { chequeNo }),
            ...(chequeDate && { chequeDate: new Date(chequeDate) }),
            ...(toBankId !== undefined && { toBankId: toBankId || null }),
            ...(payee !== undefined && { payee: payee || null }),
            ...(description !== undefined && { description: description || null }),
          },
          include: {
            bank: true,
            toBank: true,
          },
        });

        // Create AuditLog with module 'Cheques', action 'CLEAR_CHEQUE'
        await tx.auditLog.create({
          data: {
            action: 'CLEAR_CHEQUE',
            module: 'Cheques',
            recordId: id,
            recordLabel: existing.chequeCode,
            userId: security.user.id,
            userName: security.user.name,
            details: JSON.stringify({
              type: existing.type,
              amount: existing.amount,
              bankId: existing.bankId,
              bankName: existing.bank?.bankName,
              toBankId: existing.toBankId || null,
              toBankName: existing.toBank?.bankName || null,
              previousStatus: existing.status,
              newStatus: 'Cleared',
            }),
          },
        });

        return updated;
      }

      // ── Status transition: BOUNCED ──────────────────────────
      if (isBounced) {
        // Create AuditLog noting the bounce. No balance changes (funds were never deposited).
        const updated = await tx.cheque.update({
          where: { id },
          data: {
            status: 'Bounced',
            ...(chequeNo !== undefined && { chequeNo }),
            ...(chequeDate && { chequeDate: new Date(chequeDate) }),
            ...(toBankId !== undefined && { toBankId: toBankId || null }),
            ...(payee !== undefined && { payee: payee || null }),
            ...(description !== undefined && { description: description || null }),
          },
          include: {
            bank: true,
            toBank: true,
          },
        });

        await tx.auditLog.create({
          data: {
            action: 'BOUNCE_CHEQUE',
            module: 'Cheques',
            recordId: id,
            recordLabel: existing.chequeCode,
            userId: security.user.id,
            userName: security.user.name,
            details: JSON.stringify({
              type: existing.type,
              amount: existing.amount,
              bankId: existing.bankId,
              bankName: existing.bank?.bankName,
              previousStatus: existing.status,
              newStatus: 'Bounced',
              note: 'Cheque bounced. No balance changes applied as funds were never deposited.',
            }),
          },
        });

        return updated;
      }

      // ── Regular update (no status transition or non-cleared/bounced status change) ──
      const updated = await tx.cheque.update({
        where: { id },
        data: {
          ...(bankId && { bankId }),
          ...(chequeNo !== undefined && { chequeNo }),
          ...(chequeDate && { chequeDate: new Date(chequeDate) }),
          ...(type && { type }),
          ...(toBankId !== undefined && { toBankId: toBankId || null }),
          ...(payee !== undefined && { payee: payee || null }),
          ...(description !== undefined && { description: description || null }),
          ...(status && { status }),
        },
        include: {
          bank: true,
          toBank: true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Cheques',
          recordId: id,
          recordLabel: existing.chequeCode,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            updatedFields: Object.keys(body),
            previousStatus: existing.status,
          }),
        },
      });

      return updated;
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error updating cheque:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to update cheque';
    const statusCode =
      message.includes('Insufficient') ||
      message.includes('not found') ||
      message.includes('cannot be changed') ||
      message.includes('cannot be the same') ||
      message.includes('Cannot change status')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}

// DELETE /api/cheques/[id] - Soft-delete with balance reversal for cleared cheques
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Cheques', 'DELETE');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;

    const existing = await db.cheque.findUnique({
      where: { id },
      include: {
        bank: true,
        toBank: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Cheque not found' },
        { status: 404 }
      );
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Cheque is already deleted' },
        { status: 400 }
      );
    }

    // Period-close lock check
    const periodLock = await checkPeriodClose(existing.chequeDate || new Date());
    if (periodLock) return periodLock;

    await db.$transaction(async (tx) => {
      // Soft delete
      await tx.cheque.update({
        where: { id },
        data: { isActive: false },
      });

      // If cheque was Cleared, reverse the bank balance changes
      if (existing.status === 'Cleared') {
        if (existing.type === 'Incoming') {
          // Incoming cleared had incremented bank.currentBalance → decrement to reverse
          await tx.bank.update({
            where: { id: existing.bankId },
            data: { currentBalance: { decrement: existing.amount } },
          });

          // If toBankId was set, also reverse the toBank increment
          if (existing.toBankId) {
            await tx.bank.update({
              where: { id: existing.toBankId },
              data: { currentBalance: { decrement: existing.amount } },
            });
          }
        } else if (existing.type === 'Outgoing') {
          // Outgoing cleared had decremented bank.currentBalance → increment to reverse
          await tx.bank.update({
            where: { id: existing.bankId },
            data: { currentBalance: { increment: existing.amount } },
          });
        }
      }

      // Create AuditLog
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Cheques',
          recordId: id,
          recordLabel: existing.chequeCode,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            softDelete: true,
            type: existing.type,
            amount: existing.amount,
            status: existing.status,
            bankId: existing.bankId,
            bankName: existing.bank?.bankName,
            toBankId: existing.toBankId || null,
            toBankName: existing.toBank?.bankName || null,
            balanceReversed: existing.status === 'Cleared',
          }),
        },
      });
    });

    return NextResponse.json({ message: 'Cheque deleted successfully' });
  } catch (error) {
    console.error('Error deleting cheque:', error);
    return NextResponse.json(
      { error: 'Failed to delete cheque' },
      { status: 500 }
    );
  }
}
