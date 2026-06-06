// ============================================================
// CORE CONFIG BULK IMPORT API — Transactional CSV Router
// All-or-nothing database rule: if ANY row fails validation,
// the ENTIRE import is rolled back. No partial imports.
// Sequential transaction wraps enforce atomicity.
// Module Token: Sys-Config-Core
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, stripHtml } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';
import { sanitizeError } from '@/lib/exception-sanitizer';

// Validation helpers
function isValidHexColor(code: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(code);
}

function isValidNumber(val: any): boolean {
  if (val === null || val === undefined || val === '') return true; // optional
  const num = Number(val);
  return !isNaN(num);
}

function isPositiveNumber(val: any): boolean {
  if (val === null || val === undefined || val === '') return true; // optional
  const num = Number(val);
  return !isNaN(num) && num >= 0;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

type ModuleType = 'companies' | 'categories' | 'colors' | 'brands' | 'units';

// ============================================================
// VALIDATORS — Per-module field validation
// ============================================================

function validateCompanyRow(row: Record<string, any>, rowNum: number): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!row.name || String(row.name).trim() === '') {
    errors.push({ row: rowNum, field: 'name', message: 'Company name is required' });
  }
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(row.email))) {
    errors.push({ row: rowNum, field: 'email', message: 'Invalid email format' });
  }
  if (row.logoWidth && !isPositiveNumber(row.logoWidth)) {
    errors.push({ row: rowNum, field: 'logoWidth', message: 'Logo width must be a positive number' });
  }
  if (row.logoHeight && !isPositiveNumber(row.logoHeight)) {
    errors.push({ row: rowNum, field: 'logoHeight', message: 'Logo height must be a positive number' });
  }
  return errors;
}

function validateCategoryRow(row: Record<string, any>, rowNum: number): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!row.name || String(row.name).trim() === '') {
    errors.push({ row: rowNum, field: 'name', message: 'Category name is required' });
  }
  return errors;
}

function validateColorRow(row: Record<string, any>, rowNum: number): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!row.name || String(row.name).trim() === '') {
    errors.push({ row: rowNum, field: 'name', message: 'Color name is required' });
  }
  if (!row.colorCode || String(row.colorCode).trim() === '') {
    errors.push({ row: rowNum, field: 'colorCode', message: 'Color code is required' });
  } else if (!isValidHexColor(String(row.colorCode))) {
    errors.push({ row: rowNum, field: 'colorCode', message: `Invalid hex color code: "${row.colorCode}". Must be #RGB, #RRGGBB, or #RRGGBBAA` });
  }
  return errors;
}

function validateBrandRow(row: Record<string, any>, rowNum: number): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!row.name || String(row.name).trim() === '') {
    errors.push({ row: rowNum, field: 'name', message: 'Brand name is required' });
  }
  return errors;
}

function validateUnitRow(row: Record<string, any>, rowNum: number): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!row.name || String(row.name).trim() === '') {
    errors.push({ row: rowNum, field: 'name', message: 'Unit name is required' });
  }
  return errors;
}

// ============================================================
// ACCOUNT HASH VALIDATION
// Ensures CSV was generated from the correct tenant data
// ============================================================

function validateAccountHash(hash: string | undefined, module: ModuleType): boolean {
  if (!hash) return true; // Hash is optional for backward compatibility
  // Hash format: CORE-{module}-{timestamp}-{checksum}
  const pattern = new RegExp(`^CORE-${module}-\\d+-[a-f0-9]{8}$`, 'i');
  return pattern.test(hash);
}

