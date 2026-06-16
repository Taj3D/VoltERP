// ============================================================
// SMS EVENT HOOKS — Automated Notification Trigger Utility
// Provides functions that other API routes can call to trigger
// SMS notifications automatically based on business events.
// ============================================================

import { db } from '@/lib/db';
import { computeSmsSegments, safeFinancialRound } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';
import { dispatchSingleSms, buildGatewayConfig } from '@/lib/sms-gateway-dispatcher';

// ── Type Definitions ──────────────────────────────────────────

type EventType = 'SalesConfirmation' | 'FinancialCollection' | 'InventoryIngestion' | 'HRLifecycle' | 'PaymentReceived' | 'PurchaseOrderReceived' | 'EmployeeJoined' | 'EmployeeExamDate';

interface TriggerEventSmsParams {
  eventType: EventType;
  recipientPhone: string;
  templateVariables: Record<string, string>;
  companyId?: string;
}

interface TriggerEventSmsResult {
  triggered: boolean;
  smsLogId?: string;
  error?: string;
}

interface PhoneValidationResult {
  valid: boolean;
  formatted: string;
  country: string;
}

interface BulkPhoneParseResult {
  valid: string[];
  invalid: string[];
  duplicates: string[];
}

// ── Currency Formatting Helper ────────────────────────────────

