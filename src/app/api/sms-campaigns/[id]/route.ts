// ============================================================
// SMS CAMPAIGNS [id] API ROUTE
// Multi-tenant companyId isolation, RBAC, VAT Auditor masking,
// Campaign launch with SmsLog creation, Activity logging with
// SMS-Campaign-Marketing module token
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
import { dispatchSmsBatch, buildGatewayConfig } from '@/lib/sms-gateway-dispatcher';

// Valid campaign statuses
const VALID_STATUSES = [
  'Draft',
  'Scheduled',
  'Sending',
  'Completed',
  'Failed',
  'Cancelled',
] as const;

// Valid target groups
const VALID_TARGET_GROUPS = [
  'All',
  'Customers',
  'Dealers',
  'Suppliers',
  'Employees',
  'Custom',
] as const;

// Helper: convert empty string to null
function nullIfEmpty(val: string | undefined | null): string | null {
  if (val === undefined || val === null || val.trim() === '') return null;
  return val;
}

// Helper: look up recipients from database based on targetGroup
async function getRecipients(
  targetGroup: string,
  companyId: string | null
): Promise<{ phone: string; name: string; id: string }[]> {
  const companyFilter = companyId ? { companyId, isActive: true } : { isActive: true };
  const recipients: { phone: string; name: string; id: string }[] = [];

  switch (targetGroup) {
    case 'Customers': {
      const customers = await db.customer.findMany({
        where: { ...companyFilter, customerType: 'Regular', phone: { not: null } },
        select: { id: true, name: true, phone: true },
      });
      customers.forEach((c) => {
        if (c.phone) recipients.push({ phone: c.phone, name: c.name, id: c.id });
      });
      break;
    }
    case 'Dealers': {
      const dealers = await db.customer.findMany({
        where: { ...companyFilter, customerType: 'Dealer', phone: { not: null } },
        select: { id: true, name: true, phone: true },
      });
      dealers.forEach((c) => {
        if (c.phone) recipients.push({ phone: c.phone, name: c.name, id: c.id });
      });
      break;
    }
    case 'Suppliers': {
      const suppliers = await db.supplier.findMany({
        where: { ...companyFilter, phone: { not: null } },
        select: { id: true, name: true, phone: true },
      });
      suppliers.forEach((s) => {
        if (s.phone) recipients.push({ phone: s.phone, name: s.name, id: s.id });
      });
      break;
    }
    case 'Employees': {
      const employees = await db.employee.findMany({
        where: { ...companyFilter, phone: { not: null } },
        select: { id: true, name: true, phone: true },
      });
      employees.forEach((e) => {
        if (e.phone) recipients.push({ phone: e.phone, name: e.name, id: e.id });
      });
      break;
    }
    case 'All': {
      const [customers, suppliers, employees] = await Promise.all([
        db.customer.findMany({
          where: { ...companyFilter, phone: { not: null } },
          select: { id: true, name: true, phone: true },
        }),
        db.supplier.findMany({
          where: { ...companyFilter, phone: { not: null } },
          select: { id: true, name: true, phone: true },
        }),
        db.employee.findMany({
          where: { ...companyFilter, phone: { not: null } },
          select: { id: true, name: true, phone: true },
        }),
      ]);
      customers.forEach((c) => { if (c.phone) recipients.push({ phone: c.phone, name: c.name, id: c.id }); });
      suppliers.forEach((s) => { if (s.phone) recipients.push({ phone: s.phone, name: s.name, id: s.id }); });
      employees.forEach((e) => { if (e.phone) recipients.push({ phone: e.phone, name: e.name, id: e.id }); });
      break;
    }
    default:
      break;
  }

  // Deduplicate by phone number
  const seen = new Set<string>();
  return recipients.filter((r) => {
    if (seen.has(r.phone)) return false;
    seen.add(r.phone);
    return true;
  });
}

// GET /api/sms-campaigns/[id] — Get single campaign
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SmsLogs', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    const item = await db.smsCampaign.findUnique({ where: { id } });
    if (!item || !item.isActive) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

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

    return NextResponse.json(masked[0]);
  } catch (error) {
    console.error('[SmsCampaigns] GET [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch campaign' },
      { status: 500 }
    );
  }
}

