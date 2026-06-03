// ============================================================
// SMS CAMPAIGNS API ROUTE
// Multi-tenant companyId isolation, RBAC, VAT Auditor masking,
// SMS segment computation, Activity logging with SMS-Campaign-Marketing
// module token, CSV import with Bangladesh phone validation
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  maskSmsArray,
  computeSmsSegments,
  safeFinancialRound,
  formatFinancialField,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';
import Papa from 'papaparse';

// Valid target groups
const VALID_TARGET_GROUPS = [
  'All',
  'Customers',
  'Dealers',
  'Suppliers',
  'Employees',
  'Custom',
] as const;

// Valid campaign statuses
const VALID_STATUSES = [
  'Draft',
  'Scheduled',
  'Sending',
  'Completed',
  'Failed',
  'Cancelled',
] as const;

// Bangladesh phone number regex
const BD_PHONE_REGEX = /^(\+880|880|0)?1[3-9]\d{8}$/;

// Helper: auto-generate code CMP-XXXXX (collision-safe: findMany + Math.max)
async function generateCampaignCode(): Promise<string> {
  const allRecords = await db.smsCampaign.findMany({ select: { code: true } });
  let maxNum = 0;
  for (const r of allRecords) {
    const match = r.code?.match(/CMP-(\d+)/);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  }
  return `CMP-${String(maxNum + 1).padStart(5, '0')}`;
}

// Helper: convert empty string to null
function nullIfEmpty(val: string | undefined | null): string | null {
  if (val === undefined || val === null || val.trim() === '') return null;
  return val;
}

// Helper: count recipients from database based on targetGroup
async function countRecipients(targetGroup: string, companyId: string | null): Promise<number> {
  const companyFilter = companyId ? { companyId, isActive: true } : { isActive: true };

  switch (targetGroup) {
    case 'Customers':
      return db.customer.count({ where: { ...companyFilter, customerType: 'Regular' } });
    case 'Dealers':
      return db.customer.count({ where: { ...companyFilter, customerType: 'Dealer' } });
    case 'Suppliers':
      return db.supplier.count({ where: companyFilter });
    case 'Employees':
      return db.employee.count({ where: companyFilter });
    case 'All': {
      const [customers, suppliers, employees] = await Promise.all([
        db.customer.count({ where: companyFilter }),
        db.supplier.count({ where: companyFilter }),
        db.employee.count({ where: companyFilter }),
      ]);
      return customers + suppliers + employees;
    }
    default:
      return 0;
  }
}

// GET /api/sms-campaigns — List all campaigns for current tenant
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsLogs', 'GET');
  if (!security.authorized) return security.response;

  try {
    const companyId = security.user.companyId;
    const { searchParams } = new URL(request.url);

    const where: Record<string, unknown> = { isActive: true };
    if (companyId) {
      where.companyId = companyId;
    }

    // Optional filters
    const status = searchParams.get('status');
    if (status && VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      where.status = status;
    }

    const targetGroup = searchParams.get('targetGroup');
    if (targetGroup && VALID_TARGET_GROUPS.includes(targetGroup as typeof VALID_TARGET_GROUPS[number])) {
      where.targetGroup = targetGroup;
    }

    const items = await db.smsCampaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Compute summary stats
    const totalCampaigns = items.length;
    const activeCampaigns = items.filter((i) => ['Draft', 'Scheduled', 'Sending'].includes(i.status)).length;
    const completedCampaigns = items.filter((i) => i.status === 'Completed').length;
    const totalRecipients = items.reduce((sum, i) => sum + i.recipientCount, 0);
    const totalCost = items.reduce((sum, i) => sum + i.totalCost, 0);

    // Apply VAT Auditor masking + format empty fields
    const masked = maskSmsArray(
      items.map((item) => ({
        ...item,
        description: formatFinancialField(item.description),
        targetFilter: formatFinancialField(item.targetFilter),
      })),
      security.user.role,
      ['costPerSms', 'totalCost', 'recipientCount', 'sentCount', 'deliveredCount', 'failedCount']
    );

    return NextResponse.json({
      items: masked,
      summary: {
        totalCampaigns,
        activeCampaigns,
        completedCampaigns,
        totalRecipients,
        totalCost: safeFinancialRound(totalCost),
      },
    });
  } catch (error) {
    console.error('[SmsCampaigns] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch campaigns' },
      { status: 500 }
    );
  }
}

// POST /api/sms-campaigns — Create campaign or CSV import
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsLogs', 'POST');
  if (!security.authorized) return security.response;

  const { searchParams } = new URL(request.url);
  const isImport = searchParams.get('import') === 'true';

  // CSV import mode
  if (isImport) {
    return handleCsvImport(request, security);
  }

  // Normal campaign creation
  return handleCreate(request, security);
}