function formatCurrency(amount: number): string {
  // Use en-US locale to guarantee Latin digits (0-9) — en-US falls back to Bengali numerals
  return `Tk. ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
}

// ── Date Formatting Helper ────────────────────────────────────

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// ── 1. Core Trigger Function ──────────────────────────────────

/**
 * triggerEventSms — Core automated SMS trigger function.
 *
 * Looks up an active SmsNotificationTrigger matching the eventType,
 * replaces {{variable}} placeholders in the template body with
 * actual values, computes SMS segments and cost, creates an SmsLog
 * entry, and logs the activity.
 *
 * This function NEVER throws — all errors are caught and returned
 * in the result object.
 */
export async function triggerEventSms(
  params: TriggerEventSmsParams
): Promise<TriggerEventSmsResult> {
  try {
    const { eventType, recipientPhone, templateVariables, companyId } = params;

    // Step 0: Check company-wide SmsAutomationConfig toggle
    // Maps eventType to the corresponding automation config field
    const eventTypeToConfigField: Record<string, string> = {
      'SalesConfirmation': 'autoSmsOnPurchase',
      'FinancialCollection': 'autoSmsOnReceipt',
      'InventoryIngestion': 'autoSmsOnStockReceive',
      'HRLifecycle': 'autoSmsOnEmployeeEvent',
      'PaymentReceived': 'autoSmsOnPaymentReceive',
      'PurchaseOrderReceived': 'autoSmsOnGodownReceive',
      'EmployeeJoined': 'autoSmsOnEmployeeJoin',
      'EmployeeExamDate': 'autoSmsOnEmployeeExam',
    };
    const configField = eventTypeToConfigField[eventType];
    if (configField) {
      const automationConfig = await db.smsAutomationConfig.findFirst({
        where: {
          OR: [
            { companyId: companyId ?? null },
            { companyId: null },
          ],
        },
        orderBy: { companyId: 'desc' },
      });
      if (automationConfig) {
        const isToggleOn = (automationConfig as Record<string, unknown>)[configField];
        if (isToggleOn === false) {
          // Company-wide toggle is OFF — skip this SMS event
          return { triggered: false, error: `SMS automation toggle "${configField}" is disabled` };
        }
      }
    }

    // Step 1: Find active notification trigger matching eventType
    let trigger = await db.smsNotificationTrigger.findFirst({
      where: {
        eventType,
        isEnabled: true,
        isActive: true,
        OR: [
          { companyId: companyId ?? null },
          { companyId: null },
        ],
      },
      orderBy: {
        // Prefer company-specific trigger over global trigger
        companyId: 'desc',
      },
    });

    if (!trigger) {
      // Auto-seed: Create a default SmsNotificationTrigger if none exists for this eventType
      // This ensures auto-SMS works as soon as toggles are turned ON in SMS Settings
      const defaultTemplates: Record<string, { label: string; templateBody: string; recipientType: string }> = {
        'SalesConfirmation': {
          label: 'Customer Purchase SMS',
          templateBody: 'Dear {{customerName}}, your order {{invoiceNo}} of {{amount}} on {{date}} ({{productSummary}}) is confirmed. Thank you!',
          recipientType: 'Customer',
        },
        'FinancialCollection': {
          label: 'Payment Receive SMS',
          templateBody: 'Dear {{clientName}}, we received {{amount}} via {{paymentMethod}} on {{date}}. Ref: {{receiptRef}}. Thank you!',
          recipientType: 'Customer',
        },
        'InventoryIngestion': {
          label: 'Godown Receive SMS',
          templateBody: 'Dear {{supplierName}}, stock received: {{quantity}} x {{productName}} at {{godownName}} on {{date}}. Ref: {{referenceNo}}.',
          recipientType: 'Supplier',
        },
        'HRLifecycle': {
          label: 'HR Lifecycle SMS',
          templateBody: 'Dear {{employeeName}}, {{eventType}}: {{details}} — {{companyName}}.',
          recipientType: 'Employee',
        },
        'PaymentReceived': {
          label: 'Payment Received SMS',
          templateBody: 'Dear {{clientName}}, payment of {{amount}} received on {{date}} via {{paymentMethod}}. Ref: {{receiptRef}}. Thank you!',
          recipientType: 'Customer',
        },
        'PurchaseOrderReceived': {
          label: 'Purchase Order Received SMS',
          templateBody: 'Dear {{supplierName}}, your PO {{poNumber}} of {{amount}} has been received on {{date}}. Items: {{productSummary}}.',
          recipientType: 'Supplier',
        },
        'EmployeeJoined': {
          label: 'Employee Join SMS',
          templateBody: 'Welcome {{employeeName}}! You have joined {{companyName}} as {{designation}} on {{joinDate}}. We wish you great success!',
          recipientType: 'Employee',
        },
        'EmployeeExamDate': {
          label: 'Employee Exam SMS',
          templateBody: 'Dear {{employeeName}}, your exam "{{examTitle}}" is scheduled on {{examDate}} at {{venue}}. — {{companyName}}',
          recipientType: 'Employee',
        },
      };

      const defaultTpl = defaultTemplates[eventType];
      if (defaultTpl) {
        try {
          // Auto-generate SNT code
          const allTriggers = await db.smsNotificationTrigger.findMany({ select: { code: true } });
          let maxNum = 0;
          for (const t of allTriggers) {
            const match = t.code.match(/SNT-(\d+)/);
            if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
          }
          const newCode = `SNT-${String(maxNum + 1).padStart(5, '0')}`;

          const autoTrigger = await db.smsNotificationTrigger.create({
            data: {
              code: newCode,
              eventType,
              label: defaultTpl.label,
              isEnabled: true,
              recipientType: defaultTpl.recipientType,
              templateBody: defaultTpl.templateBody,
              companyId: companyId ?? null,
              isActive: true,
            },
          });

          // Use the auto-created trigger to continue the flow
          trigger = autoTrigger;

          await logUserActivity({
            action: 'CREATE',
            module: 'SMS-Notification-Trigger',
            recordId: autoTrigger.id,
            recordLabel: `Auto-seeded: ${eventType}`,
            details: `Auto-created SmsNotificationTrigger for event type "${eventType}" with default template.`,
          });
        } catch (seedError) {
          console.error('[SmsEventHooks] Failed to auto-seed trigger:', seedError);
          return { triggered: false, error: 'No active notification trigger and auto-seed failed' };
        }
      } else {
        return { triggered: false, error: 'No active notification trigger' };
      }
    }

    // Step 2: Replace {{variableName}} placeholders in templateBody
    let message = trigger.templateBody;
    const placeholderRegex = /\{\{(\w+)\}\}/g;
    message = message.replace(placeholderRegex, (match, varName: string) => {
      return templateVariables[varName] !== undefined ? templateVariables[varName] : 'N/A';
    });

    // Step 3: Get active SmsSetting for rate calculation
    const smsSetting = await db.smsSetting.findFirst({
      where: {
        isActive: true,
        OR: [
          { companyId: companyId ?? null },
          { companyId: null },
        ],
      },
      orderBy: {
        companyId: 'desc',
      },
    });

    // Step 4: Compute SMS segments
    const { charCount, isUnicode, segmentCount } = computeSmsSegments(message);

    // Step 5: Calculate cost
    const ratePerSms = smsSetting?.ratePerSms ?? 0;
    const unicodeRate = smsSetting?.unicodeRate ?? 0;
    const applicableRate = isUnicode ? unicodeRate : ratePerSms;
    const cost = safeFinancialRound(segmentCount * applicableRate);

    // Step 6: Create SmsLog entry
    const log = await db.smsLog.create({
      data: {
        recipient: recipientPhone,
        message,
        charCount,
        smsSegmentCount: segmentCount,
        isUnicode,
        status: 'Pending',
        cost,
        triggerType: eventType,
        companyId: companyId ?? null,
        isActive: true,
      },
    });

    // Step 7: Log activity
    await logUserActivity({
      action: 'CREATE',
      module: 'SMS-Notification-Trigger',
      recordId: log.id,
      recordLabel: `${eventType} → ${recipientPhone}`,
      details: `Auto-triggered SMS for event "${eventType}" to ${recipientPhone}. Segments: ${segmentCount}, Cost: ${formatCurrency(cost)}`,
    });

    // Step 8: Try to dispatch through the SMS gateway (non-blocking)
    // If the gateway dispatch fails, the SmsLog stays as "Pending"
    // and will be picked up later by the /api/sms/dispatch-pending route.
    if (smsSetting) {
      try {
        const gatewayConfig = buildGatewayConfig(smsSetting);
        const dispatchResult = await dispatchSingleSms(gatewayConfig, {
          smsLogId: log.id,
          recipient: recipientPhone,
          message,
        });

        // Update the SmsLog with the gateway result
        await db.smsLog.update({
          where: { id: log.id },
          data: {
            status: dispatchResult.status,
            gatewayResponse: dispatchResult.gatewayResponse,
            cost: dispatchResult.cost,
            ...(dispatchResult.status === 'Sent' && { sentAt: new Date() }),
          },
        });
      } catch (gatewayErr) {
        // Gateway dispatch failed — SmsLog stays as "Pending"
        // The /api/sms/dispatch-pending route can retry later
        console.error('[triggerEventSms] Gateway dispatch failed (entry stays Pending):', gatewayErr);
      }
    }

    return { triggered: true, smsLogId: log.id };
  } catch (error) {
    console.error('[SmsEventHooks] triggerEventSms failed:', error);
    return {
      triggered: false,
      error: error instanceof Error ? error.message : 'Unknown error in triggerEventSms',
    };
  }
}

// ── 2. Sales Confirmation SMS ─────────────────────────────────

/**
 * triggerSalesConfirmationSms — Sends an SMS when a sales order is confirmed.
 * Looks up the customer's phone number and triggers a SalesConfirmation event SMS.
 * Skips silently if the customer has no phone number.
 */
export async function triggerSalesConfirmationSms(salesOrder: {
  id: string;
  invoiceNo: string;
  customerId: string;
  grandTotal: number;
  date: Date | string;
  companyId?: string;
}): Promise<void> {
  try {
    // Look up customer phone
    const customer = await db.customer.findUnique({
      where: { id: salesOrder.customerId },
      select: { name: true, phone: true },
    });

    if (!customer || !customer.phone) {
      // Skip silently — customer has no phone
      return;
    }

    // Validate phone number
    const phoneValidation = validatePhonePrefix(customer.phone);
    if (!phoneValidation.valid) {
      return; // Skip silently — invalid phone format
    }

    // Look up product summary (first 2 product names from sales order lines)
    let productSummary = 'N/A';
    try {
      const lines = await db.salesOrderLine.findMany({
        where: { salesOrderId: salesOrder.id },
        include: { product: { select: { name: true } } },
        take: 2,
      });
      if (lines.length > 0) {
        productSummary = lines.map((l) => l.product.name).join(', ');
      }
    } catch {
      // Non-critical — default to N/A
    }

    await triggerEventSms({
      eventType: 'SalesConfirmation',
      recipientPhone: phoneValidation.formatted,
      templateVariables: {
        customerName: customer.name,
        invoiceNo: salesOrder.invoiceNo,
        amount: formatCurrency(salesOrder.grandTotal),
        date: formatDate(salesOrder.date),
        productSummary,
      },
      companyId: salesOrder.companyId,
    });
  } catch (error) {
    // Never throw — log and move on
    console.error('[SmsEventHooks] triggerSalesConfirmationSms failed:', error);
  }
}

// ── 3. Financial Collection SMS ───────────────────────────────

/**
 * triggerFinancialCollectionSms — Sends an SMS when a financial collection
 * (payment receipt) is recorded. Looks up the customer or supplier phone
 * and triggers a FinancialCollection event SMS.
 * Skips silently if the entity has no phone number.
 */
export async function triggerFinancialCollectionSms(collection: {
  id: string;
  customerId?: string;
  supplierId?: string;
  amount: number;
  paymentMethod: string;
  date: Date | string;
  companyId?: string;
}): Promise<void> {
  try {
    let recipientPhone: string | null = null;
    let clientName: string = 'N/A';

    if (collection.customerId) {
      // Look up customer phone
      const customer = await db.customer.findUnique({
        where: { id: collection.customerId },
        select: { name: true, phone: true },
      });
      if (customer) {
        clientName = customer.name;
        recipientPhone = customer.phone ?? null;
      }
    } else if (collection.supplierId) {
      // Look up supplier phone
      const supplier = await db.supplier.findUnique({
        where: { id: collection.supplierId },
        select: { name: true, phone: true },
      });
      if (supplier) {
        clientName = supplier.name;
        recipientPhone = supplier.phone ?? null;
      }
    }

    if (!recipientPhone) {
      // Skip silently — no phone available
      return;
    }

    // Validate phone number
    const phoneValidation = validatePhonePrefix(recipientPhone);
    if (!phoneValidation.valid) {
      return; // Skip silently — invalid phone format
    }

    // Generate a receipt reference
    const receiptRef = `RCT-${collection.id.slice(-6).toUpperCase()}`;

    await triggerEventSms({
      eventType: 'FinancialCollection',
      recipientPhone: phoneValidation.formatted,
      templateVariables: {
        clientName,
        amount: formatCurrency(collection.amount),
        paymentMethod: collection.paymentMethod,
        date: formatDate(collection.date),
        receiptRef,
      },
      companyId: collection.companyId,
    });
  } catch (error) {
    // Never throw — log and move on
    console.error('[SmsEventHooks] triggerFinancialCollectionSms failed:', error);
  }
}

// ── 4. Inventory Ingestion SMS ────────────────────────────────

/**
 * triggerInventoryIngestionSms — Sends an SMS when inventory is ingested
 * (stock entry from supplier). Looks up the supplier phone and triggers
 * an InventoryIngestion event SMS.
 * Skips silently if the supplier has no phone number.
 */
export async function triggerInventoryIngestionSms(stockEntry: {
  id: string;
  supplierId?: string;
  productId: string;
  quantity: number;
  godownId?: string;
  date: Date | string;
  companyId?: string;
}): Promise<void> {
  try {
    // Look up supplier phone (if supplierId provided)
    let supplierPhone: string | null = null;
    let supplierName: string = 'N/A';

    if (stockEntry.supplierId) {
      const supplier = await db.supplier.findUnique({
        where: { id: stockEntry.supplierId },
        select: { name: true, phone: true },
      });
      if (supplier) {
        supplierName = supplier.name;
        supplierPhone = supplier.phone ?? null;
      }
    }

    if (!supplierPhone) {
      // Skip silently — no supplier phone
      return;
    }

    // Validate phone number
    const phoneValidation = validatePhonePrefix(supplierPhone);
    if (!phoneValidation.valid) {
      return; // Skip silently — invalid phone format
    }

    // Look up product name
    let productName: string = 'N/A';
    try {
      const product = await db.product.findUnique({
        where: { id: stockEntry.productId },
        select: { name: true },
      });
      if (product) {
        productName = product.name;
      }
    } catch {
      // Non-critical — default to N/A
    }

    // Look up godown name
    let godownName: string = 'N/A';
    if (stockEntry.godownId) {
      try {
        const godown = await db.godown.findUnique({
          where: { id: stockEntry.godownId },
          select: { name: true },
        });
        if (godown) {
          godownName = godown.name;
        }
      } catch {
        // Non-critical — default to N/A
      }
    }

    // Generate reference number
    const referenceNo = `STK-${stockEntry.id.slice(-6).toUpperCase()}`;

    await triggerEventSms({
      eventType: 'InventoryIngestion',
      recipientPhone: phoneValidation.formatted,
      templateVariables: {
        supplierName,
        productName,
        quantity: String(stockEntry.quantity),
        godownName,
        date: formatDate(stockEntry.date),
        referenceNo,
      },
      companyId: stockEntry.companyId,
    });
  } catch (error) {
    // Never throw — log and move on
    console.error('[SmsEventHooks] triggerInventoryIngestionSms failed:', error);
  }
}

// ── 5. HR Lifecycle SMS ──────────────────────────────────────

/**
 * triggerHRLifecycleSms — Sends an SMS for HR lifecycle events
 * (e.g., employee examination, update, start date).
 * Uses the employee's phone number directly.
 * Skips silently if the employee has no phone number.
 */
export async function triggerHRLifecycleSms(employee: {
  id: string;
  name: string;
  phone?: string;
  eventType: string;
  details: string;
  companyId?: string;
}): Promise<void> {
  try {
    if (!employee.phone) {
      // Skip silently — no phone
      return;
    }

    // Validate phone number
    const phoneValidation = validatePhonePrefix(employee.phone);
    if (!phoneValidation.valid) {
      return; // Skip silently — invalid phone format
    }

    // Look up company name
    let companyName: string = 'N/A';
    if (employee.companyId) {
      try {
        const company = await db.company.findUnique({
          where: { id: employee.companyId },
          select: { name: true },
        });
        if (company) {
          companyName = company.name;
        }
      } catch {
        // Non-critical — default to N/A
      }
    }

    await triggerEventSms({
      eventType: 'HRLifecycle',
      recipientPhone: phoneValidation.formatted,
      templateVariables: {
        employeeName: employee.name,
        eventType: employee.eventType,
        details: employee.details,
        companyName,
      },
      companyId: employee.companyId,
    });
  } catch (error) {
    // Never throw — log and move on
    console.error('[SmsEventHooks] triggerHRLifecycleSms failed:', error);
  }
}

// ── 6. Phone Validation ──────────────────────────────────────

/**
 * validatePhonePrefix — Validates Bangladesh phone number format.
 *
 * Accepts formats:
 *   +8801XXXXXXXXX
 *   8801XXXXXXXXX
 *   01XXXXXXXXX
 *
 * Validates against: /^(\+880|880|0)?1[3-9]\d{8}$/
 * Formats to: +880XXXXXXXXXX
 *
 * Returns validation result with country identification.
 */
export function validatePhonePrefix(phone: string): PhoneValidationResult {
  try {
    // Strip whitespace
    const cleaned = phone.trim().replace(/[\s\-()]/g, '');

    // Bangladesh mobile number regex:
    // Optional prefix: +880, 880, or 0
    // Then: 1 (mobile network indicator)
    // Then: [3-9] (operator digit)
    // Then: 8 more digits
    const bdPhoneRegex = /^(\+880|880|0)?1[3-9]\d{8}$/;

    if (!bdPhoneRegex.test(cleaned)) {
      return {
        valid: false,
        formatted: cleaned,
        country: 'Bangladesh',
      };
    }

    // Extract the 11-digit local format: 1XXXXXXXXX
    const match = cleaned.match(/1[3-9]\d{8}$/);
    if (!match) {
      return {
        valid: false,
        formatted: cleaned,
        country: 'Bangladesh',
      };
    }

    const localDigits = match[0];

    // Format to +880XXXXXXXXXX (11 digits after +880)
    const formatted = `+880${localDigits}`;

    return {
      valid: true,
      formatted,
      country: 'Bangladesh',
    };
  } catch (error) {
    console.error('[SmsEventHooks] validatePhonePrefix failed:', error);
    return {
      valid: false,
      formatted: phone,
      country: 'Bangladesh',
    };
  }
}

// ── 7. Bulk Phone Parser ─────────────────────────────────────

/**
 * parseBulkPhoneList — Parse comma-separated or newline-separated phone numbers.
 *
 * Validates each number using validatePhonePrefix, removes duplicates,
 * and returns categorized results:
 *   - valid: Array of properly formatted +880XXXXXXXXXX numbers
 *   - invalid: Array of phone strings that failed validation
 *   - duplicates: Array of phone strings that appeared more than once
 */
export function parseBulkPhoneList(input: string): BulkPhoneParseResult {
  const result: BulkPhoneParseResult = {
    valid: [],
    invalid: [],
    duplicates: [],
  };

  try {
    if (!input || typeof input !== 'string') {
      return result;
    }

    // Split by comma, newline, or both
    const rawPhones = input
      .split(/[,\n\r]+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    // Track seen formatted numbers to detect duplicates
    const seenFormatted = new Map<string, string>(); // formatted → original

    for (const rawPhone of rawPhones) {
      const validation = validatePhonePrefix(rawPhone);

      if (!validation.valid) {
        result.invalid.push(rawPhone);
        continue;
      }

      if (seenFormatted.has(validation.formatted)) {
        // This is a duplicate
        result.duplicates.push(rawPhone);
        continue;
      }

      seenFormatted.set(validation.formatted, rawPhone);
      result.valid.push(validation.formatted);
    }
  } catch (error) {
    console.error('[SmsEventHooks] parseBulkPhoneList failed:', error);
  }

  return result;
}

// ── 8. Payment Received SMS (NEW) ──────────────────────────────

/**
 * triggerPaymentReceivedSms — Sends an SMS when a cash/bank/bkash/nagad
 * payment is received from a customer/dealer. Uses the autoSmsOnPaymentReceive toggle.
 */
export async function triggerPaymentReceivedSms(collection: {
  id: string;
  customerId?: string;
  supplierId?: string;
  amount: number;
  paymentMethod: string;
  date: Date | string;
  companyId?: string;
}): Promise<void> {
  try {
    let recipientPhone: string | null = null;
    let clientName: string = 'N/A';

    if (collection.customerId) {
      const customer = await db.customer.findUnique({
        where: { id: collection.customerId },
        select: { name: true, phone: true },
      });
      if (customer) {
        clientName = customer.name;
        recipientPhone = customer.phone ?? null;
      }
    } else if (collection.supplierId) {
      const supplier = await db.supplier.findUnique({
        where: { id: collection.supplierId },
        select: { name: true, phone: true },
      });
      if (supplier) {
        clientName = supplier.name;
        recipientPhone = supplier.phone ?? null;
      }
    }

    if (!recipientPhone) return;

    const phoneValidation = validatePhonePrefix(recipientPhone);
    if (!phoneValidation.valid) return;

    const receiptRef = `RCT-${collection.id.slice(-6).toUpperCase()}`;

    await triggerEventSms({
      eventType: 'PaymentReceived',
      recipientPhone: phoneValidation.formatted,
      templateVariables: {
        clientName,
        amount: formatCurrency(collection.amount),
        paymentMethod: collection.paymentMethod,
        date: formatDate(collection.date),
        receiptRef,
      },
      companyId: collection.companyId,
    });
  } catch (error) {
    console.error('[SmsEventHooks] triggerPaymentReceivedSms failed:', error);
  }
}

// ── 9. Purchase Order Received SMS (NEW) ───────────────────────

/**
 * triggerPurchaseOrderReceivedSms — Sends an SMS to the supplier when
 * products are received at a godown/showroom. Uses autoSmsOnGodownReceive toggle.
 */
export async function triggerPurchaseOrderReceivedSms(params: {
  purchaseOrderId: string;
  poNumber: string;
  supplierId: string;
  itemSummary: string;
  godownName: string;
  companyId?: string;
}): Promise<void> {
  try {
    // Look up supplier phone
    const supplier = await db.supplier.findUnique({
      where: { id: params.supplierId },
      select: { name: true, phone: true },
    });

    if (!supplier || !supplier.phone) return;

    const phoneValidation = validatePhonePrefix(supplier.phone);
    if (!phoneValidation.valid) return;

    await triggerEventSms({
      eventType: 'PurchaseOrderReceived',
      recipientPhone: phoneValidation.formatted,
      templateVariables: {
        supplierName: supplier.name,
        itemSummary: params.itemSummary,
        godownName: params.godownName,
        poNumber: params.poNumber,
        date: formatDate(new Date()),
      },
      companyId: params.companyId,
    });
  } catch (error) {
    console.error('[SmsEventHooks] triggerPurchaseOrderReceivedSms failed:', error);
  }
}

// ── 10. Employee Joined SMS (NEW) ──────────────────────────────

/**
 * triggerEmployeeJoinedSms — Sends a welcome SMS when a new employee joins.
 * Uses the autoSmsOnEmployeeJoin toggle.
 */
export async function triggerEmployeeJoinedSms(employee: {
  id: string;
  name: string;
  phone?: string;
  joiningDate: Date | string;
  designation?: string;
  companyId?: string;
}): Promise<void> {
  try {
    if (!employee.phone) return;

    const phoneValidation = validatePhonePrefix(employee.phone);
    if (!phoneValidation.valid) return;

    let companyName: string = 'N/A';
    if (employee.companyId) {
      try {
        const company = await db.company.findUnique({
          where: { id: employee.companyId },
          select: { name: true },
        });
        if (company) companyName = company.name;
      } catch {}
    }

    await triggerEventSms({
      eventType: 'EmployeeJoined',
      recipientPhone: phoneValidation.formatted,
      templateVariables: {
        employeeName: employee.name,
        joiningDate: formatDate(employee.joiningDate),
        designation: employee.designation || 'N/A',
        companyName,
      },
      companyId: employee.companyId,
    });
  } catch (error) {
    console.error('[SmsEventHooks] triggerEmployeeJoinedSms failed:', error);
  }
}

// ── 11. Employee Exam Date SMS (NEW) ───────────────────────────

/**
 * triggerEmployeeExamDateSms — Sends an SMS when an employee has an exam date.
 * Uses the autoSmsOnEmployeeExam toggle.
 */
export async function triggerEmployeeExamDateSms(employee: {
  id: string;
  name: string;
  phone?: string;
  examDate: string;
  examTime: string;
  venue?: string;
  companyId?: string;
}): Promise<void> {
  try {
    if (!employee.phone) return;

    const phoneValidation = validatePhonePrefix(employee.phone);
    if (!phoneValidation.valid) return;

    let companyName: string = 'N/A';
    if (employee.companyId) {
      try {
        const company = await db.company.findUnique({
          where: { id: employee.companyId },
          select: { name: true },
        });
        if (company) companyName = company.name;
      } catch {}
    }

    await triggerEventSms({
      eventType: 'EmployeeExamDate',
      recipientPhone: phoneValidation.formatted,
      templateVariables: {
        employeeName: employee.name,
        examDate: employee.examDate,
        examTime: employee.examTime,
        venue: employee.venue || 'Please contact HR',
        companyName,
      },
      companyId: employee.companyId,
    });
  } catch (error) {
    console.error('[SmsEventHooks] triggerEmployeeExamDateSms failed:', error);
  }
}
