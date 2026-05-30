import { computeSmsSegments, safeFinancialRound } from '@/lib/api-security';
import { db } from '@/lib/db';
import { logUserActivity } from '@/lib/activity-logger';

interface AutoSmsResult {
  dispatched: boolean;
  smsLogId?: string;
  cost?: number;
  error?: string;
}

/**
 * dispatchAutoSms — Server-side function to dispatch transactional auto-SMS
 * Called directly (no HTTP overhead) from within existing API route handlers.
 * Checks the SmsAutomationConfig toggle for the given trigger type and company,
 * and if enabled, creates an SmsLog entry and logs the activity.
 * NEVER throws — auto-SMS failures must not block the parent transaction.
 */
export async function dispatchAutoSms(params: {
  triggerType: 'purchase' | 'collection' | 'stock_receive' | 'hr_lifecycle';
  recipient: string;
  message: string;
  companyId: string | null | undefined;
  userId?: string;
  userName?: string;
  referenceData?: Record<string, unknown>;
}): Promise<AutoSmsResult> {
  try {
    const { triggerType, recipient, message, companyId, userId, userName, referenceData } = params;

    if (!recipient || !message || !companyId) {
      return { dispatched: false, error: 'Missing required params' };
    }

    // Look up the SmsAutomationConfig for this tenant
    const config = await db.smsAutomationConfig.findFirst({
      where: { isActive: true, companyId },
    });

    if (!config) {
      return { dispatched: false, error: 'No automation config found' };
    }

    // Check the corresponding toggle
    const toggleMap: Record<string, boolean> = {
      purchase: config.smsAlertOnPurchase,
      collection: config.smsAlertOnCollection,
      stock_receive: config.smsAlertOnStockReceive,
      hr_lifecycle: config.smsAlertOnHrLifecycle,
    };

    const isEnabled = toggleMap[triggerType];
    if (!isEnabled) {
      return { dispatched: false, error: `Trigger ${triggerType} is disabled` };
    }

    // Look up the tenant's active SmsSetting for rate calculation
    const activeSetting = await db.smsSetting.findFirst({
      where: { isActive: true, companyId },
      orderBy: { createdAt: 'desc' },
    });

    const { charCount, isUnicode, segmentCount } = computeSmsSegments(message);
    const ratePerSms = activeSetting?.ratePerSms || 0;
    const unicodeRate = activeSetting?.unicodeRate || 0;
    const applicableRate = isUnicode ? unicodeRate : ratePerSms;
    const cost = safeFinancialRound(segmentCount * applicableRate);

    // Check credit balance shield
    const availableCredits = activeSetting?.lastKnownCreditBalance || 0;
    if (availableCredits > 0 && cost > availableCredits) {
      return { dispatched: false, error: 'Insufficient SMS API credits for auto-SMS' };
    }

    // Create SmsLog entry
    const smsLog = await db.smsLog.create({
      data: {
        recipient: recipient.trim(),
        message,
        charCount,
        smsSegmentCount: segmentCount,
        isUnicode,
        status: 'Pending',
        campaignName: `Auto-SMS: ${triggerType}`,
        cost,
        companyId,
        isActive: true,
      },
    });

    // Update lastKnownCreditBalance on the active setting
    if (activeSetting && availableCredits > 0) {
      const newBalance = Math.max(0, availableCredits - cost);
      await db.smsSetting.update({
        where: { id: activeSetting.id },
        data: { lastKnownCreditBalance: safeFinancialRound(newBalance) },
      });
    }

    // Log activity
    await logUserActivity({
      action: 'CREATE',
      module: 'Comm-SMS-Marketing',
      recordId: smsLog.id,
      recordLabel: `Auto-SMS: ${triggerType} → ${recipient}`,
      userId: userId || 'system',
      userName: userName || 'System',
      details: JSON.stringify({
        triggerType,
        recipient,
        charCount,
        isUnicode,
        segmentCount,
        cost,
        referenceData,
      }),
    });

    return { dispatched: true, smsLogId: smsLog.id, cost };
  } catch (error) {
    console.error('[dispatchAutoSms] Error:', error);
    return { dispatched: false, error: String(error) };
  }
}