// PUT /api/sms-campaigns/[id] — Update campaign
// Only Draft campaigns can be edited. Can also cancel or launch.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SmsLogs', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const companyId = security.user.companyId;

    // Cross-tenant validation
    const existing = await db.smsCampaign.findUnique({ where: { id } });
    if (!existing || !existing.isActive) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // ── CANCEL CAMPAIGN ──
    if (body.action === 'cancel') {
      if (!['Draft', 'Scheduled'].includes(existing.status)) {
        return NextResponse.json(
          { error: `Cannot cancel campaign in "${existing.status}" status. Only Draft or Scheduled campaigns can be cancelled.` },
          { status: 400 }
        );
      }

      const item = await db.$transaction(async (tx) => {
        const record = await tx.smsCampaign.update({
          where: { id },
          data: { status: 'Cancelled' },
        });

        await logUserActivity({
          tx,
          action: 'UPDATE',
          module: 'SMS-Campaign-Marketing',
          recordId: record.id,
          recordLabel: record.code,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            code: record.code,
            name: record.name,
            action: 'cancel',
            previousStatus: existing.status,
            newStatus: 'Cancelled',
          }),
        });

        return record;
      });

      const masked = maskSmsArray(
        [{
          ...item,
          description: formatFinancialField(item.description),
          targetFilter: formatFinancialField(item.targetFilter),
        }],
        security.user.role,
        ['costPerSms', 'totalCost', 'recipientCount', 'sentCount', 'deliveredCount', 'failedCount']
      );

      return NextResponse.json(masked[0]);
    }

    // ── LAUNCH CAMPAIGN ──
    if (body.action === 'launch') {
      if (existing.status !== 'Draft' && existing.status !== 'Scheduled') {
        return NextResponse.json(
          { error: `Cannot launch campaign in "${existing.status}" status. Only Draft or Scheduled campaigns can be launched.` },
          { status: 400 }
        );
      }

      // Look up recipients based on targetGroup
      const recipients = await getRecipients(existing.targetGroup, companyId);

      if (recipients.length === 0) {
        return NextResponse.json(
          { error: 'No recipients found for the selected target group. Ensure contacts have phone numbers.' },
          { status: 400 }
        );
      }

      // Get active SmsSetting for cost calculation
      let ratePerSms = 0;
      let unicodeRate = 0;
      const activeSetting = await db.smsSetting.findFirst({
        where: {
          isActive: true,
          ...(companyId ? { companyId } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
      if (activeSetting) {
        ratePerSms = activeSetting.ratePerSms;
        unicodeRate = activeSetting.unicodeRate;
      }

      // Compute SMS segments for campaign message
      const { charCount, isUnicode, segmentCount } = computeSmsSegments(existing.message);
      const applicableRate = isUnicode ? unicodeRate : ratePerSms;
      const costPerSms = safeFinancialRound(segmentCount * applicableRate);

      const item = await db.$transaction(async (tx) => {
        // Update campaign status to Sending
        await tx.smsCampaign.update({
          where: { id },
          data: {
            status: 'Sending',
            startedAt: new Date(),
            recipientCount: recipients.length,
            costPerSms,
            charCount,
            isUnicode,
            segmentCount,
          },
        });

        // Create SmsLog entries for each recipient and collect IDs for dispatch
        const createdLogs: { id: string; recipient: string }[] = [];
        let failedCount = 0;

        for (const recipient of recipients) {
          try {
            const log = await tx.smsLog.create({
              data: {
                recipient: recipient.phone,
                message: existing.message,
                charCount,
                smsSegmentCount: segmentCount,
                isUnicode,
                status: 'Pending',
                cost: costPerSms,
                triggerType: 'Campaign',
                campaignId: id,
                campaignName: existing.name,
                sentAt: new Date(),
                ...(companyId && { companyId }),
              },
            });
            createdLogs.push({ id: log.id, recipient: log.recipient });
          } catch {
            failedCount++;
          }
        }

        // Compute total cost (based on successfully created logs)
        const sentCount = createdLogs.length;
        const totalCost = safeFinancialRound(sentCount * costPerSms);

        // Update campaign with initial counts (status stays Sending until dispatch completes)
        const record = await tx.smsCampaign.update({
          where: { id },
          data: {
            status: 'Sending',
            sentCount,
            deliveredCount: 0, // Will be updated after dispatch
            failedCount,
            totalCost,
          },
        });

        await logUserActivity({
          tx,
          action: 'UPDATE',
          module: 'SMS-Campaign-Marketing',
          recordId: record.id,
          recordLabel: record.code,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            code: record.code,
            name: record.name,
            action: 'launch',
            recipientCount: recipients.length,
            sentCount,
            failedCount,
            costPerSms,
            totalCost,
            isUnicode,
            segmentCount,
          }),
        });

        return { record, createdLogs };
      });

      // ── AFTER TRANSACTION: Dispatch SMS through gateway ──
      let deliveredCount = 0;
      let dispatchFailedCount = 0;

      if (item.createdLogs.length > 0 && activeSetting) {
        try {
          const gatewayConfig = buildGatewayConfig(activeSetting);
          const batchResult = await dispatchSmsBatch(
            gatewayConfig,
            item.createdLogs.map((log) => ({
              smsLogId: log.id,
              recipient: log.recipient,
              message: existing.message,
            })),
            { concurrency: 5, delayMs: 100 }
          );

          // Update each SmsLog with its individual gateway result
          for (const result of batchResult.results) {
            try {
              await db.smsLog.update({
                where: { id: result.smsLogId },
                data: {
                  status: result.success ? 'Delivered' : 'Failed',
                  gatewayMessageId: result.messageId || null,
                  errorMessage: result.error || null,
                  deliveredAt: result.success ? new Date() : null,
                },
              });
              if (result.success) {
                deliveredCount++;
              } else {
                dispatchFailedCount++;
              }
            } catch {
              // Log update failed — continue
            }
          }
        } catch (dispatchError) {
          console.error('[SMS Campaign] Batch dispatch failed:', dispatchError);
          // Mark all as Failed
          for (const log of item.createdLogs) {
            try {
              await db.smsLog.update({
                where: { id: log.id },
                data: { status: 'Failed', errorMessage: 'Batch dispatch error' },
              });
            } catch { /* ignore */ }
          }
          dispatchFailedCount = item.createdLogs.length;
        }
      } else if (item.createdLogs.length > 0 && !activeSetting) {
        // No active SMS setting — mark all as Failed
        for (const log of item.createdLogs) {
          try {
            await db.smsLog.update({
              where: { id: log.id },
              data: { status: 'Failed', errorMessage: 'No active SMS gateway configured' },
            });
          } catch { /* ignore */ }
        }
        dispatchFailedCount = item.createdLogs.length;
      }

      // Update campaign with final delivery counts
      const finalRecord = await db.smsCampaign.update({
        where: { id },
        data: {
          status: 'Completed',
          deliveredCount,
          failedCount: item.record.failedCount + dispatchFailedCount,
          completedAt: new Date(),
        },
      });

      const masked = maskSmsArray(
        [{
          ...finalRecord,
          description: formatFinancialField(finalRecord.description),
          targetFilter: formatFinancialField(finalRecord.targetFilter),
        }],
        security.user.role,
        ['costPerSms', 'totalCost', 'recipientCount', 'sentCount', 'deliveredCount', 'failedCount']
      );

      return NextResponse.json(masked[0]);
    }

    // ── NORMAL UPDATE (Draft only) ──
    if (existing.status !== 'Draft') {
      return NextResponse.json(
        { error: `Cannot edit campaign in "${existing.status}" status. Only Draft campaigns can be edited.` },
        { status: 400 }
      );
    }

    // Validate targetGroup if provided
    if (body.targetGroup !== undefined && !VALID_TARGET_GROUPS.includes(body.targetGroup as typeof VALID_TARGET_GROUPS[number])) {
      return NextResponse.json(
        { error: `Invalid targetGroup. Must be one of: ${VALID_TARGET_GROUPS.join(', ')}` },
        { status: 400 }
      );
    }

    // Recompute segments if message changed
    const newMessage = body.message !== undefined ? body.message : existing.message;
    const messageChanged = body.message !== undefined && body.message !== existing.message;

    let charCount = existing.charCount;
    let isUnicode = existing.isUnicode;
    let segmentCount = existing.segmentCount;
    let costPerSms = existing.costPerSms;
    let recipientCount = existing.recipientCount;
    let totalCost = existing.totalCost;

    if (messageChanged) {
      const computed = computeSmsSegments(newMessage);
      charCount = computed.charCount;
      isUnicode = computed.isUnicode;
      segmentCount = computed.segmentCount;
    }

    // Recount recipients if targetGroup changed
    const newTargetGroup = body.targetGroup !== undefined ? body.targetGroup : existing.targetGroup;
    if (body.targetGroup !== undefined && body.targetGroup !== existing.targetGroup) {
      recipientCount = await countRecipientsStatic(newTargetGroup, companyId);
    }

    // Recompute cost if message or targetGroup changed
    if (messageChanged || body.targetGroup !== undefined) {
      // Snapshot costPerSms from active SmsSetting
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
      totalCost = safeFinancialRound(recipientCount * segmentCount * costPerSms);
    }

    const item = await db.$transaction(async (tx) => {
      const record = await tx.smsCampaign.update({
        where: { id },
        data: {
          name: body.name !== undefined ? body.name.trim() : existing.name,
          description: body.description !== undefined ? nullIfEmpty(body.description) : existing.description,
          message: newMessage.trim(),
          charCount,
          isUnicode,
          segmentCount,
          targetGroup: newTargetGroup,
          targetFilter: body.targetFilter !== undefined ? nullIfEmpty(body.targetFilter) : existing.targetFilter,
          recipientCount,
          costPerSms,
          totalCost,
          scheduledAt: body.scheduledAt !== undefined ? (body.scheduledAt ? new Date(body.scheduledAt) : null) : existing.scheduledAt,
          status: body.status !== undefined && body.status === 'Scheduled' ? 'Scheduled' : existing.status,
        },
      });

      await logUserActivity({
        tx,
        action: 'UPDATE',
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
          updatedFields: Object.keys(body),
        }),
      });

      return record;
    });

    const masked = maskSmsArray(
      [{
        ...item,
        description: formatFinancialField(item.description),
        targetFilter: formatFinancialField(item.targetFilter),
      }],
      security.user.role,
      ['costPerSms', 'totalCost', 'recipientCount', 'sentCount', 'deliveredCount', 'failedCount']
    );

    return NextResponse.json(masked[0]);
  } catch (error) {
    console.error('[SmsCampaigns] PUT [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to update campaign' },
      { status: 500 }
    );
  }
}

