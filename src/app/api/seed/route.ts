import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    // Check if data already exists
    const existingCategories = await db.category.count();
    if (existingCategories > 0) {
      return NextResponse.json({ message: 'Already seeded - delete database to re-seed' });
    }

    await db.$transaction(async (tx) => {
      // ============================================================
      // DATES
      // ============================================================
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const twoDaysAgo = new Date(today);
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const oneWeekAgo = new Date(today);
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const twoWeeksAgo = new Date(today);
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      const oneMonthAgo = new Date(today);
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const twoMonthsAgo = new Date(today);
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
      const threeMonthsAgo = new Date(today);
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      // ============================================================
      // 1. CATEGORIES (8)
      // ============================================================
      const categories = await Promise.all([
        tx.category.create({ data: { name: 'Electronics', description: 'Consumer electronics and entertainment systems' } }),
        tx.category.create({ data: { name: 'Mobile', description: 'Smartphones, tablets and mobile accessories' } }),
        tx.category.create({ data: { name: 'Computer', description: 'Desktops, laptops, printers and peripherals' } }),
        tx.category.create({ data: { name: 'Accessories', description: 'Cables, adapters, cases and general accessories' } }),
        tx.category.create({ data: { name: 'Home Appliance', description: 'AC, refrigerator, washing machine and kitchen appliances' } }),
        tx.category.create({ data: { name: 'Networking', description: 'Routers, switches, access points and network cables' } }),
        tx.category.create({ data: { name: 'Security', description: 'CCTV cameras, DVRs, alarms and access control' } }),
        tx.category.create({ data: { name: 'Power Solution', description: 'UPS, IPS, stabilizers, generators and batteries' } }),
      ]);

      // ============================================================
      // 2. COLORS (8)
      // ============================================================
      const colors = await Promise.all([
        tx.color.create({ data: { name: 'Black', colorCode: '#000000' } }),
        tx.color.create({ data: { name: 'White', colorCode: '#FFFFFF' } }),
        tx.color.create({ data: { name: 'Blue', colorCode: '#0000FF' } }),
        tx.color.create({ data: { name: 'Red', colorCode: '#FF0000' } }),
        tx.color.create({ data: { name: 'Silver', colorCode: '#C0C0C0' } }),
        tx.color.create({ data: { name: 'Gold', colorCode: '#FFD700' } }),
        tx.color.create({ data: { name: 'Gray', colorCode: '#808080' } }),
        tx.color.create({ data: { name: 'Green', colorCode: '#008000' } }),
      ]);

      // ============================================================
      // 3. COMPANIES (8)
      // ============================================================
      const companies = await Promise.all([
        tx.company.create({ data: { name: 'Samsung', address: 'Gulshan-2, Dhaka 1212', phone: '+880-2-9881669', email: 'info@samsung.com.bd' } }),
        tx.company.create({ data: { name: 'LG', address: 'Banani, Dhaka 1213', phone: '+880-2-9881230', email: 'info@lg.com.bd' } }),
        tx.company.create({ data: { name: 'Sony', address: 'Motijheel C/A, Dhaka 1000', phone: '+880-2-9551234', email: 'info@sony.com.bd' } }),
        tx.company.create({ data: { name: 'Dell', address: 'Kawran Bazar, Dhaka 1215', phone: '+880-2-8123456', email: 'sales@dell.com.bd' } }),
        tx.company.create({ data: { name: 'HP', address: 'Dhanmondi, Dhaka 1205', phone: '+880-2-9123456', email: 'info@hp.com.bd' } }),
        tx.company.create({ data: { name: 'Lenovo', address: 'Uttara, Dhaka 1230', phone: '+880-2-8976543', email: 'info@lenovo.com.bd' } }),
        tx.company.create({ data: { name: 'Xiaomi', address: 'Bashundhara R/A, Dhaka 1229', phone: '+880-2-5551234', email: 'info@xiaomi.com.bd' } }),
        tx.company.create({ data: { name: 'Huawei', address: 'Tejgaon, Dhaka 1208', phone: '+880-2-8876543', email: 'info@huawei.com.bd' } }),
      ]);

      // ============================================================
      // 4. GODOWNS (3)
      // ============================================================
      const godowns = await Promise.all([
        tx.godown.create({ data: { name: 'Main Warehouse', address: 'Industrial Area, Block-A, Tongi, Gazipur', inCharge: 'Jahangir Alam' } }),
        tx.godown.create({ data: { name: 'Branch Store', address: '1/3 Elephant Road, Dhaka 1205', inCharge: 'Mizanur Rahman' } }),
        tx.godown.create({ data: { name: 'Display Center', address: 'Level-5, Bashundhara City, Dhaka', inCharge: 'Shafiqul Hasan' } }),
      ]);

      // ============================================================
      // 5. DEPARTMENTS (5)
      // ============================================================
      const departments = await Promise.all([
        tx.department.create({ data: { name: 'Sales', description: 'Sales, marketing and customer relationship department' } }),
        tx.department.create({ data: { name: 'Purchase', description: 'Procurement, vendor management and purchasing department' } }),
        tx.department.create({ data: { name: 'Accounts', description: 'Finance, accounting and banking department' } }),
        tx.department.create({ data: { name: 'IT', description: 'Information technology, systems and support department' } }),
        tx.department.create({ data: { name: 'Warehouse', description: 'Inventory management, logistics and warehouse operations' } }),
      ]);

      // ============================================================
      // 6. DESIGNATIONS (8)
      // ============================================================
      const designations = await Promise.all([
        tx.designation.create({ data: { name: 'Sales Manager', departmentId: departments[0].id } }),
        tx.designation.create({ data: { name: 'Sales Representative', departmentId: departments[0].id } }),
        tx.designation.create({ data: { name: 'Purchase Manager', departmentId: departments[1].id } }),
        tx.designation.create({ data: { name: 'Senior Accountant', departmentId: departments[2].id } }),
        tx.designation.create({ data: { name: 'IT Manager', departmentId: departments[3].id } }),
        tx.designation.create({ data: { name: 'Warehouse Supervisor', departmentId: departments[4].id } }),
        tx.designation.create({ data: { name: 'Junior Sales Rep', departmentId: departments[0].id } }),
        tx.designation.create({ data: { name: 'Accounts Executive', departmentId: departments[2].id } }),
      ]);

      // ============================================================
      // 7. EMPLOYEES (10) - Bangladeshi names
      // ============================================================
      const employees = await Promise.all([
        tx.employee.create({
          data: {
            employeeCode: 'EMP-001', name: 'Kamal Hossain', designationId: designations[0].id, departmentId: departments[0].id,
            joiningDate: new Date('2020-03-15'), phone: '+880-1712-345001', address: 'House 12, Road 5, Dhanmondi, Dhaka',
          },
        }),
        tx.employee.create({
          data: {
            employeeCode: 'EMP-002', name: 'Fatema Begum', designationId: designations[1].id, departmentId: departments[0].id,
            joiningDate: new Date('2021-06-01'), phone: '+880-1712-345002', address: 'Flat 3B, Green Road, Farmgate, Dhaka',
          },
        }),
        tx.employee.create({
          data: {
            employeeCode: 'EMP-003', name: 'Rafiqul Islam', designationId: designations[2].id, departmentId: departments[1].id,
            joiningDate: new Date('2019-11-20'), phone: '+880-1712-345003', address: 'House 45, Sector-7, Uttara, Dhaka',
          },
        }),
        tx.employee.create({
          data: {
            employeeCode: 'EMP-004', name: 'Nasreen Akhter', designationId: designations[3].id, departmentId: departments[2].id,
            joiningDate: new Date('2020-08-10'), phone: '+880-1712-345004', address: 'House 8, Road 12, Mirpur-10, Dhaka',
          },
        }),
        tx.employee.create({
          data: {
            employeeCode: 'EMP-005', name: 'Arif Mahmud', designationId: designations[4].id, departmentId: departments[3].id,
            joiningDate: new Date('2022-01-05'), phone: '+880-1712-345005', address: 'Flat 5A, Bashundhara R/A, Dhaka',
          },
        }),
        tx.employee.create({
          data: {
            employeeCode: 'EMP-006', name: 'Jahanara Khatun', designationId: designations[5].id, departmentId: departments[4].id,
            joiningDate: new Date('2021-04-18'), phone: '+880-1712-345006', address: 'House 22, Tongi Bazar, Gazipur',
          },
        }),
        tx.employee.create({
          data: {
            employeeCode: 'EMP-007', name: 'Shahidul Islam', designationId: designations[6].id, departmentId: departments[0].id,
            joiningDate: new Date('2023-02-14'), phone: '+880-1712-345007', address: 'Room 4, BBA Hostel, Mohakhali, Dhaka',
          },
        }),
        tx.employee.create({
          data: {
            employeeCode: 'EMP-008', name: 'Momena Khatun', designationId: designations[7].id, departmentId: departments[2].id,
            joiningDate: new Date('2022-09-01'), phone: '+880-1712-345008', address: 'House 17, Banasree, Dhaka',
          },
        }),
        tx.employee.create({
          data: {
            employeeCode: 'EMP-009', name: 'Abdus Salam', designationId: designations[1].id, departmentId: departments[0].id,
            joiningDate: new Date('2023-07-20'), phone: '+880-1712-345009', address: 'Village: Charbadma, Chandpur',
          },
        }),
        tx.employee.create({
          data: {
            employeeCode: 'EMP-010', name: 'Roksana Parvin', designationId: designations[5].id, departmentId: departments[4].id,
            joiningDate: new Date('2022-12-01'), phone: '+880-1712-345010', address: 'House 9, Section-12, Pallabi, Mirpur, Dhaka',
          },
        }),
      ]);

      // ============================================================
      // 8. PAYMENT OPTIONS (5)
      // ============================================================
      const paymentOptions = await Promise.all([
        tx.paymentOption.create({ data: { name: 'Cash' } }),
        tx.paymentOption.create({ data: { name: 'Card' } }),
        tx.paymentOption.create({ data: { name: 'bKash' } }),
        tx.paymentOption.create({ data: { name: 'Nagad' } }),
        tx.paymentOption.create({ data: { name: 'Bank Transfer' } }),
      ]);

      // ============================================================
      // 9. CARD TYPES (3) + Card Type Setups
      // ============================================================
      const cardTypes = await Promise.all([
        tx.cardType.create({ data: { name: 'Visa' } }),
        tx.cardType.create({ data: { name: 'MasterCard' } }),
        tx.cardType.create({ data: { name: 'Amex' } }),
      ]);

      await Promise.all([
        tx.cardTypeSetup.create({ data: { paymentOptionId: paymentOptions[1].id, cardTypeId: cardTypes[0].id, chargePercentage: 2.5 } }),
        tx.cardTypeSetup.create({ data: { paymentOptionId: paymentOptions[1].id, cardTypeId: cardTypes[1].id, chargePercentage: 2.0 } }),
        tx.cardTypeSetup.create({ data: { paymentOptionId: paymentOptions[1].id, cardTypeId: cardTypes[2].id, chargePercentage: 3.5 } }),
      ]);

      // ============================================================
      // SEGMENTS
      // ============================================================
      const segments = await Promise.all([
        tx.segment.create({ data: { name: 'Retail', description: 'Direct retail customers' } }),
        tx.segment.create({ data: { name: 'Wholesale', description: 'Bulk/wholesale dealers and distributors' } }),
        tx.segment.create({ data: { name: 'Corporate', description: 'Corporate and institutional clients' } }),
      ]);

      // ============================================================
      // 10. PRODUCTS (15) - Realistic electronics, varied stock, BDT prices
      // ============================================================
      const productsData: Array<{
        productCode: string; name: string; categoryId: string; colorId: string | null;
        unit: string; costPrice: number; salePrice: number; openingStock: number;
        reorderLevel: number; godownId: string; segmentId: string; companyId: string | null;
        sizeCapacity?: string;
      }> = [
        // PROD-001: High stock flagship phone
        {
          productCode: 'PROD-001', name: 'Samsung Galaxy S24 Ultra 256GB', categoryId: categories[1].id,
          colorId: colors[4].id, unit: 'Pcs', costPrice: 98000, salePrice: 115000,
          openingStock: 35, reorderLevel: 10, godownId: godowns[0].id,
          segmentId: segments[0].id, companyId: companies[0].id, sizeCapacity: '256GB',
        },
        // PROD-002: Medium stock TV
        {
          productCode: 'PROD-002', name: 'Samsung 55" Crystal 4K Smart TV', categoryId: categories[0].id,
          colorId: colors[4].id, unit: 'Pcs', costPrice: 65000, salePrice: 78000,
          openingStock: 12, reorderLevel: 5, godownId: godowns[0].id,
          segmentId: segments[1].id, companyId: companies[0].id, sizeCapacity: '55 inch',
        },
        // PROD-003: Medium stock AC
        {
          productCode: 'PROD-003', name: 'LG 1.5 Ton Inverter Split AC', categoryId: categories[4].id,
          colorId: colors[1].id, unit: 'Pcs', costPrice: 48000, salePrice: 58000,
          openingStock: 8, reorderLevel: 5, godownId: godowns[0].id,
          segmentId: segments[0].id, companyId: companies[1].id, sizeCapacity: '1.5 Ton',
        },
        // PROD-004: LOW stock headphones (below reorder)
        {
          productCode: 'PROD-004', name: 'Sony WH-1000XM5 Headphones', categoryId: categories[3].id,
          colorId: colors[0].id, unit: 'Pcs', costPrice: 28000, salePrice: 34000,
          openingStock: 3, reorderLevel: 10, godownId: godowns[1].id,
          segmentId: segments[0].id, companyId: companies[2].id,
        },
        // PROD-005: Laptop - good stock
        {
          productCode: 'PROD-005', name: 'Dell Inspiron 15 3530 Laptop', categoryId: categories[2].id,
          colorId: colors[6].id, unit: 'Pcs', costPrice: 52000, salePrice: 62000,
          openingStock: 15, reorderLevel: 5, godownId: godowns[0].id,
          segmentId: segments[0].id, companyId: companies[3].id, sizeCapacity: 'i5/8GB/512GB',
        },
        // PROD-006: ZERO stock printer
        {
          productCode: 'PROD-006', name: 'HP LaserJet Pro M404dn Printer', categoryId: categories[2].id,
          colorId: colors[6].id, unit: 'Pcs', costPrice: 25000, salePrice: 30000,
          openingStock: 0, reorderLevel: 5, godownId: godowns[1].id,
          segmentId: segments[1].id, companyId: companies[4].id,
        },
        // PROD-007: High stock budget phone
        {
          productCode: 'PROD-007', name: 'Xiaomi Redmi Note 13 Pro 128GB', categoryId: categories[1].id,
          colorId: colors[0].id, unit: 'Pcs', costPrice: 22000, salePrice: 27000,
          openingStock: 40, reorderLevel: 15, godownId: godowns[0].id,
          segmentId: segments[0].id, companyId: companies[6].id, sizeCapacity: '128GB',
        },
        // PROD-008: High stock router
        {
          productCode: 'PROD-008', name: 'TP-Link Archer AX73 WiFi 6 Router', categoryId: categories[5].id,
          colorId: colors[0].id, unit: 'Pcs', costPrice: 3500, salePrice: 5000,
          openingStock: 50, reorderLevel: 15, godownId: godowns[1].id,
          segmentId: segments[0].id, companyId: null,
        },
        // PROD-009: Medium stock security camera
        {
          productCode: 'PROD-009', name: 'Hikvision DS-2CD1043G2 4MP Camera', categoryId: categories[6].id,
          colorId: colors[1].id, unit: 'Pcs', costPrice: 4500, salePrice: 6500,
          openingStock: 30, reorderLevel: 10, godownId: godowns[0].id,
          segmentId: segments[2].id, companyId: null,
        },
        // PROD-010: LOW stock UPS (below reorder)
        {
          productCode: 'PROD-010', name: 'APC Back-UPS 1500VA UPS', categoryId: categories[7].id,
          colorId: colors[0].id, unit: 'Pcs', costPrice: 12000, salePrice: 15000,
          openingStock: 2, reorderLevel: 8, godownId: godowns[0].id,
          segmentId: segments[0].id, companyId: null,
        },
        // PROD-011: Low stock fridge (below reorder)
        {
          productCode: 'PROD-011', name: 'Samsung 300L Digital Inverter Refrigerator', categoryId: categories[4].id,
          colorId: colors[4].id, unit: 'Pcs', costPrice: 55000, salePrice: 65000,
          openingStock: 4, reorderLevel: 5, godownId: godowns[0].id,
          segmentId: segments[1].id, companyId: companies[0].id, sizeCapacity: '300L',
        },
        // PROD-012: Low stock washing machine
        {
          productCode: 'PROD-012', name: 'LG 8kg Inverter Washing Machine', categoryId: categories[4].id,
          colorId: colors[4].id, unit: 'Pcs', costPrice: 38000, salePrice: 45000,
          openingStock: 5, reorderLevel: 5, godownId: godowns[1].id,
          segmentId: segments[0].id, companyId: companies[1].id, sizeCapacity: '8kg',
        },
        // PROD-013: Premium laptop
        {
          productCode: 'PROD-013', name: 'Lenovo ThinkPad X1 Carbon Gen 11', categoryId: categories[2].id,
          colorId: colors[0].id, unit: 'Pcs', costPrice: 95000, salePrice: 112000,
          openingStock: 7, reorderLevel: 3, godownId: godowns[2].id,
          segmentId: segments[2].id, companyId: companies[5].id, sizeCapacity: 'i7/16GB/512GB',
        },
        // PROD-014: Medium stock gaming console
        {
          productCode: 'PROD-014', name: 'Sony PlayStation 5 Slim', categoryId: categories[0].id,
          colorId: colors[1].id, unit: 'Pcs', costPrice: 52000, salePrice: 62000,
          openingStock: 18, reorderLevel: 5, godownId: godowns[0].id,
          segmentId: segments[0].id, companyId: companies[2].id,
        },
        // PROD-015: ZERO stock adapter
        {
          productCode: 'PROD-015', name: 'USB-C 7-in-1 Hub Adapter', categoryId: categories[3].id,
          colorId: colors[4].id, unit: 'Pcs', costPrice: 1200, salePrice: 2200,
          openingStock: 0, reorderLevel: 25, godownId: godowns[2].id,
          segmentId: segments[0].id, companyId: null,
        },
      ];

      const products = [];
      for (const pd of productsData) {
        const data: Record<string, unknown> = { ...pd };
        if (!data.companyId) delete data.companyId;
        if (!data.colorId) delete data.colorId;
        const product = await tx.product.create({ data });
        products.push(product);
      }

      // ============================================================
      // 11. CUSTOMERS (10) - Bangladeshi names
      // ============================================================
      const customers = await Promise.all([
        tx.customer.create({
          data: { customerCode: 'CUST-001', name: 'Al-Amin Electronics', phone: '+880-1811-550001', address: 'Shop 10, Eastern Plaza, Hatirpool, Dhaka', openingBalance: 85000 },
        }),
        tx.customer.create({
          data: { customerCode: 'CUST-002', name: 'Rafi Traders', phone: '+880-1811-550002', address: 'Shop 22, IDB Bhaban, Elephant Road, Dhaka', openingBalance: 42000 },
        }),
        tx.customer.create({
          data: { customerCode: 'CUST-003', name: 'Mehedi Enterprise', phone: '+880-1811-550003', address: 'Shop 5, Multiplan Center, Elephant Road, Dhaka', openingBalance: 0 },
        }),
        tx.customer.create({
          data: { customerCode: 'CUST-004', name: 'Nasir Mobile House', phone: '+880-1811-550004', address: 'Shop 15, Level-4, Bashundhara City, Dhaka', openingBalance: 35000 },
        }),
        tx.customer.create({
          data: { customerCode: 'CUST-005', name: 'Tareq Digital Store', phone: '+880-1811-550005', address: 'Shop 8, Jamuna Future Park, Kuril, Dhaka', openingBalance: 28000 },
        }),
        tx.customer.create({
          data: { customerCode: 'CUST-006', name: 'Jamil Brothers', phone: '+880-1811-550006', address: '55/A, Agrabad C/A, Chittagong', openingBalance: 60000 },
        }),
        tx.customer.create({
          data: { customerCode: 'CUST-007', name: 'Sumaiya Communication', phone: '+880-1811-550007', address: '12/3 Station Road, Khulna', openingBalance: 15000 },
        }),
        tx.customer.create({
          data: { customerCode: 'CUST-008', name: 'Rahman IT Solutions', phone: '+880-1811-550008', address: 'Suite 302, BSEC Bhaban, Karwan Bazar, Dhaka', openingBalance: 120000 },
        }),
        tx.customer.create({
          data: { customerCode: 'CUST-009', name: 'Habib Electronics Sylhet', phone: '+880-1811-550009', address: 'Zindabazar Road, Sylhet 3100', openingBalance: 0 },
        }),
        tx.customer.create({
          data: { customerCode: 'CUST-010', name: 'Maksud Trading Corporation', phone: '+880-1811-550010', address: 'DIT Extension Road, Fulbaria, Dhaka', openingBalance: 95000 },
        }),
      ]);

      // ============================================================
      // 12. SUPPLIERS (5) - Bangladeshi names
      // ============================================================
      const suppliers = await Promise.all([
        tx.supplier.create({
          data: { supplierCode: 'SUP-001', name: 'Samsung Bangladesh Pvt Ltd', phone: '+880-2-9881669', address: 'Gulshan Avenue, Dhaka 1212', openingBalance: 250000 },
        }),
        tx.supplier.create({
          data: { supplierCode: 'SUP-002', name: 'LG Electronics Bangladesh', phone: '+880-2-9881230', address: 'House 7, Road 23, Banani, Dhaka', openingBalance: 180000 },
        }),
        tx.supplier.create({
          data: { supplierCode: 'SUP-003', name: 'Sony Bangladesh Ltd', phone: '+880-2-9551234', address: '18 Motijheel C/A, Dhaka 1000', openingBalance: 120000 },
        }),
        tx.supplier.create({
          data: { supplierCode: 'SUP-004', name: 'Rangs Electronics Ltd', phone: '+880-2-9123789', address: '59/1 Panthapath, Karwan Bazar, Dhaka', openingBalance: 95000 },
        }),
        tx.supplier.create({
          data: { supplierCode: 'SUP-005', name: 'Transcom Digital', phone: '+880-2-8823456', address: 'Gulshan North C/A, Dhaka 1212', openingBalance: 150000 },
        }),
      ]);

      // ============================================================
      // 13. BANKS (3) with opening balances
      // ============================================================
      const banks = await Promise.all([
        tx.bank.create({
          data: {
            bankName: 'Dutch-Bangla Bank', branch: 'Dhanmondi Branch',
            accountNo: 'DBBL-1234567890', accountHolder: 'Electronics Mart IMS',
            openingBalance: 500000,
          },
        }),
        tx.bank.create({
          data: {
            bankName: 'BRAC Bank', branch: 'Gulshan Branch',
            accountNo: 'BRAC-9876543210', accountHolder: 'Electronics Mart IMS',
            openingBalance: 350000,
          },
        }),
        tx.bank.create({
          data: {
            bankName: 'City Bank', branch: 'Motijheel Branch',
            accountNo: 'CITY-5555666677', accountHolder: 'Electronics Mart IMS',
            openingBalance: 200000,
          },
        }),
      ]);

      // ============================================================
      // 14. EXPENSE HEADS (7)
      // ============================================================
      const expenseHeads = await Promise.all([
        tx.expenseIncomeHead.create({ data: { name: 'Rent', type: 'Expense' } }),
        tx.expenseIncomeHead.create({ data: { name: 'Utilities', type: 'Expense' } }),
        tx.expenseIncomeHead.create({ data: { name: 'Salary', type: 'Expense' } }),
        tx.expenseIncomeHead.create({ data: { name: 'Transport', type: 'Expense' } }),
        tx.expenseIncomeHead.create({ data: { name: 'Marketing', type: 'Expense' } }),
        tx.expenseIncomeHead.create({ data: { name: 'Maintenance', type: 'Expense' } }),
        tx.expenseIncomeHead.create({ data: { name: 'Office Supplies', type: 'Expense' } }),
      ]);

      // ============================================================
      // 15. INCOME HEADS (4)
      // ============================================================
      const incomeHeads = await Promise.all([
        tx.expenseIncomeHead.create({ data: { name: 'Sales Revenue', type: 'Income' } }),
        tx.expenseIncomeHead.create({ data: { name: 'Interest Income', type: 'Income' } }),
        tx.expenseIncomeHead.create({ data: { name: 'Service Charge', type: 'Income' } }),
        tx.expenseIncomeHead.create({ data: { name: 'Commission', type: 'Income' } }),
      ]);

      // ============================================================
      // 18. PURCHASE ORDERS (2) - Confirmed, with lines and stock entries
      // ============================================================

      // PO-001: Samsung mobile & TV order (2 months ago)
      const po1 = await tx.purchaseOrder.create({
        data: {
          poNumber: 'PO-001', supplierId: suppliers[0].id, date: twoMonthsAgo,
          godownId: godowns[0].id, status: 'Confirmed', grandTotal: 4690000,
          notes: 'Bulk purchase - Samsung Galaxy S24 Ultra & Smart TV for Eid stock',
          lines: {
            create: [
              { productId: products[0].id, quantity: 30, rate: 98000, total: 2940000 },
              { productId: products[1].id, quantity: 15, rate: 65000, total: 975000 },
              { productId: products[10].id, quantity: 8, rate: 55000, total: 440000 },
              { productId: products[13].id, quantity: 5, rate: 67000, total: 335000 },
            ],
          },
        },
      });

      // Create stock entries for PO-001 lines
      await Promise.all([
        tx.stockEntry.create({ data: { productId: products[0].id, godownId: godowns[0].id, type: 'IN', quantity: 30, reference: 'PO-001', referenceType: 'PurchaseOrder', date: twoMonthsAgo, notes: 'Samsung Galaxy S24 Ultra received' } }),
        tx.stockEntry.create({ data: { productId: products[1].id, godownId: godowns[0].id, type: 'IN', quantity: 15, reference: 'PO-001', referenceType: 'PurchaseOrder', date: twoMonthsAgo, notes: 'Samsung 55" Smart TV received' } }),
        tx.stockEntry.create({ data: { productId: products[10].id, godownId: godowns[0].id, type: 'IN', quantity: 8, reference: 'PO-001', referenceType: 'PurchaseOrder', date: twoMonthsAgo, notes: 'Samsung 300L Refrigerator received' } }),
        tx.stockEntry.create({ data: { productId: products[13].id, godownId: godowns[0].id, type: 'IN', quantity: 5, reference: 'PO-001', referenceType: 'PurchaseOrder', date: twoMonthsAgo, notes: 'Sony PS5 received' } }),
      ]);

      // PO-002: LG appliances + Dell laptops (1 month ago)
      const po2 = await tx.purchaseOrder.create({
        data: {
          poNumber: 'PO-002', supplierId: suppliers[1].id, date: oneMonthAgo,
          godownId: godowns[0].id, status: 'Confirmed', grandTotal: 1788000,
          notes: 'LG home appliances + Dell laptop stock replenishment',
          lines: {
            create: [
              { productId: products[2].id, quantity: 10, rate: 48000, total: 480000 },
              { productId: products[11].id, quantity: 8, rate: 38000, total: 304000 },
              { productId: products[4].id, quantity: 12, rate: 52000, total: 624000 },
              { productId: products[7].id, quantity: 40, rate: 3500, total: 140000 },
              { productId: products[9].id, quantity: 8, rate: 12000, total: 96000 },
              { productId: products[8].id, quantity: 20, rate: 7200, total: 144000 },
            ],
          },
        },
      });

      // Create stock entries for PO-002 lines
      await Promise.all([
        tx.stockEntry.create({ data: { productId: products[2].id, godownId: godowns[0].id, type: 'IN', quantity: 10, reference: 'PO-002', referenceType: 'PurchaseOrder', date: oneMonthAgo, notes: 'LG 1.5 Ton AC received' } }),
        tx.stockEntry.create({ data: { productId: products[11].id, godownId: godowns[0].id, type: 'IN', quantity: 8, reference: 'PO-002', referenceType: 'PurchaseOrder', date: oneMonthAgo, notes: 'LG Washing Machine received' } }),
        tx.stockEntry.create({ data: { productId: products[4].id, godownId: godowns[0].id, type: 'IN', quantity: 12, reference: 'PO-002', referenceType: 'PurchaseOrder', date: oneMonthAgo, notes: 'Dell Inspiron Laptops received' } }),
        tx.stockEntry.create({ data: { productId: products[7].id, godownId: godowns[0].id, type: 'IN', quantity: 40, reference: 'PO-002', referenceType: 'PurchaseOrder', date: oneMonthAgo, notes: 'TP-Link WiFi Routers received' } }),
        tx.stockEntry.create({ data: { productId: products[9].id, godownId: godowns[0].id, type: 'IN', quantity: 8, reference: 'PO-002', referenceType: 'PurchaseOrder', date: oneMonthAgo, notes: 'APC UPS received' } }),
        tx.stockEntry.create({ data: { productId: products[8].id, godownId: godowns[0].id, type: 'IN', quantity: 20, reference: 'PO-002', referenceType: 'PurchaseOrder', date: oneMonthAgo, notes: 'Hikvision Cameras received' } }),
      ]);

      // ============================================================
      // 19. SALES ORDERS (3) - Confirmed, with lines and stock entries
      // ============================================================

      // INV-001: Bulk sale to Al-Amin Electronics (3 weeks ago)
      const so1 = await tx.salesOrder.create({
        data: {
          invoiceNo: 'INV-001', customerId: customers[0].id, date: twoWeeksAgo,
          godownId: godowns[0].id, discount: 10000, grandTotal: 618000,
          paymentOptionId: paymentOptions[0].id, status: 'Confirmed',
          notes: 'Wholesale order - Samsung phones and TV for Al-Amin',
          lines: {
            create: [
              { productId: products[0].id, quantity: 5, rate: 115000, total: 575000 },
              { productId: products[6].id, quantity: 1, rate: 53000, total: 53000 },
            ],
          },
        },
      });

      // Stock entries for INV-001
      await Promise.all([
        tx.stockEntry.create({ data: { productId: products[0].id, godownId: godowns[0].id, type: 'OUT', quantity: 5, reference: 'INV-001', referenceType: 'SalesOrder', date: twoWeeksAgo, notes: 'Sold 5x Samsung S24 Ultra to Al-Amin' } }),
        tx.stockEntry.create({ data: { productId: products[6].id, godownId: godowns[0].id, type: 'OUT', quantity: 1, reference: 'INV-001', referenceType: 'SalesOrder', date: twoWeeksAgo, notes: 'Sold 1x Smart TV to Al-Amin' } }),
      ]);

      // INV-002: Sale to Rafi Traders (1 week ago)
      const so2 = await tx.salesOrder.create({
        data: {
          invoiceNo: 'INV-002', customerId: customers[1].id, date: oneWeekAgo,
          godownId: godowns[0].id, discount: 0, grandTotal: 248000,
          paymentOptionId: paymentOptions[1].id, status: 'Confirmed',
          notes: 'Laptop and AC sale - card payment',
          lines: {
            create: [
              { productId: products[4].id, quantity: 3, rate: 62000, total: 186000 },
              { productId: products[2].id, quantity: 1, rate: 62000, total: 62000 },
            ],
          },
        },
      });

      // Stock entries for INV-002
      await Promise.all([
        tx.stockEntry.create({ data: { productId: products[4].id, godownId: godowns[0].id, type: 'OUT', quantity: 3, reference: 'INV-002', referenceType: 'SalesOrder', date: oneWeekAgo, notes: 'Sold 3x Dell Laptops to Rafi Traders' } }),
        tx.stockEntry.create({ data: { productId: products[2].id, godownId: godowns[0].id, type: 'OUT', quantity: 1, reference: 'INV-002', referenceType: 'SalesOrder', date: oneWeekAgo, notes: 'Sold 1x LG AC to Rafi Traders' } }),
      ]);

      // INV-003: Sale to Rahman IT Solutions (yesterday)
      const so3 = await tx.salesOrder.create({
        data: {
          invoiceNo: 'INV-003', customerId: customers[7].id, date: yesterday,
          godownId: godowns[1].id, discount: 5000, grandTotal: 350000,
          paymentOptionId: paymentOptions[4].id, status: 'Confirmed',
          notes: 'Corporate IT order - Lenovo ThinkPad + networking gear',
          lines: {
            create: [
              { productId: products[12].id, quantity: 2, rate: 112000, total: 224000 },
              { productId: products[7].id, quantity: 10, rate: 5000, total: 50000 },
              { productId: products[9].id, quantity: 3, rate: 15000, total: 45000 },
              { productId: products[8].id, quantity: 5, rate: 6500, total: 32500 },
              { productId: products[14].id, quantity: 5, rate: 1700, total: 8500 },
            ],
          },
        },
      });

      // Stock entries for INV-003
      await Promise.all([
        tx.stockEntry.create({ data: { productId: products[12].id, godownId: godowns[1].id, type: 'OUT', quantity: 2, reference: 'INV-003', referenceType: 'SalesOrder', date: yesterday, notes: 'Sold 2x Lenovo ThinkPad to Rahman IT' } }),
        tx.stockEntry.create({ data: { productId: products[7].id, godownId: godowns[1].id, type: 'OUT', quantity: 10, reference: 'INV-003', referenceType: 'SalesOrder', date: yesterday, notes: 'Sold 10x TP-Link Router to Rahman IT' } }),
        tx.stockEntry.create({ data: { productId: products[9].id, godownId: godowns[1].id, type: 'OUT', quantity: 3, reference: 'INV-003', referenceType: 'SalesOrder', date: yesterday, notes: 'Sold 3x APC UPS to Rahman IT' } }),
        tx.stockEntry.create({ data: { productId: products[8].id, godownId: godowns[1].id, type: 'OUT', quantity: 5, reference: 'INV-003', referenceType: 'SalesOrder', date: yesterday, notes: 'Sold 5x Hikvision Camera to Rahman IT' } }),
        tx.stockEntry.create({ data: { productId: products[14].id, godownId: godowns[1].id, type: 'OUT', quantity: 5, reference: 'INV-003', referenceType: 'SalesOrder', date: yesterday, notes: 'Sold 5x USB-C Hub to Rahman IT' } }),
      ]);

      // ============================================================
      // 16. SAMPLE EXPENSES (5)
      // ============================================================
      await Promise.all([
        tx.expense.create({
          data: { date: oneMonthAgo, headId: expenseHeads[0].id, amount: 65000, paymentOptionId: paymentOptions[0].id, bankId: banks[0].id, description: 'Showroom rent for February' },
        }),
        tx.expense.create({
          data: { date: twoWeeksAgo, headId: expenseHeads[1].id, amount: 18500, paymentOptionId: paymentOptions[0].id, description: 'Electricity bill - January' },
        }),
        tx.expense.create({
          data: { date: oneWeekAgo, headId: expenseHeads[2].id, amount: 320000, paymentOptionId: paymentOptions[4].id, bankId: banks[1].id, description: 'Staff salary - February payroll' },
        }),
        tx.expense.create({
          data: { date: twoDaysAgo, headId: expenseHeads[4].id, amount: 25000, paymentOptionId: paymentOptions[2].id, description: 'Facebook Ads campaign - March' },
        }),
        tx.expense.create({
          data: { date: yesterday, headId: expenseHeads[3].id, amount: 12000, paymentOptionId: paymentOptions[0].id, description: 'Delivery van fuel and maintenance' },
        }),
      ]);

      // ============================================================
      // 17. SAMPLE INCOMES (5)
      // ============================================================
      await Promise.all([
        tx.income.create({
          data: { date: twoWeeksAgo, headId: incomeHeads[0].id, amount: 25000, paymentOptionId: paymentOptions[0].id, bankId: banks[0].id, description: 'Cash sale over-the-counter' },
        }),
        tx.income.create({
          data: { date: oneWeekAgo, headId: incomeHeads[2].id, amount: 8500, paymentOptionId: paymentOptions[0].id, description: 'AC installation service charges' },
        }),
        tx.income.create({
          data: { date: threeDaysAgo, headId: incomeHeads[1].id, amount: 4200, paymentOptionId: paymentOptions[4].id, bankId: banks[0].id, description: 'Bank interest - Q1 2025' },
        }),
        tx.income.create({
          data: { date: twoDaysAgo, headId: incomeHeads[3].id, amount: 15000, paymentOptionId: paymentOptions[2].id, description: 'Samsung product sales commission' },
        }),
        tx.income.create({
          data: { date: yesterday, headId: incomeHeads[2].id, amount: 12000, paymentOptionId: paymentOptions[0].id, description: 'Warranty extension service fees' },
        }),
      ]);

      // ============================================================
      // 20. CASH COLLECTIONS (2)
      // ============================================================
      await Promise.all([
        tx.cashCollection.create({
          data: { customerId: customers[0].id, date: oneWeekAgo, amount: 300000, paymentOptionId: paymentOptions[0].id, bankId: banks[0].id, description: 'Partial payment from Al-Amin Electronics for INV-001' },
        }),
        tx.cashCollection.create({
          data: { customerId: customers[7].id, date: yesterday, amount: 200000, paymentOptionId: paymentOptions[4].id, bankId: banks[1].id, description: 'Payment from Rahman IT Solutions for INV-003' },
        }),
      ]);

      // Cash deliveries to suppliers
      await Promise.all([
        tx.cashDelivery.create({
          data: { supplierId: suppliers[0].id, date: oneMonthAgo, amount: 500000, paymentOptionId: paymentOptions[4].id, bankId: banks[0].id, description: 'Payment to Samsung Bangladesh for PO-001' },
        }),
        tx.cashDelivery.create({
          data: { supplierId: suppliers[1].id, date: twoWeeksAgo, amount: 400000, paymentOptionId: paymentOptions[4].id, bankId: banks[1].id, description: 'Partial payment to LG Electronics for PO-002' },
        }),
      ]);

      // ============================================================
      // 21. BANK TRANSACTIONS (2)
      // ============================================================
      await Promise.all([
        tx.bankTransaction.create({
          data: { bankId: banks[0].id, date: oneWeekAgo, type: 'Deposit', amount: 300000, description: 'Cash collection deposit from Al-Amin Electronics' },
        }),
        tx.bankTransaction.create({
          data: { bankId: banks[1].id, date: twoDaysAgo, type: 'Withdraw', amount: 75000, description: 'Cash withdrawal for daily operations and transport' },
        }),
      ]);

      // ============================================================
      // SR TARGETS
      // ============================================================
      await Promise.all([
        tx.sRTargetSetup.create({ data: { employeeId: employees[0].id, month: today.getMonth() + 1, year: today.getFullYear(), targetAmount: 1500000 } }),
        tx.sRTargetSetup.create({ data: { employeeId: employees[1].id, month: today.getMonth() + 1, year: today.getFullYear(), targetAmount: 800000 } }),
        tx.sRTargetSetup.create({ data: { employeeId: employees[6].id, month: today.getMonth() + 1, year: today.getFullYear(), targetAmount: 500000 } }),
        tx.sRTargetSetup.create({ data: { employeeId: employees[8].id, month: today.getMonth() + 1, year: today.getFullYear(), targetAmount: 600000 } }),
      ]);

      // ============================================================
      // LEDGER ENTRIES
      // ============================================================
      await Promise.all([
        tx.ledgerEntry.create({ data: { date: twoMonthsAgo, account: 'Cash', particulars: 'Opening balance brought forward', debit: 1500000, credit: 0, reference: 'OB-2025' } }),
        tx.ledgerEntry.create({ data: { date: twoMonthsAgo, account: 'Purchase', particulars: 'Samsung stock purchase PO-001', debit: 4690000, credit: 0, reference: 'PO-001' } }),
        tx.ledgerEntry.create({ data: { date: twoMonthsAgo, account: 'Accounts Payable', particulars: 'Payable to Samsung Bangladesh', debit: 0, credit: 4690000, reference: 'PO-001' } }),
        tx.ledgerEntry.create({ data: { date: oneMonthAgo, account: 'Purchase', particulars: 'LG + Dell stock purchase PO-002', debit: 1788000, credit: 0, reference: 'PO-002' } }),
        tx.ledgerEntry.create({ data: { date: oneMonthAgo, account: 'Accounts Payable', particulars: 'Payable to LG Electronics', debit: 0, credit: 1788000, reference: 'PO-002' } }),
        tx.ledgerEntry.create({ data: { date: twoWeeksAgo, account: 'Accounts Receivable', particulars: 'Sale to Al-Amin Electronics INV-001', debit: 618000, credit: 0, reference: 'INV-001' } }),
        tx.ledgerEntry.create({ data: { date: twoWeeksAgo, account: 'Sales', particulars: 'Sales revenue INV-001', debit: 0, credit: 618000, reference: 'INV-001' } }),
        tx.ledgerEntry.create({ data: { date: oneWeekAgo, account: 'Accounts Receivable', particulars: 'Sale to Rafi Traders INV-002', debit: 248000, credit: 0, reference: 'INV-002' } }),
        tx.ledgerEntry.create({ data: { date: oneWeekAgo, account: 'Sales', particulars: 'Sales revenue INV-002', debit: 0, credit: 248000, reference: 'INV-002' } }),
        tx.ledgerEntry.create({ data: { date: yesterday, account: 'Cash', particulars: 'Payment received Rahman IT INV-003', debit: 200000, credit: 0, reference: 'INV-003' } }),
        tx.ledgerEntry.create({ data: { date: yesterday, account: 'Accounts Receivable', particulars: 'Sale to Rahman IT INV-003', debit: 350000, credit: 0, reference: 'INV-003' } }),
        tx.ledgerEntry.create({ data: { date: yesterday, account: 'Sales', particulars: 'Sales revenue INV-003', debit: 0, credit: 350000, reference: 'INV-003' } }),
        tx.ledgerEntry.create({ data: { date: oneMonthAgo, account: 'Rent Expense', particulars: 'Showroom rent February', debit: 65000, credit: 0, reference: 'EXP-001' } }),
        tx.ledgerEntry.create({ data: { date: oneWeekAgo, account: 'Salary Expense', particulars: 'Staff payroll February', debit: 320000, credit: 0, reference: 'EXP-004' } }),
      ]);
    });

    return NextResponse.json({
      message: 'Database seeded successfully',
      data: {
        categories: 8,
        colors: 8,
        companies: 8,
        godowns: 3,
        departments: 5,
        designations: 8,
        employees: 10,
        paymentOptions: 5,
        cardTypes: 3,
        segments: 3,
        products: 15,
        customers: 10,
        suppliers: 5,
        banks: 3,
        expenseHeads: 7,
        incomeHeads: 4,
        purchaseOrders: 2,
        salesOrders: 3,
        expenses: 5,
        incomes: 5,
        cashCollections: 2,
        bankTransactions: 2,
      },
    });
  } catch (error) {
    console.error('Error seeding database:', error);
    return NextResponse.json(
      { error: 'Failed to seed database', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