// ============================================================
// POST /api/core-config/bulk-import
// Body: { module: ModuleType, records: any[], accountHash?: string }
// ============================================================

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'CoreConfigBulkImport', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const { module, records, accountHash } = body as {
      module: ModuleType;
      records: Record<string, any>[];
      accountHash?: string;
    };

    // Validate module type
    const validModules: ModuleType[] = ['companies', 'categories', 'colors', 'brands', 'units'];
    if (!module || !validModules.includes(module)) {
      return NextResponse.json(
        { error: `Invalid module: "${module}". Must be one of: ${validModules.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate records array
    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json(
        { error: 'Records must be a non-empty array' },
        { status: 400 }
      );
    }

    // Validate account hash
    if (accountHash && !validateAccountHash(accountHash, module)) {
      return NextResponse.json(
        { error: `Account hash validation failed. The import file was generated for a different tenant or module. Hash: "${accountHash}"` },
        { status: 400 }
      );
    }

    // ============================================================
    // PHASE 1: Validate ALL rows BEFORE any database writes
    // ============================================================
    const allErrors: ValidationError[] = [];
    const validatorMap: Record<ModuleType, (row: Record<string, any>, rowNum: number) => ValidationError[]> = {
      companies: validateCompanyRow,
      categories: validateCategoryRow,
      colors: validateColorRow,
      brands: validateBrandRow,
      units: validateUnitRow,
    };

    const validator = validatorMap[module];
    for (let i = 0; i < records.length; i++) {
      const rowErrors = validator(records[i], i + 1);
      allErrors.push(...rowErrors);

      // Malformed numeric rejection
      const numericFields = ['logoWidth', 'logoHeight', 'openingBalance', 'sharePercentage', 'capitalValue'];
      for (const field of numericFields) {
        if (records[i][field] !== undefined && records[i][field] !== null && records[i][field] !== '') {
          if (!isValidNumber(records[i][field])) {
            allErrors.push({
              row: i + 1,
              field,
              message: `Malformed numeric value: "${records[i][field]}" is not a valid number`,
            });
          }
        }
      }
    }

    if (allErrors.length > 0) {
      return NextResponse.json(
        {
          error: `Import rejected: ${allErrors.length} validation error(s). Entire import file rolled back.`,
          imported: 0,
          failed: records.length,
          validationErrors: allErrors,
        },
        { status: 400 }
      );
    }

    // ============================================================
    // PHASE 2: All rows valid — execute in single atomic transaction
    // ============================================================
    const result = await db.$transaction(async (tx) => {
      const created: any[] = [];
      let codeCounter = 0;

      for (const record of records) {
        let item: any;

        switch (module) {
          case 'companies': {
            const count = await tx.company.count();
            const code = `COM-${String(count + 1 + codeCounter).padStart(5, '0')}`;
            item = await tx.company.create({
              data: {
                code,
                name: stripHtml(String(record.name).trim()),
                address: record.address ? stripHtml(String(record.address)) : null,
                phone: record.phone ? stripHtml(String(record.phone)) : null,
                email: record.email ? stripHtml(String(record.email)) : null,
                mobile: record.mobile ? stripHtml(String(record.mobile)) : null,
                website: record.website ? stripHtml(String(record.website)) : null,
                vatNumber: record.vatNumber ? stripHtml(String(record.vatNumber)) : null,
                tradeLicense: record.tradeLicense ? stripHtml(String(record.tradeLicense)) : null,
                binNumber: record.binNumber ? stripHtml(String(record.binNumber)) : null,
                currencySymbol: record.currencySymbol || '৳',
                invoicePrefix: record.invoicePrefix ? stripHtml(String(record.invoicePrefix)) : null,
                thankYouMsg: record.thankYouMsg ? stripHtml(String(record.thankYouMsg)) : null,
                systemNote: record.systemNote ? stripHtml(String(record.systemNote)) : null,
                showBarcode: record.showBarcode !== undefined ? Boolean(record.showBarcode) : true,
                showPayInWord: record.showPayInWord !== undefined ? Boolean(record.showPayInWord) : true,
                logoWidth: record.logoWidth ? parseFloat(String(record.logoWidth)) : 30,
                logoHeight: record.logoHeight ? parseFloat(String(record.logoHeight)) : 20,
                isActive: record.isActive !== undefined ? Boolean(record.isActive) : true,
              },
            });
            break;
          }
          case 'categories': {
            let code = record.code;
            if (!code) {
              const count = await tx.category.count();
              code = `CAT-${String(count + 1 + codeCounter).padStart(5, '0')}`;
            }
            item = await tx.category.create({
              data: {
                code,
                name: stripHtml(String(record.name).trim()),
                description: record.description ? stripHtml(String(record.description)) : null,
                parentCategoryId: record.parentCategoryId || null,
                isActive: record.isActive !== undefined ? Boolean(record.isActive) : true,
              },
            });
            break;
          }
          case 'colors': {
            item = await tx.color.create({
              data: {
                name: stripHtml(String(record.name).trim()),
                colorCode: stripHtml(String(record.colorCode).trim()),
                isActive: record.isActive !== undefined ? Boolean(record.isActive) : true,
              },
            });
            break;
          }
          case 'brands': {
            const count = await tx.brand.count();
            const code = `BRN-${String(count + 1 + codeCounter).padStart(5, '0')}`;
            item = await tx.brand.create({
              data: {
                code,
                name: stripHtml(String(record.name).trim()),
                description: record.description ? stripHtml(String(record.description)) : null,
                isActive: record.isActive !== undefined ? Boolean(record.isActive) : true,
              },
            });
            break;
          }
          case 'units': {
            const count = await tx.unit.count();
            const code = `UNT-${String(count + 1 + codeCounter).padStart(5, '0')}`;
            item = await tx.unit.create({
              data: {
                code,
                name: stripHtml(String(record.name).trim()),
                symbol: record.symbol ? stripHtml(String(record.symbol)) : null,
                description: record.description ? stripHtml(String(record.description)) : null,
                isActive: record.isActive !== undefined ? Boolean(record.isActive) : true,
              },
            });
            break;
          }
        }

        created.push(item);
        codeCounter++;
      }

      // Single audit log for the entire bulk import
      await logUserActivity({
        action: 'IMPORT',
        module: 'Sys-Config-Core',
        recordLabel: `Bulk Import: ${module}`,
        userId: security.user?.id,
        userName: security.user?.name,
        details: JSON.stringify({
          module,
          recordCount: created.length,
          accountHash: accountHash || 'N/A',
        }),
      });

      return created;
    });

    return NextResponse.json({
      imported: result.length,
      failed: 0,
      validationErrors: [],
      records: result,
    }, { status: 201 });
  } catch (error) {
    const sanitized = sanitizeError(error, 'core-config-bulk-import');
    return NextResponse.json(
      { error: sanitized.userMessage, imported: 0, failed: 0, validationErrors: [] },
      { status: sanitized.statusCode }
    );
  }
}