// DELETE /api/sms-campaigns/[id] — Soft delete (Draft only, admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SmsLogs', 'DELETE');
  if (!security.authorized) return security.response;

  // Admin only for delete
  if (security.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Delete access denied. Only Administrators can delete campaigns.' },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    await db.$transaction(async (tx) => {
      const record = await tx.smsCampaign.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');
      if (!record.isActive) throw new Error('Already deleted');

      // Cross-tenant validation
      if (companyId && record.companyId && record.companyId !== companyId) {
        throw new Error('Forbidden');
      }

      // Only Draft campaigns can be deleted
      if (record.status !== 'Draft') {
        throw new Error('Only Draft campaigns can be deleted');
      }

      // Soft delete
      await tx.smsCampaign.update({
        where: { id },
        data: { isActive: false },
      });

      // Activity log with SMS-Campaign-Marketing module token
      await logUserActivity({
        tx,
        action: 'DELETE',
        module: 'SMS-Campaign-Marketing',
        recordId: record.id,
        recordLabel: record.code,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          code: record.code,
          name: record.name,
          status: record.status,
          softDelete: true,
        }),
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    if (error instanceof Error && error.message === 'Not found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (error instanceof Error && error.message === 'Already deleted') {
      return NextResponse.json({ error: 'Already deleted' }, { status: 410 });
    }
    if (error instanceof Error && error.message === 'Only Draft campaigns can be deleted') {
      return NextResponse.json(
        { error: 'Only Draft campaigns can be deleted. Cancel active campaigns first.' },
        { status: 400 }
      );
    }
    console.error('[SmsCampaigns] DELETE [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to delete campaign' },
      { status: 500 }
    );
  }
}

// Helper: count recipients from database based on targetGroup (static version for updates)
async function countRecipientsStatic(targetGroup: string, companyId: string | null): Promise<number> {
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
