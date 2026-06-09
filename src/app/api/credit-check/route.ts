// ============================================================
// CREDIT LIMIT VERIFICATION — Pre-transaction credit check endpoint
// Validates whether a proposed transaction is allowed based on
// the entity's credit status, current balance, and credit limit.
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, safeFinancialRound, safeFinancialAdd } from '@/lib/api-security';
import { computeCustomerBalance } from '@/app/api/customers/balances/route';
import { computeSupplierBalance } from '@/app/api/suppliers/balances/route';

interface CreditCheckRequest {
  entityType: 'customer' | 'supplier';
  entityId: string;
  proposedAmount: number;
}

interface CreditCheckResponse {
  allowed: boolean;
  currentBalance: number;
  currentBalanceType: string;
  creditLimit: number;
  creditUtilization: number;
  projectedBalance: number;
  projectedUtilization: number;
  creditStatus: string;
  message: string;
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Customers', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body: CreditCheckRequest = await request.json();
    const { entityType, entityId, proposedAmount } = body;

    // Validate required fields
    if (!entityType || !entityId || proposedAmount === undefined || proposedAmount === null) {
      return NextResponse.json(
        { error: 'Missing required fields: entityType, entityId, proposedAmount' },
        { status: 400 }
      );
    }

    // Validate entityType
    if (entityType !== 'customer' && entityType !== 'supplier') {
      return NextResponse.json(
        { error: 'Invalid entityType. Must be "customer" or "supplier".' },
        { status: 400 }
      );
    }

    // Validate proposedAmount is a positive number
    if (typeof proposedAmount !== 'number' || proposedAmount < 0) {
      return NextResponse.json(
        { error: 'proposedAmount must be a non-negative number.' },
        { status: 400 }
      );
    }

    const companyId = security.user.companyId;
    const amount = safeFinancialRound(proposedAmount);

    if (entityType === 'customer') {
      return await checkCustomerCredit(entityId, amount, companyId);
    } else {
      // Suppliers use the 'Suppliers' module for security check
      return await checkSupplierCredit(entityId, amount, companyId);
    }
  } catch (error) {
    console.error('[CreditCheck] Error performing credit check:', error);
    return NextResponse.json({ error: 'Failed to perform credit check' }, { status: 500 });
  }
}