// Handler: Create campaign
async function handleCreate(
  request: NextRequest,
  security: { authorized: true; user: { id: string; email: string; name: string; role: string; companyId: string | null } }
) {
  try {
    const body = await request.json();
    const companyId = security.user.companyId;

    // Validate required fields
    const { name, message } = body;
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json(
        { error: 'Missing required field: name' },
        { status: 400 }
      );
    }

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return NextResponse.json(
        { error: 'Missing required field: message' },
        { status: 400 }
      );
    }

    // Validate targetGroup
    const targetGroup = body.targetGroup || 'All';
    if (!VALID_TARGET_GROUPS.includes(targetGroup as typeof VALID_TARGET_GROUPS[number])) {
      return NextResponse.json(
        { error: `Invalid targetGroup. Must be one of: ${VALID_TARGET_GROUPS.join(', ')}` },
        { status: 400 }
      );
    }

    // Compute SMS segments for message
    const { charCount, isUnicode, segmentCount } = computeSmsSegments(message);

    // Count recipients from database based on targetGroup
    const recipientCount = await countRecipients(targetGroup, companyId);

    // Snapshot costPerSms from active SmsSetting
    let costPerSms = 0;
    const activeSetting = await db.smsSetting.findFirst({
      where: {
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    if (activeSetting) {
      costPerSms = isUnicode ? activeSetting.unicodeRate : activeSetting.ratePerSms;
    }

    // Compute total cost
    const totalCost = safeFinancialRound(recipientCount * segmentCount * costPerSms);

    // Auto-generate code
    const code = await generateCampaignCode();

    const item = await db.$transaction(async (tx) => {
      const record = await tx.smsCampaign.create({
        data: {
          code,
          name: name.trim(),
          description: nullIfEmpty(body.description),
          message: message.trim(),
          charCount,
          isUnicode,
          segmentCount,
          targetGroup,
          targetFilter: nullIfEmpty(body.targetFilter),
          recipientCount,
          sentCount: 0,
          deliveredCount: 0,
          failedCount: 0,
          costPerSms,
          totalCost,
          status: body.status || 'Draft',
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
          ...(companyId && { companyId }),
        },
      });

      // Activity log with SMS-Campaign-Marketing module token
      await logUserActivity({
        tx,
        action: 'CREATE',
        module: 'SMS-Campaign-Marketing',
        recordId: record.id,
        recordLabel: record.code,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          code: record.code,
          name: record.name,
          targetGroup: record.targetGroup,
          recipientCount: record.recipientCount,
          charCount: record.charCount,
          isUnicode: record.isUnicode,
          segmentCount: record.segmentCount,
          costPerSms: record.costPerSms,
          totalCost: record.totalCost,
          status: record.status,
        }),
      });

      return record;
    });

    // Apply VAT Auditor masking
    const masked = maskSmsArray(
      [{
        ...item,
        description: formatFinancialField(item.description),
        targetFilter: formatFinancialField(item.targetFilter),
      }],
      security.user.role,
      ['costPerSms', 'totalCost', 'recipientCount', 'sentCount', 'deliveredCount', 'failedCount']
    );

    return NextResponse.json(masked[0], { status: 201 });
  } catch (error) {
    console.error('[SmsCampaigns] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create campaign' },
      { status: 500 }
    );
  }
}

// Handler: CSV import for bulk SMS
async function handleCsvImport(
  request: NextRequest,
  security: { authorized: true; user: { id: string; email: string; name: string; role: string; companyId: string | null } }
) {
  try {
    const companyId = security.user.companyId;
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'No CSV file provided. Upload a file with the key "file".' },
        { status: 400 }
      );
    }

    const csvText = await file.text();
    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      trimHeaders: true,
    });

    if (!parsed.data || parsed.data.length === 0) {
      return NextResponse.json(
        { error: 'CSV file is empty or has no valid rows.' },
        { status: 400 }
      );
    }

    // Check for required phone column
    const headers = parsed.meta.fields || [];
    if (!headers.includes('phone')) {
      return NextResponse.json(
        { error: 'CSV must have a "phone" column.' },
        { status: 400 }
      );
    }

    const validPhones: string[] = [];
    const errors: { row: number; phone: string; reason: string }[] = [];
    let fieldErrors = 0;

    for (let i = 0; i < parsed.data.length; i++) {
      const row = parsed.data[i] as Record<string, string>;
      const phone = row.phone ? String(row.phone).trim() : '';

      // Validate phone is not null/empty
      if (!phone) {
        errors.push({ row: i + 1, phone: '', reason: 'Phone number is empty' });
        fieldErrors++;
        continue;
      }

      // Validate phone format (Bangladesh)
      if (!BD_PHONE_REGEX.test(phone)) {
        errors.push({ row: i + 1, phone, reason: 'Invalid Bangladesh phone format' });
        fieldErrors++;
        continue;
      }

      // Block rows with null cost if cost column present
      if (headers.includes('cost') && (row.cost === null || row.cost === undefined || row.cost === '')) {
        errors.push({ row: i + 1, phone, reason: 'Cost column is present but value is null' });
        fieldErrors++;
        continue;
      }

      validPhones.push(phone);
    }

    return NextResponse.json({
      imported: validPhones.length,
      failed: errors.length,
      validPhones,
      errors,
      fieldErrors,
    });
  } catch (error) {
    console.error('[SmsCampaigns] CSV import error:', error);
    return NextResponse.json(
      { error: 'Failed to import CSV' },
      { status: 500 }
    );
  }
}
