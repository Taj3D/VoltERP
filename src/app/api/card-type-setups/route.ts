import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, maskForVatAuditor } from '@/lib/api-security';
import type { UserRole } from '@/lib/api-security';

// Activity logging helper — fire-and-forget
async function logActivity(userEmail: string, actionType: string, module: string, details: string) {
  try {
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/user-activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Email': userEmail },
      body: JSON.stringify({ actionType, module, details }),
    });
  } catch {}
}

// ============================================================
// GET /api/card-type-setups — List all card type setups for the authenticated user's company
// ============================================================
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'CardTypeSetups', 'GET');
  if (!security.authorized) return security.response;

  try {
    const companyId = security.user.companyId;
    const role = security.user.role as UserRole;

    const items = await db.cardTypeSetup.findMany({
      where: {
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        paymentOption: { select: { id: true, name: true } },
        cardType: { select: { id: true, name: true } },
        company: { select: { id: true, name: true } },
      },
    });

    // Apply VAT auditor masking on chargePercentage + compute display fields
    const enrichedItems = items.map((item) => {
      // Apply VAT auditor masking for chargePercentage
      const masked = maskForVatAuditor(
        item as unknown as Record<string, unknown>,
        role,
        ['chargePercentage'] // Sensitive fields: charge percentage controls financial processing charges
      );

      // Compute formatted percentage display
      const maskedRecord = masked as typeof item & { chargePercentageFormatted?: string };
      if (role === 'vat_auditor') {
        maskedRecord.chargePercentageFormatted = 'N/A (Audit Mode)';
      } else {
        maskedRecord.chargePercentageFormatted = `${Number(item.chargePercentage).toFixed(2)}%`;
      }

      // Handle empty/null optional fields for display consistency
      if (!maskedRecord.company) {
        (maskedRecord as Record<string, unknown>).company = null;
      }

      return maskedRecord;
    });

    return NextResponse.json(enrichedItems);
  } catch (error) {
    console.error('Error fetching card type setups:', error);
    return NextResponse.json(
      { error: 'Failed to fetch card type setups' },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/card-type-setups — Create single or batch (admin/manager only)
// ============================================================
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'CardTypeSetups', 'POST');
  if (!security.authorized) return security.response;

  // RBAC: Only admin or manager can create; sr, dealer → 403
  // Card Settlement Tariffs control financial processing charges
  if (!['admin', 'manager'].includes(security.user.role)) {
    return NextResponse.json(
      { error: 'Access denied. Only admin or manager can create card type setups.' },
      { status: 403 }
    );
  }

  const companyId = security.user.companyId;

  try {
    const body = await request.json();

    // ----------------------------------------------------------
    // BATCH MODE — CSV import
    // ----------------------------------------------------------
    if (body.batchMode && Array.isArray(body.data)) {
      const results: unknown[] = [];
      const errors: { row: number; error: string }[] = [];
      // Track composites within batch for intra-batch duplicate detection
      const seenComposites = new Set<string>();

      for (let i = 0; i < body.data.length; i++) {
        try {
          const data = { ...body.data[i] };

          // Inject companyId from authenticated user into every row
          data.companyId = companyId || null;

          const paymentOptionId = (data.paymentOptionId as string || '').trim();
          const cardTypeId = (data.cardTypeId as string || '').trim();

          if (!paymentOptionId || !cardTypeId) {
            errors.push({ row: i + 1, error: 'paymentOptionId and cardTypeId are required' });
            continue;
          }

          // Composite duplicate check within batch (paymentOptionId + cardTypeId + companyId)
          const compositeKey = `${paymentOptionId}|${cardTypeId}|${companyId || ''}`;
          if (seenComposites.has(compositeKey)) {
            errors.push({
              row: i + 1,
              error: `Duplicate payment option + card type combination within batch`,
            });
            continue;
          }

          // Composite duplicate check against database (paymentOptionId + cardTypeId + companyId)
          if (companyId) {
            const existing = await db.cardTypeSetup.findFirst({
              where: {
                paymentOptionId,
                cardTypeId,
                companyId,
                isActive: true,
              },
            });
            if (existing) {
              errors.push({
                row: i + 1,
                error: 'A card type setup with this payment option and card type already exists in your company.',
              });
              continue;
            }
          }

          seenComposites.add(compositeKey);

          const record = await db.cardTypeSetup.create({
            data: {
              paymentOptionId,
              cardTypeId,
              chargePercentage: typeof data.chargePercentage === 'number' ? data.chargePercentage : 0,
              bankServiceCharge: typeof data.bankServiceCharge === 'number' ? data.bankServiceCharge : 0,
              customerConvFee: typeof data.customerConvFee === 'number' ? data.customerConvFee : 0,
              companyId: data.companyId,
              isActive: data.isActive !== undefined ? data.isActive : true,
            },
            include: {
              paymentOption: { select: { id: true, name: true } },
              cardType: { select: { id: true, name: true } },
            },
          });
          results.push(record);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Insert failed';
          errors.push({ row: i + 1, error: message });
        }
      }

      // Activity log for batch import — module token "Payment-Gateway-Setup", actionType "IMPORT_CSV"
      logActivity(
        security.user.email,
        'IMPORT_CSV',
        'Payment-Gateway-Setup',
        `Batch import: ${results.length} succeeded, ${errors.length} failed`
      );

      return NextResponse.json(
        { imported: results.length, failed: errors.length, errors, data: results },
        { status: 201 }
      );
    }

    // ----------------------------------------------------------
    // SINGLE RECORD MODE
    // ----------------------------------------------------------
    const { paymentOptionId, cardTypeId, chargePercentage, isActive } = body;

    if (!paymentOptionId || !cardTypeId) {
      return NextResponse.json(
        { error: 'paymentOptionId and cardTypeId are required' },
        { status: 400 }
      );
    }

    // Composite duplicate check: paymentOptionId + cardTypeId + companyId
    if (companyId) {
      const existing = await db.cardTypeSetup.findFirst({
        where: {
          paymentOptionId,
          cardTypeId,
          companyId,
          isActive: true,
        },
      });
      if (existing) {
        return NextResponse.json(
          { error: 'A card type setup with this payment option and card type already exists in your company.' },
          { status: 409 }
        );
      }
    }

    const item = await db.$transaction(async (tx) => {
      const record = await tx.cardTypeSetup.create({
        data: {
          paymentOptionId,
          cardTypeId,
          chargePercentage: chargePercentage ?? 0,
          bankServiceCharge: body.bankServiceCharge ?? 0,
          customerConvFee: body.customerConvFee ?? 0,
          companyId: companyId || null,
          isActive: isActive !== undefined ? isActive : true,
        },
        include: {
          paymentOption: { select: { id: true, name: true } },
          cardType: { select: { id: true, name: true } },
        },
      });

      // Audit log entry
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'CardTypeSetup',
          recordId: record.id,
          recordLabel: `${record.paymentOption?.name || record.id} - ${record.cardType?.name || record.id}`,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({ paymentOptionId, cardTypeId, chargePercentage: chargePercentage ?? 0, bankServiceCharge: body.bankServiceCharge ?? 0, customerConvFee: body.customerConvFee ?? 0, companyId }),
        },
      });

      return record;
    });

    // Activity logging — fire-and-forget, module token "Payment-Gateway-Setup"
    logActivity(
      security.user.email,
      'CREATE',
      'Payment-Gateway-Setup',
      `Created card type setup "${item.paymentOption?.name || item.id} - ${item.cardType?.name || item.id}" (ID: ${item.id})`
    );

    // Add computed display field to response
    const responseItem = {
      ...item,
      chargePercentageFormatted: `${Number(item.chargePercentage).toFixed(2)}%`,
    };

    return NextResponse.json(responseItem, { status: 201 });
  } catch (error) {
    console.error('Error creating card type setup:', error);
    return NextResponse.json(
      { error: 'Failed to create card type setup' },
      { status: 500 }
    );
  }
}