async function checkCustomerCredit(
  customerId: string,
  proposedAmount: number,
  companyId?: string | null
): Promise<NextResponse> {
  const balance = await computeCustomerBalance(customerId, companyId);

  if (!balance) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  // Rule 1: If creditStatus is "Frozen" → always reject
  if (balance.creditStatus === 'Frozen') {
    const response: CreditCheckResponse = {
      allowed: false,
      currentBalance: balance.currentBalance,
      currentBalanceType: balance.currentBalanceType,
      creditLimit: balance.creditLimit,
      creditUtilization: balance.creditUtilization,
      projectedBalance: safeFinancialAdd(balance.currentBalance, proposedAmount),
      projectedUtilization: balance.creditLimit > 0
        ? safeFinancialRound((safeFinancialAdd(balance.currentBalance, proposedAmount) / balance.creditLimit) * 100)
        : 0,
      creditStatus: balance.creditStatus,
      message: `CREDIT FREEZE: Account is frozen. No new transactions allowed. Outstanding balance Tk. ${balance.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
    };
    return NextResponse.json(response);
  }

  // Rule 2: If creditLimit is 0 → always allow (no limit set)
  if (balance.creditLimit === 0) {
    const projectedBalance = safeFinancialAdd(balance.currentBalance, proposedAmount);
    const response: CreditCheckResponse = {
      allowed: true,
      currentBalance: balance.currentBalance,
      currentBalanceType: balance.currentBalanceType,
      creditLimit: balance.creditLimit,
      creditUtilization: balance.creditUtilization,
      projectedBalance,
      projectedUtilization: 0,
      creditStatus: balance.creditStatus,
      message: 'Transaction allowed. No credit limit set.',
    };
    return NextResponse.json(response);
  }

  // Rule 3: If projectedBalance > creditLimit → reject
  const projectedBalance = safeFinancialAdd(balance.currentBalance, proposedAmount);
  const projectedUtilization = safeFinancialRound((projectedBalance / balance.creditLimit) * 100);

  if (projectedBalance > balance.creditLimit) {
    const response: CreditCheckResponse = {
      allowed: false,
      currentBalance: balance.currentBalance,
      currentBalanceType: balance.currentBalanceType,
      creditLimit: balance.creditLimit,
      creditUtilization: balance.creditUtilization,
      projectedBalance,
      projectedUtilization,
      creditStatus: balance.creditStatus,
      message: `CREDIT FREEZE: Outstanding balance Tk. ${projectedBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} would exceed credit ceiling Tk. ${balance.creditLimit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    };
    return NextResponse.json(response);
  }

  // Rule 4: Otherwise → allow
  const response: CreditCheckResponse = {
    allowed: true,
    currentBalance: balance.currentBalance,
    currentBalanceType: balance.currentBalanceType,
    creditLimit: balance.creditLimit,
    creditUtilization: balance.creditUtilization,
    projectedBalance,
    projectedUtilization,
    creditStatus: balance.creditStatus,
    message: 'Transaction allowed',
  };
  return NextResponse.json(response);
}

async function checkSupplierCredit(
  supplierId: string,
  proposedAmount: number,
  companyId?: string | null
): Promise<NextResponse> {
  const balance = await computeSupplierBalance(supplierId, companyId);

  if (!balance) {
    return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
  }

  // Rule 1: If creditStatus is "Frozen" → always reject
  if (balance.creditStatus === 'Frozen') {
    const response: CreditCheckResponse = {
      allowed: false,
      currentBalance: balance.currentBalance,
      currentBalanceType: balance.currentBalanceType,
      creditLimit: balance.creditLimit,
      creditUtilization: balance.creditUtilization,
      projectedBalance: safeFinancialAdd(balance.currentBalance, proposedAmount),
      projectedUtilization: balance.creditLimit > 0
        ? safeFinancialRound((safeFinancialAdd(balance.currentBalance, proposedAmount) / balance.creditLimit) * 100)
        : 0,
      creditStatus: balance.creditStatus,
      message: `CREDIT FREEZE: Account is frozen. No new transactions allowed. Outstanding balance Tk. ${balance.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
    };
    return NextResponse.json(response);
  }

  // Rule 2: If creditLimit is 0 → always allow (no limit set)
  if (balance.creditLimit === 0) {
    const projectedBalance = safeFinancialAdd(balance.currentBalance, proposedAmount);
    const response: CreditCheckResponse = {
      allowed: true,
      currentBalance: balance.currentBalance,
      currentBalanceType: balance.currentBalanceType,
      creditLimit: balance.creditLimit,
      creditUtilization: balance.creditUtilization,
      projectedBalance,
      projectedUtilization: 0,
      creditStatus: balance.creditStatus,
      message: 'Transaction allowed. No credit limit set.',
    };
    return NextResponse.json(response);
  }

  // Rule 3: If projectedBalance > creditLimit → reject
  const projectedBalance = safeFinancialAdd(balance.currentBalance, proposedAmount);
  const projectedUtilization = safeFinancialRound((projectedBalance / balance.creditLimit) * 100);

  if (projectedBalance > balance.creditLimit) {
    const response: CreditCheckResponse = {
      allowed: false,
      currentBalance: balance.currentBalance,
      currentBalanceType: balance.currentBalanceType,
      creditLimit: balance.creditLimit,
      creditUtilization: balance.creditUtilization,
      projectedBalance,
      projectedUtilization,
      creditStatus: balance.creditStatus,
      message: `CREDIT FREEZE: Outstanding balance Tk. ${projectedBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} would exceed credit ceiling Tk. ${balance.creditLimit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    };
    return NextResponse.json(response);
  }

  // Rule 4: Otherwise → allow
  const response: CreditCheckResponse = {
    allowed: true,
    currentBalance: balance.currentBalance,
    currentBalanceType: balance.currentBalanceType,
    creditLimit: balance.creditLimit,
    creditUtilization: balance.creditUtilization,
    projectedBalance,
    projectedUtilization,
    creditStatus: balance.creditStatus,
    message: 'Transaction allowed',
  };
  return NextResponse.json(response);
}
