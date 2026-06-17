// ============================================================
// VoltERP — Comprehensive Reference Data Seed
// ------------------------------------------------------------
// Seeds ALL essential reference data into a fresh database so
// that every VoltERP module page renders correctly (no "No
// data" errors). Idempotent — safe to re-run.
//
// Run with:
//   cd /home/z/my-project && node scripts/seed-reference-data.js
//
// Models covered (in dependency order):
//   1.  Company            (already exists — used as anchor)
//   2.  Categories         (12)
//   3.  Brands             (12)
//   4.  Colors             (10)
//   5.  Units              (9)
//   6.  Godowns            (4)
//   7.  Departments        (7)
//   8.  Designations       (7)        — depends on Departments
//   9.  Banks              (8)
//   10. ChartOfAccounts    (5 roots + 20 sub-accounts)
//   11. ExpenseIncomeHead  (8)        — optionally linked to CoA
//   12. PaymentOptions     (7)
//   13. CardTypes          (4)
//   14. Segments           (3)
//   15. Capacities         (5)
//   16. Products           (17)       — depends on Cat/Brand/Color/Unit/Godown/Segment
//   17. Customers          (6)
//   18. Suppliers          (6)
//   19. Employees          (6)        — depends on Designation/Department
//   20. SRTargetSetup      (2)        — depends on Employees
//   21. SmsSetting         (1)
//   22. SmsAutomationConfig (1)
// ============================================================
//
// NOTE: This is a CommonJS script invoked directly with Node
// (`node scripts/seed-reference-data.js`), so `require()` is
// intentional and required. Disable the TS rule for this file.
/* eslint-disable @typescript-eslint/no-require-imports */

const { PrismaClient } = require('@prisma/client');
const { PrismaLibSQL } = require('@prisma/adapter-libsql');
const bcrypt = require('bcryptjs');

// ── Detect Turso (libsql://) and use the adapter; otherwise local SQLite ──
const DATABASE_URL = process.env.DATABASE_URL || '';
const isTurso = DATABASE_URL.startsWith('libsql://') || DATABASE_URL.startsWith('wss://');

let prisma;
if (isTurso) {
  console.log('[seed] Connecting to Turso (libSQL adapter)...');
  const adapter = new PrismaLibSQL({
    url: DATABASE_URL,
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  });
  prisma = new PrismaClient({ adapter, log: ['error'] });
} else {
  console.log('[seed] Connecting to local SQLite...');
  prisma = new PrismaClient({ log: ['error'] });
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Pad a number into a 5-digit zero-padded code suffix. */
function pad(n, width = 5) {
  return String(n).padStart(width, '0');
}

/** Logger with section prefix. */
function log(section, msg) {
  console.log(`[${section}] ${msg}`);
}

/** Find-or-create wrapper that uses a unique key lookup. */
async function findOrCreate(modelName, where, data, label) {
  const existing = await prisma[modelName].findFirst({ where });
  if (existing) {
    return { record: existing, created: false };
  }
  const record = await prisma[modelName].create({ data });
  if (label) log('CREATE', `${modelName}: ${label} (${record.id})`);
  return { record, created: true };
}

/** Find-or-create using a unique field directly (more efficient). */
async function findOrCreateByUnique(modelName, uniqueField, uniqueValue, data, label) {
  const existing = await prisma[modelName].findUnique({
    where: { [uniqueField]: uniqueValue },
  });
  if (existing) {
    return { record: existing, created: false };
  }
  const record = await prisma[modelName].create({ data });
  if (label) log('CREATE', `${modelName}: ${label}`);
  return { record, created: true };
}

// ─────────────────────────────────────────────────────────────
// MAIN SEED FUNCTION
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log('========================================');
  console.log(' VoltERP Reference Data Seed');
  console.log('========================================\n');

  // ── 0. Locate (or create) the anchor company ──
  let company = await prisma.company.findFirst({
    where: { code: 'EM' },
  });
  if (!company) {
    // Fallback: pick any company
    company = await prisma.company.findFirst();
  }
  if (!company) {
    // Last resort: create a default Electronics Mart company
    log('SEED', 'No company found — creating default Electronics Mart');
    company = await prisma.company.create({
      data: {
        code: 'EM',
        name: 'Electronics Mart',
        address: 'Level-5, Bashundhara City, Panthapath, Dhaka 1205',
        phone: '+880-2-9881669',
        email: 'info@electronicsmart.com.bd',
        mobile: '+8801711000001',
        website: 'https://electronicsmart.com.bd',
        vatNumber: 'BD-VAT-00000011',
        tradeLicense: 'TRD-DHA-2025-001234',
        invoicePrefix: 'EM',
        thankYouMsg: 'Thank You Come Again.',
        systemNote: 'This is a system generated invoice no need to seal & signature.',
        showBarcode: true,
        showPayInWord: true,
        isActive: true,
      },
    });
  }
  const companyId = company.id;
  log('ANCHOR', `Company: ${company.name} (${company.code}) → ${companyId}\n`);

  // Attach the 5 default users to this company if they're not already linked
  const orphanUsers = await prisma.user.findMany({ where: { companyId: null } });
  for (const u of orphanUsers) {
    await prisma.user.update({ where: { id: u.id }, data: { companyId } });
    log('USER', `Linked ${u.email} → company`);
  }

  // ── 1. CATEGORIES (12) ──
  log('STEP', '1. Seeding Categories...');
  const categoryDefs = [
    { code: 'CAT-00001', name: 'Mobile', description: 'Smartphones, feature phones, tablets and mobile accessories' },
    { code: 'CAT-00002', name: 'Computer', description: 'Desktops, laptops, printers and peripherals' },
    { code: 'CAT-00003', name: 'Home Appliance', description: 'AC, refrigerator, washing machine, microwave, kitchen appliances' },
    { code: 'CAT-00004', name: 'Networking', description: 'Routers, switches, access points, network cables and accessories' },
    { code: 'CAT-00005', name: 'Power Solution', description: 'UPS, IPS, stabilizers, generators, batteries' },
    { code: 'CAT-00006', name: 'Security', description: 'CCTV cameras, DVRs, NVRs, alarms, access control' },
    { code: 'CAT-00007', name: 'Accessories', description: 'Cables, adapters, cases, chargers, screen guards' },
    { code: 'CAT-00008', name: 'Television', description: 'LED, QLED, OLED TVs and home theatre systems' },
    { code: 'CAT-00009', name: 'Refrigerator', description: 'Direct cool, frost-free, side-by-side, inverter refrigerators' },
    { code: 'CAT-00010', name: 'Washing Machine', description: 'Front load, top load, semi-automatic washing machines' },
    { code: 'CAT-00011', name: 'Air Conditioner', description: 'Split, window, portable, inverter AC units' },
    { code: 'CAT-00012', name: 'Microwave Oven', description: 'Solo, grill, convection microwave ovens' },
  ];
  const categoryMap = {};
  for (const c of categoryDefs) {
    const { record } = await findOrCreateByUnique(
      'category', 'code', c.code,
      { ...c, companyId, isActive: true },
      c.name
    );
    categoryMap[c.name] = record;
  }

  // ── 2. BRANDS (12) ──
  log('STEP', '2. Seeding Brands...');
  const brandDefs = [
    { code: 'BRD-00001', name: 'Samsung', description: 'South Korean multinational electronics' },
    { code: 'BRD-00002', name: 'LG', description: 'South Korean consumer electronics and appliances' },
    { code: 'BRD-00003', name: 'Sony', description: 'Japanese multinational — TVs, audio, gaming' },
    { code: 'BRD-00004', name: 'HP', description: 'American laptops, desktops and printers' },
    { code: 'BRD-00005', name: 'Dell', description: 'American laptops, desktops and servers' },
    { code: 'BRD-00006', name: 'Lenovo', description: 'Chinese laptops, desktops and tablets' },
    { code: 'BRD-00007', name: 'Apple', description: 'American premium smartphones, laptops and tablets' },
    { code: 'BRD-00008', name: 'Xiaomi', description: 'Chinese smartphones and smart-home devices' },
    { code: 'BRD-00009', name: 'APC', description: 'American UPS and power protection' },
    { code: 'BRD-00010', name: 'TP-Link', description: 'Chinese networking gear — routers, switches' },
    { code: 'BRD-00011', name: 'D-Link', description: 'Taiwanese networking solutions' },
    { code: 'BRD-00012', name: 'Asus', description: 'Taiwanese laptops, motherboards and networking' },
  ];
  const brandMap = {};
  for (const b of brandDefs) {
    const { record } = await findOrCreateByUnique(
      'brand', 'code', b.code,
      { ...b, companyId, isActive: true },
      b.name
    );
    brandMap[b.name] = record;
  }

  // ── 3. COLORS (10) ──
  log('STEP', '3. Seeding Colors...');
  const colorDefs = [
    { name: 'Black', colorCode: '#000000' },
    { name: 'White', colorCode: '#FFFFFF' },
    { name: 'Silver', colorCode: '#C0C0C0' },
    { name: 'Gray', colorCode: '#808080' },
    { name: 'Blue', colorCode: '#1E40AF' },
    { name: 'Red', colorCode: '#DC2626' },
    { name: 'Gold', colorCode: '#FFD700' },
    { name: 'Rose Gold', colorCode: '#B76E79' },
    { name: 'Space Gray', colorCode: '#4A4A4A' },
    { name: 'Midnight', colorCode: '#191970' },
  ];
  const colorMap = {};
  for (const c of colorDefs) {
    // Color has no code; use (companyId, name) for idempotency
    const { record } = await findOrCreate(
      'color',
      { name: c.name, companyId },
      { ...c, companyId, isActive: true },
      c.name
    );
    colorMap[c.name] = record;
  }

  // ── 4. UNITS (9) ──
  log('STEP', '4. Seeding Units...');
  const unitDefs = [
    { code: 'UNT-00001', name: 'Piece', symbol: 'pcs', description: 'Single unit / item' },
    { code: 'UNT-00002', name: 'Box', symbol: 'box', description: 'Box containing multiple pieces' },
    { code: 'UNT-00003', name: 'Carton', symbol: 'ctn', description: 'Shipping carton' },
    { code: 'UNT-00004', name: 'Dozen', symbol: 'dz', description: '12 pieces' },
    { code: 'UNT-00005', name: 'Set', symbol: 'set', description: 'A coordinated set of items' },
    { code: 'UNT-00006', name: 'Pair', symbol: 'pair', description: 'Two matching items' },
    { code: 'UNT-00007', name: 'Meter', symbol: 'm', description: 'Length in meters (cables, fabric)' },
    { code: 'UNT-00008', name: 'Kilogram', symbol: 'kg', description: 'Weight in kilograms' },
    { code: 'UNT-00009', name: 'Liter', symbol: 'l', description: 'Volume in liters' },
  ];
  const unitMap = {};
  for (const u of unitDefs) {
    const { record } = await findOrCreateByUnique(
      'unit', 'code', u.code,
      { ...u, companyId, isActive: true },
      u.name
    );
    unitMap[u.name] = record;
  }

  // ── 5. GODOWNS (4) ──
  log('STEP', '5. Seeding Godowns...');
  const godownDefs = [
    {
      code: 'WH-00001', name: 'Main Warehouse',
      address: 'Industrial Area, Block-A, Tongi, Gazipur-1710',
      phone: '+8801711000011', inCharge: 'Jahangir Alam',
      status: 'ACTIVE', capacityValue: 5000, capacityUnit: 'units',
    },
    {
      code: 'WH-00002', name: 'Display Center',
      address: 'Level-5, Bashundhara City, Panthapath, Dhaka 1205',
      phone: '+8801711000012', inCharge: 'Shafiqul Hasan',
      status: 'ACTIVE', capacityValue: 800, capacityUnit: 'units',
    },
    {
      code: 'WH-00003', name: 'Branch Store',
      address: '1/3 Elephant Road, Dhaka 1205',
      phone: '+8801711000013', inCharge: 'Mizanur Rahman',
      status: 'ACTIVE', capacityValue: 1500, capacityUnit: 'units',
    },
    {
      code: 'WH-00004', name: 'Backup Storage',
      address: 'Sector-7, Uttara, Dhaka 1230',
      phone: '+8801711000014', inCharge: 'Rezaul Karim',
      status: 'ACTIVE', capacityValue: 3000, capacityUnit: 'units',
    },
  ];
  const godownMap = {};
  for (const g of godownDefs) {
    const { record } = await findOrCreateByUnique(
      'godown', 'code', g.code,
      { ...g, companyId, isActive: true },
      g.name
    );
    godownMap[g.name] = record;
  }

  // ── 6. DEPARTMENTS (7) ──
  log('STEP', '6. Seeding Departments...');
  const departmentDefs = [
    { code: 'DEPT-00001', name: 'Sales', description: 'Sales, dealer management and order fulfillment' },
    { code: 'DEPT-00002', name: 'Marketing', description: 'Promotions, advertising and brand management' },
    { code: 'DEPT-00003', name: 'Finance', description: 'Finance, accounting and banking operations' },
    { code: 'DEPT-00004', name: 'HR', description: 'Human resources, recruitment and payroll' },
    { code: 'DEPT-00005', name: 'IT', description: 'Information technology, systems and support' },
    { code: 'DEPT-00006', name: 'Operations', description: 'Inventory, warehouse and logistics operations' },
    { code: 'DEPT-00007', name: 'Customer Service', description: 'Customer support, complaints and after-sales' },
  ];
  const departmentMap = {};
  for (const d of departmentDefs) {
    const { record } = await findOrCreateByUnique(
      'department', 'code', d.code,
      { ...d, companyId, isActive: true },
      d.name
    );
    departmentMap[d.name] = record;
  }

  // ── 7. DESIGNATIONS (7) — each linked to a department ──
  log('STEP', '7. Seeding Designations...');
  const designationDefs = [
    {
      code: 'DSG-00001', name: 'Manager', department: 'Operations',
      gradeLevel: 'Grade-1', salaryBandMin: 60000, salaryBandMax: 120000,
      description: 'Department / branch manager',
    },
    {
      code: 'DSG-00002', name: 'Sales Representative (SR)', department: 'Sales',
      gradeLevel: 'Grade-3', salaryBandMin: 18000, salaryBandMax: 35000,
      description: 'Field sales representative with monthly target',
    },
    {
      code: 'DSG-00003', name: 'Cashier', department: 'Finance',
      gradeLevel: 'Grade-4', salaryBandMin: 15000, salaryBandMax: 25000,
      description: 'Counter cashier and cash collection handling',
    },
    {
      code: 'DSG-00004', name: 'Accountant', department: 'Finance',
      gradeLevel: 'Grade-2', salaryBandMin: 35000, salaryBandMax: 60000,
      description: 'Accountant — bookkeeping and ledger reconciliation',
    },
    {
      code: 'DSG-00005', name: 'Store Keeper', department: 'Operations',
      gradeLevel: 'Grade-4', salaryBandMin: 16000, salaryBandMax: 28000,
      description: 'Warehouse store keeper — stock receiving and dispatch',
    },
    {
      code: 'DSG-00006', name: 'Sales Executive', department: 'Sales',
      gradeLevel: 'Grade-3', salaryBandMin: 20000, salaryBandMax: 40000,
      description: 'Showroom sales executive',
    },
    {
      code: 'DSG-00007', name: 'Branch Manager', department: 'Operations',
      gradeLevel: 'Grade-1', salaryBandMin: 70000, salaryBandMax: 130000,
      description: 'Branch manager — oversees all branch operations',
    },
  ];
  const designationMap = {};
  for (const d of designationDefs) {
    const dept = departmentMap[d.department];
    if (!dept) throw new Error(`Department not found: ${d.department}`);
    const { record } = await findOrCreateByUnique(
      'designation', 'code', d.code,
      {
        code: d.code, name: d.name,
        departmentId: dept.id,
        gradeLevel: d.gradeLevel,
        salaryBandMin: d.salaryBandMin,
        salaryBandMax: d.salaryBandMax,
        description: d.description,
        companyId, isActive: true,
      },
      d.name
    );
    designationMap[d.name] = record;
  }

  // ── 8. CHART OF ACCOUNTS — 5 roots + 20 sub-accounts ──
  log('STEP', '8. Seeding Chart of Accounts...');
  const coaRootDefs = [
    { code: 'COA-ROOT-ASSET', name: 'Assets', classification: 'Asset', openingBalanceType: 'Dr', isRoot: true },
    { code: 'COA-ROOT-LIABILITY', name: 'Liabilities', classification: 'Liability', openingBalanceType: 'Cr', isRoot: true },
    { code: 'COA-ROOT-EQUITY', name: 'Equity', classification: 'Equity', openingBalanceType: 'Cr', isRoot: true },
    { code: 'COA-ROOT-REVENUE', name: 'Revenue', classification: 'Revenue', openingBalanceType: 'Cr', isRoot: true },
    { code: 'COA-ROOT-EXPENSE', name: 'Expenses', classification: 'Expense', openingBalanceType: 'Dr', isRoot: true },
  ];
  const coaRootMap = {};
  for (const r of coaRootDefs) {
    const { record } = await findOrCreateByUnique(
      'chartOfAccount', 'code', r.code,
      {
        code: r.code, name: r.name, classification: r.classification,
        openingBalance: 0, openingBalanceType: r.openingBalanceType,
        currentBalance: 0, isRoot: true,
        companyId, isActive: true,
      },
      r.name
    );
    coaRootMap[r.code] = record;
  }

  const coaSubDefs = [
    // ASSETS (parent: COA-ROOT-ASSET)
    { code: 'COA-ASSET-CASH', name: 'Cash in Hand', classification: 'Asset', parent: 'COA-ROOT-ASSET', openingBalanceType: 'Dr' },
    { code: 'COA-ASSET-BANK', name: 'Bank Accounts', classification: 'Asset', parent: 'COA-ROOT-ASSET', openingBalanceType: 'Dr' },
    { code: 'COA-ASSET-AR', name: 'Accounts Receivable', classification: 'Asset', parent: 'COA-ROOT-ASSET', openingBalanceType: 'Dr' },
    { code: 'COA-ASSET-INVENTORY', name: 'Inventory Asset', classification: 'Asset', parent: 'COA-ROOT-ASSET', openingBalanceType: 'Dr' },
    { code: 'COA-ASSET-MFS', name: 'Mobile Financial Services (bKash/Nagad)', classification: 'Asset', parent: 'COA-ROOT-ASSET', openingBalanceType: 'Dr' },
    // LIABILITIES (parent: COA-ROOT-LIABILITY)
    { code: 'COA-LIAB-AP', name: 'Accounts Payable', classification: 'Liability', parent: 'COA-ROOT-LIABILITY', openingBalanceType: 'Cr' },
    { code: 'COA-LIAB-LOAN', name: 'Bank Loan', classification: 'Liability', parent: 'COA-ROOT-LIABILITY', openingBalanceType: 'Cr' },
    { code: 'COA-LIAB-VAT', name: 'VAT Payable', classification: 'Liability', parent: 'COA-ROOT-LIABILITY', openingBalanceType: 'Cr' },
    { code: 'COA-LIAB-TAX', name: 'Tax Payable', classification: 'Liability', parent: 'COA-ROOT-LIABILITY', openingBalanceType: 'Cr' },
    // EQUITY (parent: COA-ROOT-EQUITY)
    { code: 'COA-EQ-CAPITAL', name: 'Owner Capital', classification: 'Equity', parent: 'COA-ROOT-EQUITY', openingBalanceType: 'Cr' },
    { code: 'COA-EQ-RETAINED', name: 'Retained Earnings', classification: 'Equity', parent: 'COA-ROOT-EQUITY', openingBalanceType: 'Cr' },
    // REVENUE (parent: COA-ROOT-REVENUE)
    { code: 'COA-REV-SALES', name: 'Sales Revenue', classification: 'Revenue', parent: 'COA-ROOT-REVENUE', openingBalanceType: 'Cr' },
    { code: 'COA-REV-SERVICE', name: 'Service Income', classification: 'Revenue', parent: 'COA-ROOT-REVENUE', openingBalanceType: 'Cr' },
    { code: 'COA-REV-INTEREST', name: 'Interest Income', classification: 'Revenue', parent: 'COA-ROOT-REVENUE', openingBalanceType: 'Cr' },
    // EXPENSE (parent: COA-ROOT-EXPENSE)
    { code: 'COA-EXP-RENT', name: 'Rent Expense', classification: 'Expense', parent: 'COA-ROOT-EXPENSE', openingBalanceType: 'Dr' },
    { code: 'COA-EXP-SALARY', name: 'Salary Expense', classification: 'Expense', parent: 'COA-ROOT-EXPENSE', openingBalanceType: 'Dr' },
    { code: 'COA-EXP-UTILITY', name: 'Utility Bill Expense', classification: 'Expense', parent: 'COA-ROOT-EXPENSE', openingBalanceType: 'Dr' },
    { code: 'COA-EXP-TRANSPORT', name: 'Transportation Expense', classification: 'Expense', parent: 'COA-ROOT-EXPENSE', openingBalanceType: 'Dr' },
    { code: 'COA-EXP-SUPPLIES', name: 'Office Supplies Expense', classification: 'Expense', parent: 'COA-ROOT-EXPENSE', openingBalanceType: 'Dr' },
    { code: 'COA-EXP-COGS', name: 'Cost of Goods Sold (COGS)', classification: 'Expense', parent: 'COA-ROOT-EXPENSE', openingBalanceType: 'Dr' },
  ];
  const coaSubMap = {};
  for (const s of coaSubDefs) {
    const parent = coaRootMap[s.parent];
    if (!parent) throw new Error(`CoA parent not found: ${s.parent}`);
    const { record } = await findOrCreateByUnique(
      'chartOfAccount', 'code', s.code,
      {
        code: s.code, name: s.name, classification: s.classification,
        parentAccountId: parent.id,
        openingBalance: 0, openingBalanceType: s.openingBalanceType,
        currentBalance: 0, isRoot: false,
        companyId, isActive: true,
      },
      s.name
    );
    coaSubMap[s.code] = record;
  }

  // ── 9. BANKS (8) ──
  log('STEP', '9. Seeding Banks...');
  const bankDefs = [
    {
      bankName: 'Standard Chartered', bankType: 'Bank',
      branch: 'Gulshan', accountNo: 'SC-12345678901', accountHolder: 'Electronics Mart',
      openingBalance: 1500000,
    },
    {
      bankName: 'HSBC', bankType: 'Bank',
      branch: 'Dhanmondi', accountNo: 'HSBC-98765432109', accountHolder: 'Electronics Mart',
      openingBalance: 850000,
    },
    {
      bankName: 'City Bank', bankType: 'Bank',
      branch: 'Motijheel', accountNo: 'CBL-11223344556', accountHolder: 'Electronics Mart',
      openingBalance: 600000,
    },
    {
      bankName: 'BRAC Bank', bankType: 'Bank',
      branch: 'Panthapath', accountNo: 'BRAC-66778899001', accountHolder: 'Electronics Mart',
      openingBalance: 475000,
    },
    {
      bankName: 'Dutch-Bangla Bank', bankType: 'Bank',
      branch: 'Mirpur', accountNo: 'DBBL-22334455667', accountHolder: 'Electronics Mart',
      openingBalance: 320000,
    },
    {
      bankName: 'bKash', bankType: 'MFS',
      branch: 'Mobile', accountNo: '01711000022', accountHolder: 'Electronics Mart',
      openingBalance: 75000,
    },
    {
      bankName: 'Nagad', bankType: 'MFS',
      branch: 'Mobile', accountNo: '01711000033', accountHolder: 'Electronics Mart',
      openingBalance: 45000,
    },
    {
      bankName: 'Rocket', bankType: 'MFS',
      branch: 'Mobile', accountNo: '01711000044-1', accountHolder: 'Electronics Mart',
      openingBalance: 30000,
    },
  ];
  const bankMap = {};
  for (const b of bankDefs) {
    const { record } = await findOrCreate(
      'bank',
      { accountNo: b.accountNo, companyId },
      {
        bankName: b.bankName, bankType: b.bankType, branch: b.branch,
        accountNo: b.accountNo, accountHolder: b.accountHolder,
        openingBalance: b.openingBalance,
        currentBalance: b.openingBalance,
        chartOfAccountId: b.bankType === 'Bank' ? coaSubMap['COA-ASSET-BANK'].id : coaSubMap['COA-ASSET-MFS'].id,
        companyId, isActive: true,
      },
      b.bankName
    );
    bankMap[b.bankName] = record;
  }

  // ── 10. EXPENSE INCOME HEADS (8) ──
  log('STEP', '10. Seeding Expense/Income Heads...');
  const headDefs = [
    { code: 'EIH-00001', name: 'Rent', type: 'Expense', coa: 'COA-EXP-RENT' },
    { code: 'EIH-00002', name: 'Salary', type: 'Expense', coa: 'COA-EXP-SALARY' },
    { code: 'EIH-00003', name: 'Utility Bill', type: 'Expense', coa: 'COA-EXP-UTILITY' },
    { code: 'EIH-00004', name: 'Transportation', type: 'Expense', coa: 'COA-EXP-TRANSPORT' },
    { code: 'EIH-00005', name: 'Office Supplies', type: 'Expense', coa: 'COA-EXP-SUPPLIES' },
    { code: 'EIH-00006', name: 'Sales Revenue', type: 'Income', coa: 'COA-REV-SALES' },
    { code: 'EIH-00007', name: 'Service Income', type: 'Income', coa: 'COA-REV-SERVICE' },
    { code: 'EIH-00008', name: 'Interest Income', type: 'Income', coa: 'COA-REV-INTEREST' },
  ];
  const headMap = {};
  for (const h of headDefs) {
    const { record } = await findOrCreateByUnique(
      'expenseIncomeHead', 'code', h.code,
      {
        code: h.code, name: h.name, type: h.type,
        chartOfAccountId: coaSubMap[h.coa].id,
        companyId, isActive: true,
      },
      `${h.name} (${h.type})`
    );
    headMap[h.name] = record;
  }

  // ── 11. PAYMENT OPTIONS (7) ──
  log('STEP', '11. Seeding Payment Options...');
  const paymentOptionDefs = [
    { name: 'Cash', status: 'ACTIVE' },
    { name: 'Bank Transfer', status: 'ACTIVE' },
    { name: 'bKash', status: 'ACTIVE' },
    { name: 'Nagad', status: 'ACTIVE' },
    { name: 'Rocket', status: 'ACTIVE' },
    { name: 'Credit Card', status: 'ACTIVE' },
    { name: 'Debit Card', status: 'ACTIVE' },
  ];
  const paymentOptionMap = {};
  for (const p of paymentOptionDefs) {
    const { record } = await findOrCreate(
      'paymentOption',
      { name: p.name, companyId },
      { ...p, companyId, isActive: true },
      p.name
    );
    paymentOptionMap[p.name] = record;
  }

  // ── 12. CARD TYPES (4) ──
  log('STEP', '12. Seeding Card Types...');
  const cardTypeDefs = ['Visa', 'MasterCard', 'American Express', 'Union Pay'];
  const cardTypeMap = {};
  for (const ct of cardTypeDefs) {
    const { record } = await findOrCreate(
      'cardType',
      { name: ct, companyId },
      { name: ct, companyId, isActive: true },
      ct
    );
    cardTypeMap[ct] = record;
  }

  // ── 13. SEGMENTS (3) ──
  log('STEP', '13. Seeding Segments...');
  const segmentDefs = [
    { code: 'SEG-00001', name: 'Premium', description: 'Premium tier — flagship products' },
    { code: 'SEG-00002', name: 'Mid-range', description: 'Mid-range tier — best value' },
    { code: 'SEG-00003', name: 'Budget', description: 'Budget tier — entry-level products' },
  ];
  const segmentMap = {};
  for (const s of segmentDefs) {
    const { record } = await findOrCreateByUnique(
      'segment', 'code', s.code,
      { ...s, companyId, isActive: true },
      s.name
    );
    segmentMap[s.name] = record;
  }

  // ── 14. CAPACITIES (5) ──
  log('STEP', '14. Seeding Capacities...');
  const capacityDefs = [
    { code: 'CAP-00001', name: '64GB', capacityValue: 64, capacityUnit: 'GB', description: '64 gigabytes storage' },
    { code: 'CAP-00002', name: '128GB', capacityValue: 128, capacityUnit: 'GB', description: '128 gigabytes storage' },
    { code: 'CAP-00003', name: '256GB', capacityValue: 256, capacityUnit: 'GB', description: '256 gigabytes storage' },
    { code: 'CAP-00004', name: '512GB', capacityValue: 512, capacityUnit: 'GB', description: '512 gigabytes storage' },
    { code: 'CAP-00005', name: '1TB', capacityValue: 1024, capacityUnit: 'GB', description: '1 terabyte storage' },
  ];
  const capacityMap = {};
  for (const c of capacityDefs) {
    const { record } = await findOrCreateByUnique(
      'capacity', 'code', c.code,
      { ...c, companyId, isActive: true },
      c.name
    );
    capacityMap[c.name] = record;
  }

  // ── 15. PRODUCTS (15) ──
  log('STEP', '15. Seeding Products...');
  const productDefs = [
    // Mobile
    { code: 'PRD-00001', name: 'Samsung Galaxy S24 Ultra 256GB', category: 'Mobile', brand: 'Samsung', color: 'Black', segment: 'Premium', cost: 95000, sale: 119000, ws: 112000, dl: 108000, stock: 25, reorder: 5, imei: '356789012345601' },
    { code: 'PRD-00002', name: 'Apple iPhone 15 Pro 128GB', category: 'Mobile', brand: 'Apple', color: 'Space Gray', segment: 'Premium', cost: 115000, sale: 139000, ws: 132000, dl: 128000, stock: 18, reorder: 4, imei: '356789012345602' },
    { code: 'PRD-00003', name: 'Xiaomi Redmi Note 13 Pro', category: 'Mobile', brand: 'Xiaomi', color: 'Blue', segment: 'Mid-range', cost: 22000, sale: 27500, ws: 25500, dl: 24500, stock: 60, reorder: 10, imei: '356789012345603' },
    { code: 'PRD-00004', name: 'Samsung Galaxy A15', category: 'Mobile', brand: 'Samsung', color: 'Silver', segment: 'Budget', cost: 15500, sale: 19500, ws: 18000, dl: 17500, stock: 80, reorder: 15, imei: '356789012345604' },
    // Computer
    { code: 'PRD-00005', name: 'HP Pavilion 15 Laptop i5 8GB 512GB', category: 'Computer', brand: 'HP', color: 'Silver', segment: 'Mid-range', cost: 58000, sale: 72000, ws: 68000, dl: 65500, stock: 30, reorder: 6 },
    { code: 'PRD-00006', name: 'Dell Inspiron 14 Laptop i7 16GB 1TB', category: 'Computer', brand: 'Dell', color: 'Black', segment: 'Premium', cost: 78000, sale: 96000, ws: 91000, dl: 88000, stock: 22, reorder: 5 },
    { code: 'PRD-00007', name: 'Lenovo IdeaPad Slim 3', category: 'Computer', brand: 'Lenovo', color: 'Gray', segment: 'Budget', cost: 38000, sale: 47000, ws: 44000, dl: 42500, stock: 40, reorder: 8 },
    { code: 'PRD-00008', name: 'Apple MacBook Air M2 256GB', category: 'Computer', brand: 'Apple', color: 'Midnight', segment: 'Premium', cost: 98000, sale: 122000, ws: 116000, dl: 112000, stock: 12, reorder: 3 },
    // Television
    { code: 'PRD-00009', name: 'Samsung 55" Crystal UHD 4K Smart TV', category: 'Television', brand: 'Samsung', color: 'Black', segment: 'Premium', cost: 65000, sale: 82000, ws: 77000, dl: 74000, stock: 20, reorder: 4 },
    { code: 'PRD-00010', name: 'LG 43" UHD 4K Smart TV', category: 'Television', brand: 'LG', color: 'Black', segment: 'Mid-range', cost: 42000, sale: 53000, ws: 50000, dl: 48000, stock: 28, reorder: 6 },
    // Home Appliance — Refrigerator, AC, Washing Machine, Microwave
    { code: 'PRD-00011', name: 'LG 290L Double Door Refrigerator', category: 'Refrigerator', brand: 'LG', color: 'Silver', segment: 'Mid-range', cost: 38000, sale: 47000, ws: 44000, dl: 42500, stock: 16, reorder: 4 },
    { code: 'PRD-00012', name: 'Samsung 1.5 Ton Inverter Split AC', category: 'Air Conditioner', brand: 'Samsung', color: 'White', segment: 'Premium', cost: 52000, sale: 65000, ws: 61500, dl: 59000, stock: 14, reorder: 3 },
    { code: 'PRD-00013', name: 'Whirlpool 7kg Front Load Washing Machine', category: 'Washing Machine', brand: 'LG', color: 'White', segment: 'Mid-range', cost: 32000, sale: 41000, ws: 38500, dl: 37000, stock: 12, reorder: 3 },
    { code: 'PRD-00014', name: 'Samsung 28L Convection Microwave Oven', category: 'Microwave Oven', brand: 'Samsung', color: 'Black', segment: 'Mid-range', cost: 14000, sale: 18500, ws: 17000, dl: 16500, stock: 25, reorder: 5 },
    // Power Solution + Networking
    { code: 'PRD-00015', name: 'APC Back-UPS 1500VA', category: 'Power Solution', brand: 'APC', color: 'Black', segment: 'Mid-range', cost: 9500, sale: 13000, ws: 12000, dl: 11500, stock: 35, reorder: 7 },
    { code: 'PRD-00016', name: 'TP-Link Archer AX1500 Wi-Fi 6 Router', category: 'Networking', brand: 'TP-Link', color: 'Black', segment: 'Budget', cost: 3200, sale: 4500, ws: 4100, dl: 3950, stock: 50, reorder: 10 },
    { code: 'PRD-00017', name: 'D-Link 8-Port Gigabit Switch', category: 'Networking', brand: 'D-Link', color: 'Black', segment: 'Budget', cost: 2100, sale: 3000, ws: 2700, dl: 2600, stock: 45, reorder: 8 },
  ];
  const productMap = {};
  for (const p of productDefs) {
    const cat = categoryMap[p.category];
    const br = brandMap[p.brand];
    const col = colorMap[p.color];
    const seg = segmentMap[p.segment];
    const gdn = godownMap['Main Warehouse'];
    if (!cat || !br || !col || !seg || !gdn) {
      throw new Error(`Reference missing for product ${p.name}`);
    }
    const { record } = await findOrCreateByUnique(
      'product', 'productCode', p.code,
      {
        productCode: p.code,
        sku: `SKU-${p.code.split('-')[1]}`,
        barcode: `880${p.code.split('-')[1]}0000`,
        name: p.name,
        categoryId: cat.id,
        colorId: col.id,
        brandId: br.id,
        unit: 'Piece',
        sizeCapacity: null,
        costPrice: p.cost,
        salePrice: p.sale,
        wholesalePrice: p.ws,
        dealerPrice: p.dl,
        openingStock: p.stock,
        reorderLevel: p.reorder,
        godownId: gdn.id,
        segmentId: seg.id,
        companyId,
        imeiNumber: p.imei || null,
        image: null,
        isActive: true,
      },
      p.name
    );
    productMap[p.code] = record;
  }

  // ── 16. CUSTOMERS (6) ──
  log('STEP', '16. Seeding Customers...');
  const customerDefs = [
    {
      code: 'CUS-00001', name: 'Rahim Uddin Ahmed',
      phone: '+8801711000201', email: 'rahim.uddin@example.com',
      address: 'House 12, Road 5, Dhanmondi, Dhaka 1205', area: 'Dhanmondi',
      openingBalance: 25000, openingType: 'Dr', creditLimit: 100000, customerType: 'Regular',
      reference: 'Walk-in',
    },
    {
      code: 'CUS-00002', name: 'Karim Sheikh',
      phone: '+8801711000202', email: 'karim.sheikh@example.com',
      address: 'Flat A2, 21 Mirpur Road, Dhaka 1216', area: 'Mirpur',
      openingBalance: 0, openingType: 'Dr', creditLimit: 50000, customerType: 'Regular',
      reference: 'Friend referral',
    },
    {
      code: 'CUS-00003', name: 'Salma Begum',
      phone: '+8801711000203', email: 'salma.begum@example.com',
      address: '55 Banani C/A, Dhaka 1213', area: 'Banani',
      openingBalance: 12500, openingType: 'Cr', creditLimit: 80000, customerType: 'Regular',
      reference: 'Facebook Ad',
    },
    {
      code: 'CUS-00004', name: 'Ahsan Traders (Dealer)',
      phone: '+8801711000204', email: 'info@ahsantraders.com',
      address: 'Shop 14, Jamuna Future Park, Dhaka', area: 'Bashundhara',
      openingBalance: 75000, openingType: 'Dr', creditLimit: 500000, customerType: 'Dealer',
      reference: 'Wholesale application',
    },
    {
      code: 'CUS-00005', name: 'Nadia Islam',
      phone: '+8801711000205', email: 'nadia.islam@example.com',
      address: 'House 88, Road 11, Uttara, Dhaka 1230', area: 'Uttara',
      openingBalance: 0, openingType: 'Dr', creditLimit: 60000, customerType: 'Regular',
      reference: 'Walk-in',
    },
    {
      code: 'CUS-00006', name: 'Mahmud Hardware (Dealer)',
      phone: '+8801711000206', email: 'sales@mahmudhardware.com',
      address: '223 Nawabpur Road, Dhaka 1100', area: 'Nawabpur',
      openingBalance: 120000, openingType: 'Dr', creditLimit: 800000, customerType: 'Dealer',
      reference: 'Dealer network',
    },
  ];
  for (const c of customerDefs) {
    await findOrCreateByUnique(
      'customer', 'customerCode', c.code,
      {
        customerCode: c.code,
        name: c.name,
        phone: c.phone,
        email: c.email,
        address: c.address,
        area: c.area,
        reference: c.reference,
        openingBalance: c.openingBalance,
        openingBalanceType: c.openingType,
        currentBalance: c.openingBalance,
        currentBalanceType: c.openingType,
        creditLimit: c.creditLimit,
        creditStatus: 'Active',
        customerType: c.customerType,
        coaAccountId: coaSubMap['COA-ASSET-AR'].id,
        companyId,
        isActive: true,
      },
      c.name
    );
  }

  // ── 17. SUPPLIERS (6) ──
  log('STEP', '17. Seeding Suppliers...');
  const supplierDefs = [
    {
      code: 'SUP-00001', name: 'Samsung Bangladesh Pvt Ltd',
      contactPerson: 'Mr. Park', phone: '+8809678000001', email: 'b2b@samsung.com.bd',
      address: 'Gulshan-2, Dhaka 1212', area: 'Gulshan', terms: 'Net 30',
      openingBalance: 150000, openingType: 'Cr', creditLimit: 1000000,
    },
    {
      code: 'SUP-00002', name: 'LG Electronics Bangladesh',
      contactPerson: 'Mr. Lee', phone: '+8809678000002', email: 'b2b@lg.com.bd',
      address: 'Banani, Dhaka 1213', area: 'Banani', terms: 'Net 45',
      openingBalance: 95000, openingType: 'Cr', creditLimit: 800000,
    },
    {
      code: 'SUP-00003', name: 'Sony Distributors BD',
      contactPerson: 'Mr. Tanaka', phone: '+8809678000003', email: 'b2b@sony.com.bd',
      address: 'Motijheel C/A, Dhaka 1000', area: 'Motijheel', terms: 'Net 30',
      openingBalance: 60000, openingType: 'Cr', creditLimit: 500000,
    },
    {
      code: 'SUP-00004', name: 'HP Bangladesh Authorized Distributor',
      contactPerson: 'Mr. Rahman', phone: '+8809678000004', email: 'b2b@hp.com.bd',
      address: 'Kawran Bazar, Dhaka 1215', area: 'Kawran Bazar', terms: 'Net 60',
      openingBalance: 0, openingType: 'Cr', creditLimit: 1200000,
    },
    {
      code: 'SUP-00005', name: 'Xiaomi BD Wholesale',
      contactPerson: 'Ms. Chen', phone: '+8809678000005', email: 'wholesale@xiaomi.com.bd',
      address: 'Bashundhara R/A, Dhaka 1229', area: 'Bashundhara', terms: 'Net 30',
      openingBalance: 42000, openingType: 'Cr', creditLimit: 600000,
    },
    {
      code: 'SUP-00006', name: 'APC Power Solutions BD',
      contactPerson: 'Mr. Ahmed', phone: '+8809678000006', email: 'b2b@apc.com.bd',
      address: 'Tejgaon I/A, Dhaka 1208', area: 'Tejgaon', terms: 'Net 45',
      openingBalance: 18000, openingType: 'Cr', creditLimit: 350000,
    },
  ];
  for (const s of supplierDefs) {
    await findOrCreateByUnique(
      'supplier', 'supplierCode', s.code,
      {
        supplierCode: s.code,
        name: s.name,
        contactPerson: s.contactPerson,
        phone: s.phone,
        email: s.email,
        address: s.address,
        area: s.area,
        terms: s.terms,
        openingBalance: s.openingBalance,
        openingBalanceType: s.openingType,
        currentBalance: s.openingBalance,
        currentBalanceType: s.openingType,
        creditLimit: s.creditLimit,
        creditStatus: 'Active',
        companyId,
        isActive: true,
      },
      s.name
    );
  }

  // ── 18. EMPLOYEES (6) — depends on Designation + Department ──
  log('STEP', '18. Seeding Employees...');
  const today = new Date();
  const joiningDate = new Date(today.getFullYear() - 1, today.getMonth(), 1);

  // Helper to compute NID-like number per employee (unique per company)
  const employeeDefs = [
    {
      code: 'EMP-00001', name: 'Amit Sharma',
      designation: 'Manager', department: 'Operations',
      baseSalary: 85000, type: 'Permanent',
      gender: 'Male', bloodGroup: 'B+', religion: 'Hinduism',
      phone: '+8801811000301', email: 'amit.sharma@electronicsmart.com.bd',
      nid: '1990123456789012', fatherName: 'Rajesh Sharma', motherName: 'Sushma Sharma',
      presentAddress: 'House 12, Road 4, Banani, Dhaka', permanentAddress: 'Village: Sylhet, Bangladesh',
      bankName: 'Standard Chartered', bankAccountNo: 'SC-EMP-0001',
    },
    {
      code: 'EMP-00002', name: 'Kamal Hossain',
      designation: 'Sales Representative (SR)', department: 'Sales',
      baseSalary: 25000, type: 'Permanent',
      gender: 'Male', bloodGroup: 'O+', religion: 'Islam',
      phone: '+8801811000302', email: 'kamal.hossain@electronicsmart.com.bd',
      nid: '1992234567890123', fatherName: 'Akram Hossain', motherName: 'Roksana Begum',
      presentAddress: 'Flat B3, Mirpur 10, Dhaka', permanentAddress: 'Village: Comilla, Bangladesh',
      bankName: 'BRAC Bank', bankAccountNo: 'BRAC-EMP-0002',
    },
    {
      code: 'EMP-00003', name: 'Fatima Khan',
      designation: 'Cashier', department: 'Finance',
      baseSalary: 22000, type: 'Permanent',
      gender: 'Female', bloodGroup: 'A+', religion: 'Islam',
      phone: '+8801811000303', email: 'fatima.khan@electronicsmart.com.bd',
      nid: '1995345678901234', fatherName: 'Sajjad Khan', motherName: 'Nasreen Khan',
      presentAddress: 'House 33, Dhanmondi, Dhaka', permanentAddress: 'Village: Khulna, Bangladesh',
      bankName: 'City Bank', bankAccountNo: 'CBL-EMP-0003',
    },
    {
      code: 'EMP-00004', name: 'Rakib Hasan',
      designation: 'Accountant', department: 'Finance',
      baseSalary: 48000, type: 'Permanent',
      gender: 'Male', bloodGroup: 'AB+', religion: 'Islam',
      phone: '+8801811000304', email: 'rakib.hasan@electronicsmart.com.bd',
      nid: '1991456789012345', fatherName: 'Tofazzal Hossain', motherName: 'Hamida Begum',
      presentAddress: 'House 7, Uttara Sector-4, Dhaka', permanentAddress: 'Village: Bogura, Bangladesh',
      bankName: 'Dutch-Bangla Bank', bankAccountNo: 'DBBL-EMP-0004',
    },
    {
      code: 'EMP-00005', name: 'Mizanur Rahman',
      designation: 'Store Keeper', department: 'Operations',
      baseSalary: 22000, type: 'Permanent',
      gender: 'Male', bloodGroup: 'B-', religion: 'Islam',
      phone: '+8801811000305', email: 'mizanur.rahman@electronicsmart.com.bd',
      nid: '1988567890123456', fatherName: 'Mokbul Rahman', motherName: 'Halima Khatun',
      presentAddress: 'House 21, Mohammadpur, Dhaka', permanentAddress: 'Village: Faridpur, Bangladesh',
      bankName: 'BRAC Bank', bankAccountNo: 'BRAC-EMP-0005',
    },
    {
      code: 'EMP-00006', name: 'Shafiqul Hasan',
      designation: 'Branch Manager', department: 'Operations',
      baseSalary: 95000, type: 'Permanent',
      gender: 'Male', bloodGroup: 'O-', religion: 'Islam',
      phone: '+8801811000306', email: 'shafiqul.hasan@electronicsmart.com.bd',
      nid: '1984678901234567', fatherName: 'Jahidul Hasan', motherName: 'Rashida Begum',
      presentAddress: 'House 99, Gulshan-1, Dhaka', permanentAddress: 'Village: Tangail, Bangladesh',
      bankName: 'HSBC', bankAccountNo: 'HSBC-EMP-0006',
    },
  ];
  const employeeMap = {};
  for (const e of employeeDefs) {
    const dsg = designationMap[e.designation];
    const dept = departmentMap[e.department];
    if (!dsg || !dept) throw new Error(`Designation/Department missing for ${e.name}`);
    const { record } = await findOrCreateByUnique(
      'employee', 'employeeCode', e.code,
      {
        employeeCode: e.code,
        name: e.name,
        designationId: dsg.id,
        departmentId: dept.id,
        joiningDate,
        baseSalary: e.baseSalary,
        employeeType: e.type,
        status: 'Active',
        gender: e.gender,
        bloodGroup: e.bloodGroup,
        religion: e.religion,
        fatherName: e.fatherName,
        motherName: e.motherName,
        phone: e.phone,
        email: e.email,
        presentAddress: e.presentAddress,
        permanentAddress: e.permanentAddress,
        emergencyContact: e.phone,
        emergencyContactName: e.fatherName,
        nidNumber: e.nid,
        bankName: e.bankName,
        bankAccountNo: e.bankAccountNo,
        maritalStatus: 'Married',
        address: e.presentAddress,
        companyId,
        isActive: true,
      },
      e.name
    );
    employeeMap[e.code] = record;
  }

  // ── 19. SR TARGETS (2) — depends on SR Employees ──
  log('STEP', '19. Seeding SR Targets...');
  const srEmployee = employeeMap['EMP-00002']; // Kamal Hossain — SR
  const srEmployee2 = employeeMap['EMP-00001']; // Amit Sharma — Manager (also acts as SR supervisor)
  const currentMonth = today.getMonth() + 1; // 1-12
  const currentYear = today.getFullYear();

  const srTargetDefs = [
    {
      employeeId: srEmployee.id,
      month: currentMonth, year: currentYear,
      targetAmount: 500000,
      minimumSalesQuota: 250000,
      commissionPercentage: 2.5,
      status: 'ACTIVE',
    },
    {
      employeeId: srEmployee2.id,
      month: currentMonth, year: currentYear,
      targetAmount: 1500000,
      minimumSalesQuota: 750000,
      commissionPercentage: 1.5,
      status: 'ACTIVE',
    },
  ];
  for (const t of srTargetDefs) {
    const existing = await prisma.sRTargetSetup.findFirst({
      where: {
        employeeId: t.employeeId,
        month: t.month,
        year: t.year,
        companyId,
      },
    });
    if (existing) {
      log('SKIP', `SR Target for ${t.employeeId} already exists`);
      continue;
    }
    await prisma.sRTargetSetup.create({
      data: { ...t, companyId, isActive: true },
    });
    log('CREATE', `SR Target for employee ${t.employeeId} — ${t.targetAmount} BDT`);
  }

  // ── 20. SMS SETTINGS (1) ──
  log('STEP', '20. Seeding SMS Settings...');
  const smsSettingsDef = {
    apiUrl: 'https://api.smsbangladesh.com/api/v3/sms/send',
    apiKey: 'sms-api-key-placeholder-001',
    senderId: 'EMART',
    maskingName: 'ELECTRONICS MART',
    maskingRegId: 'BTRC-MASK-2025-001',
    gatewayName: 'BulkSMSBD',
    ratePerSms: 0.35,
    unicodeRate: 0.55,
    creditBalanceLimit: 10000,
    lastKnownCreditBalance: 8500,
    setupCost: 1500,
  };
  const existingSms = await prisma.smsSetting.findFirst({ where: { companyId } });
  if (existingSms) {
    log('SKIP', 'SMS Settings already exist');
  } else {
    await prisma.smsSetting.create({
      data: { ...smsSettingsDef, companyId, isActive: true },
    });
    log('CREATE', 'SMS Settings');
  }

  // ── 21. SMS AUTOMATION CONFIG (1) ──
  log('STEP', '21. Seeding SMS Automation Config...');
  const existingAutoCfg = await prisma.smsAutomationConfig.findFirst({ where: { companyId } });
  if (existingAutoCfg) {
    log('SKIP', 'SMS Automation Config already exists');
  } else {
    await prisma.smsAutomationConfig.create({
      data: {
        autoSmsOnPurchase: true,
        autoSmsOnReceipt: true,
        autoSmsOnStockReceive: true,
        autoSmsOnEmployeeEvent: true,
        autoSmsOnPaymentReceive: true,
        autoSmsOnGodownReceive: true,
        autoSmsOnEmployeeJoin: true,
        autoSmsOnEmployeeExam: false, // disabled by default — exam SMS only when scheduled
        companyId,
        isActive: true,
      },
    });
    log('CREATE', 'SMS Automation Config (7 of 8 triggers enabled)');
  }

  // ── 22. SUMMARY ──
  console.log('\n========================================');
  console.log(' Seed Summary');
  console.log('========================================');
  const counts = {
    categories: await prisma.category.count({ where: { companyId } }),
    brands: await prisma.brand.count({ where: { companyId } }),
    colors: await prisma.color.count({ where: { companyId } }),
    units: await prisma.unit.count({ where: { companyId } }),
    godowns: await prisma.godown.count({ where: { companyId } }),
    departments: await prisma.department.count({ where: { companyId } }),
    designations: await prisma.designation.count({ where: { companyId } }),
    banks: await prisma.bank.count({ where: { companyId } }),
    chartOfAccounts: await prisma.chartOfAccount.count({ where: { companyId } }),
    expenseIncomeHeads: await prisma.expenseIncomeHead.count({ where: { companyId } }),
    paymentOptions: await prisma.paymentOption.count({ where: { companyId } }),
    cardTypes: await prisma.cardType.count({ where: { companyId } }),
    segments: await prisma.segment.count({ where: { companyId } }),
    capacities: await prisma.capacity.count({ where: { companyId } }),
    products: await prisma.product.count({ where: { companyId } }),
    customers: await prisma.customer.count({ where: { companyId } }),
    suppliers: await prisma.supplier.count({ where: { companyId } }),
    employees: await prisma.employee.count({ where: { companyId } }),
    srTargets: await prisma.sRTargetSetup.count({ where: { companyId } }),
    smsSettings: await prisma.smsSetting.count({ where: { companyId } }),
    smsAutomationConfigs: await prisma.smsAutomationConfig.count({ where: { companyId } }),
  };
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k.padEnd(22)} → ${v}`);
  }
  console.log('\n✅ Seed completed successfully.');
}

// ─────────────────────────────────────────────────────────────
// Bootstrap with proper error handling
// ─────────────────────────────────────────────────────────────

main()
  .catch((err) => {
    console.error('\n❌ Seed failed:', err);
    if (err && err.stack) console.error(err.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
