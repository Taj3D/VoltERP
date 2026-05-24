import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    // Check if data already exists
    const existingCategories = await db.category.count();
    if (existingCategories > 0) {
      return NextResponse.json({ message: 'Already seeded' });
    }

    await db.$transaction(async (tx) => {
      // === Categories ===
      const categories = await Promise.all([
        tx.category.create({ data: { name: 'Electronics', description: 'Electronic devices and gadgets' } }),
        tx.category.create({ data: { name: 'Mobile', description: 'Mobile phones and accessories' } }),
        tx.category.create({ data: { name: 'Computer', description: 'Computers and peripherals' } }),
        tx.category.create({ data: { name: 'Accessories', description: 'General accessories' } }),
        tx.category.create({ data: { name: 'Home Appliance', description: 'Home appliances' } }),
      ]);

      // === Colors ===
      const colors = await Promise.all([
        tx.color.create({ data: { name: 'Black', colorCode: '#000000' } }),
        tx.color.create({ data: { name: 'White', colorCode: '#FFFFFF' } }),
        tx.color.create({ data: { name: 'Blue', colorCode: '#0000FF' } }),
        tx.color.create({ data: { name: 'Red', colorCode: '#FF0000' } }),
        tx.color.create({ data: { name: 'Silver', colorCode: '#C0C0C0' } }),
      ]);

      // === Companies ===
      const companies = await Promise.all([
        tx.company.create({ data: { name: 'Samsung', address: 'Seoul, South Korea', phone: '+82-2-1234-5678', email: 'info@samsung.com' } }),
        tx.company.create({ data: { name: 'LG', address: 'Seoul, South Korea', phone: '+82-2-2345-6789', email: 'info@lg.com' } }),
        tx.company.create({ data: { name: 'Sony', address: 'Tokyo, Japan', phone: '+81-3-3456-7890', email: 'info@sony.com' } }),
      ]);

      // === Godowns ===
      const godowns = await Promise.all([
        tx.godown.create({ data: { name: 'Main Warehouse', address: 'Industrial Area, Block A', inCharge: 'Ahmed Khan' } }),
        tx.godown.create({ data: { name: 'Branch Store', address: 'Commercial Zone, Block B', inCharge: 'Rahim Uddin' } }),
        tx.godown.create({ data: { name: 'Display Center', address: 'Main Market Road', inCharge: 'Karim Hossain' } }),
      ]);

      // === Departments ===
      const departments = await Promise.all([
        tx.department.create({ data: { name: 'Sales', description: 'Sales and marketing department' } }),
        tx.department.create({ data: { name: 'Purchase', description: 'Procurement and purchasing department' } }),
        tx.department.create({ data: { name: 'Accounts', description: 'Finance and accounts department' } }),
      ]);

      // === Designations ===
      const designations = await Promise.all([
        tx.designation.create({ data: { name: 'Sales Manager', departmentId: departments[0].id } }),
        tx.designation.create({ data: { name: 'Sales Representative', departmentId: departments[0].id } }),
        tx.designation.create({ data: { name: 'Purchase Manager', departmentId: departments[1].id } }),
        tx.designation.create({ data: { name: 'Accountant', departmentId: departments[2].id } }),
        tx.designation.create({ data: { name: 'Junior Sales Rep', departmentId: departments[0].id } }),
      ]);

      // === Employees ===
      const employees = await Promise.all([
        tx.employee.create({
          data: {
            employeeCode: 'EMP-001',
            name: 'Ahmed Khan',
            designationId: designations[0].id,
            departmentId: departments[0].id,
            joiningDate: new Date('2022-01-15'),
            phone: '+880-1711-000001',
            address: 'House 1, Road 1, Dhaka',
          },
        }),
        tx.employee.create({
          data: {
            employeeCode: 'EMP-002',
            name: 'Fatima Rahman',
            designationId: designations[1].id,
            departmentId: departments[0].id,
            joiningDate: new Date('2022-03-20'),
            phone: '+880-1711-000002',
            address: 'House 2, Road 2, Dhaka',
          },
        }),
        tx.employee.create({
          data: {
            employeeCode: 'EMP-003',
            name: 'Rahim Uddin',
            designationId: designations[2].id,
            departmentId: departments[1].id,
            joiningDate: new Date('2021-07-10'),
            phone: '+880-1711-000003',
            address: 'House 3, Road 3, Chittagong',
          },
        }),
        tx.employee.create({
          data: {
            employeeCode: 'EMP-004',
            name: 'Sadia Islam',
            designationId: designations[3].id,
            departmentId: departments[2].id,
            joiningDate: new Date('2023-02-01'),
            phone: '+880-1711-000004',
            address: 'House 4, Road 4, Dhaka',
          },
        }),
        tx.employee.create({
          data: {
            employeeCode: 'EMP-005',
            name: 'Karim Hossain',
            designationId: designations[4].id,
            departmentId: departments[0].id,
            joiningDate: new Date('2023-06-15'),
            phone: '+880-1711-000005',
            address: 'House 5, Road 5, Sylhet',
          },
        }),
      ]);

      // === Payment Options ===
      const paymentOptions = await Promise.all([
        tx.paymentOption.create({ data: { name: 'Cash' } }),
        tx.paymentOption.create({ data: { name: 'Card' } }),
        tx.paymentOption.create({ data: { name: 'bKash' } }),
        tx.paymentOption.create({ data: { name: 'Nagad' } }),
        tx.paymentOption.create({ data: { name: 'Bank Transfer' } }),
      ]);

      // === Card Types ===
      const cardTypes = await Promise.all([
        tx.cardType.create({ data: { name: 'Visa' } }),
        tx.cardType.create({ data: { name: 'MasterCard' } }),
        tx.cardType.create({ data: { name: 'Amex' } }),
      ]);

      // Card type setups
      await Promise.all([
        tx.cardTypeSetup.create({
          data: { paymentOptionId: paymentOptions[1].id, cardTypeId: cardTypes[0].id, chargePercentage: 2.5 },
        }),
        tx.cardTypeSetup.create({
          data: { paymentOptionId: paymentOptions[1].id, cardTypeId: cardTypes[1].id, chargePercentage: 2.0 },
        }),
        tx.cardTypeSetup.create({
          data: { paymentOptionId: paymentOptions[1].id, cardTypeId: cardTypes[2].id, chargePercentage: 3.0 },
        }),
      ]);

      // === Customers ===
      const customers = await Promise.all([
        tx.customer.create({
          data: { customerCode: 'CUST-001', name: 'Al-Amin Electronics', phone: '+880-1811-000001', address: 'Shop 10, Eastern Plaza, Dhaka', openingBalance: 50000 },
        }),
        tx.customer.create({
          data: { customerCode: 'CUST-002', name: 'Rafi Trading', phone: '+880-1811-000002', address: 'Shop 22, IDB Bhaban, Dhaka', openingBalance: 30000 },
        }),
        tx.customer.create({
          data: { customerCode: 'CUST-003', name: 'Mehedi Enterprise', phone: '+880-1811-000003', address: 'Shop 5, Multiplan Center, Dhaka', openingBalance: 0 },
        }),
        tx.customer.create({
          data: { customerCode: 'CUST-004', name: 'Nasir Mobile', phone: '+880-1811-000004', address: 'Shop 15, Bashundhara City, Dhaka', openingBalance: 25000 },
        }),
        tx.customer.create({
          data: { customerCode: 'CUST-005', name: 'Tareq Store', phone: '+880-1811-000005', address: 'Shop 8, Jamuna Future Park, Dhaka', openingBalance: 15000 },
        }),
      ]);

      // === Suppliers ===
      const suppliers = await Promise.all([
        tx.supplier.create({
          data: { supplierCode: 'SUP-001', name: 'Samsung Bangladesh', phone: '+880-2-9110001', address: 'Gulshan, Dhaka', openingBalance: 100000 },
        }),
        tx.supplier.create({
          data: { supplierCode: 'SUP-002', name: 'LG Electronics BD', phone: '+880-2-9110002', address: 'Banani, Dhaka', openingBalance: 75000 },
        }),
        tx.supplier.create({
          data: { supplierCode: 'SUP-003', name: 'Sony Bangladesh Ltd', phone: '+880-2-9110003', address: 'Motijheel, Dhaka', openingBalance: 50000 },
        }),
      ]);

      // === Segments ===
      const segments = await Promise.all([
        tx.segment.create({ data: { name: 'Retail', description: 'Direct retail customers' } }),
        tx.segment.create({ data: { name: 'Wholesale', description: 'Bulk/wholesale customers' } }),
      ]);

      // === Products ===
      // Some with stock below reorder level
      const productsData = [
        { productCode: 'PRD-001', name: 'Samsung Galaxy S24', categoryId: categories[1].id, colorId: colors[0].id, unit: 'Pcs', costPrice: 85000, salePrice: 95000, openingStock: 50, reorderLevel: 10, godownId: godowns[0].id, segmentId: segments[0].id, companyId: companies[0].id },
        { productCode: 'PRD-002', name: 'Samsung 55" Smart TV', categoryId: categories[0].id, colorId: colors[4].id, unit: 'Pcs', costPrice: 65000, salePrice: 75000, openingStock: 20, reorderLevel: 5, godownId: godowns[0].id, segmentId: segments[1].id, companyId: companies[0].id },
        { productCode: 'PRD-003', name: 'LG 1.5 Ton AC', categoryId: categories[4].id, colorId: colors[1].id, unit: 'Pcs', costPrice: 45000, salePrice: 55000, openingStock: 15, reorderLevel: 8, godownId: godowns[0].id, segmentId: segments[0].id, companyId: companies[1].id },
        { productCode: 'PRD-004', name: 'Sony WH-1000XM5', categoryId: categories[3].id, colorId: colors[0].id, unit: 'Pcs', costPrice: 25000, salePrice: 30000, openingStock: 3, reorderLevel: 10, godownId: godowns[1].id, segmentId: segments[0].id, companyId: companies[2].id },
        { productCode: 'PRD-005', name: 'Samsung Galaxy Tab S9', categoryId: categories[1].id, colorId: colors[4].id, unit: 'Pcs', costPrice: 55000, salePrice: 65000, openingStock: 12, reorderLevel: 5, godownId: godowns[1].id, segmentId: segments[0].id, companyId: companies[0].id },
        { productCode: 'PRD-006', name: 'LG 32" Monitor', categoryId: categories[2].id, colorId: colors[4].id, unit: 'Pcs', costPrice: 22000, salePrice: 28000, openingStock: 8, reorderLevel: 10, godownId: godowns[2].id, segmentId: segments[1].id, companyId: companies[1].id },
        { productCode: 'PRD-007', name: 'Sony PlayStation 5', categoryId: categories[0].id, colorCode: undefined, unit: 'Pcs', costPrice: 48000, salePrice: 58000, openingStock: 25, reorderLevel: 5, godownId: godowns[0].id, segmentId: segments[0].id, companyId: companies[2].id },
        { productCode: 'PRD-008', name: 'Samsung Refrigerator 300L', categoryId: categories[4].id, colorId: colors[4].id, unit: 'Pcs', costPrice: 52000, salePrice: 62000, openingStock: 2, reorderLevel: 5, godownId: godowns[0].id, segmentId: segments[1].id, companyId: companies[0].id },
        { productCode: 'PRD-009', name: 'LG Washing Machine 8kg', categoryId: categories[4].id, colorId: colors[1].id, unit: 'Pcs', costPrice: 35000, salePrice: 42000, openingStock: 10, reorderLevel: 5, godownId: godowns[1].id, segmentId: segments[0].id, companyId: companies[1].id },
        { productCode: 'PRD-010', name: 'USB-C Hub Adapter', categoryId: categories[3].id, colorId: colors[0].id, unit: 'Pcs', costPrice: 1500, salePrice: 2500, openingStock: 100, reorderLevel: 20, godownId: godowns[2].id, segmentId: segments[0].id, companyId: undefined },
      ];

      const products = [];
      for (const pd of productsData) {
        const { colorCode: _cc, ...rest } = pd;
        // Remove undefined companyId
        const data: Record<string, unknown> = { ...rest };
        if (!data.companyId) delete data.companyId;
        if (!data.colorId) delete data.colorId;
        const product = await tx.product.create({ data });
        products.push(product);
      }

      // === Expense/Income Heads ===
      const expenseHeads = await Promise.all([
        tx.expenseIncomeHead.create({ data: { name: 'Rent', type: 'Expense' } }),
        tx.expenseIncomeHead.create({ data: { name: 'Utilities', type: 'Expense' } }),
        tx.expenseIncomeHead.create({ data: { name: 'Salary', type: 'Expense' } }),
      ]);

      const incomeHeads = await Promise.all([
        tx.expenseIncomeHead.create({ data: { name: 'Service Income', type: 'Income' } }),
        tx.expenseIncomeHead.create({ data: { name: 'Interest Income', type: 'Income' } }),
        tx.expenseIncomeHead.create({ data: { name: 'Other Income', type: 'Income' } }),
      ]);

      // === Banks ===
      const banks = await Promise.all([
        tx.bank.create({
          data: {
            bankName: 'Dutch-Bangla Bank',
            branch: 'Dhanmondi Branch',
            accountNo: 'DBBL-1234567890',
            accountHolder: 'Electronics Mart',
            openingBalance: 500000,
          },
        }),
        tx.bank.create({
          data: {
            bankName: 'BRAC Bank',
            branch: 'Gulshan Branch',
            accountNo: 'BRAC-9876543210',
            accountHolder: 'Electronics Mart',
            openingBalance: 300000,
          },
        }),
        tx.bank.create({
          data: {
            bankName: 'City Bank',
            branch: 'Motijheel Branch',
            accountNo: 'CITY-5555666677',
            accountHolder: 'Electronics Mart',
            openingBalance: 200000,
          },
        }),
      ]);

      // Create some sample transactions for meaningful reports
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // Sample Purchase Orders
      await Promise.all([
        tx.purchaseOrder.create({
          data: {
            poNumber: 'PO-001',
            supplierId: suppliers[0].id,
            date: yesterday,
            godownId: godowns[0].id,
            status: 'Confirmed',
            grandTotal: 850000,
            notes: 'Initial stock purchase - Samsung',
            lines: {
              create: [
                { productId: products[0].id, quantity: 10, rate: 85000, total: 850000 },
              ],
            },
          },
        }),
        tx.purchaseOrder.create({
          data: {
            poNumber: 'PO-002',
            supplierId: suppliers[1].id,
            date: today,
            godownId: godowns[0].id,
            status: 'Confirmed',
            grandTotal: 675000,
            notes: 'LG appliances order',
            lines: {
              create: [
                { productId: products[2].id, quantity: 10, rate: 45000, total: 450000 },
                { productId: products[8].id, quantity: 5, rate: 35000, total: 175000 },
                { productId: products[5].id, quantity: 2, rate: 22000, total: 44000 },
                { productId: products[7].id, quantity: 1, rate: 6000, total: 6000 },
              ],
            },
          },
        }),
      ]);

      // Sample Sales Orders
      await Promise.all([
        tx.salesOrder.create({
          data: {
            invoiceNo: 'INV-001',
            customerId: customers[0].id,
            date: today,
            godownId: godowns[0].id,
            discount: 5000,
            grandTotal: 285000,
            paymentOptionId: paymentOptions[0].id,
            status: 'Confirmed',
            notes: 'First sale to Al-Amin',
            lines: {
              create: [
                { productId: products[0].id, quantity: 3, rate: 95000, total: 285000 },
              ],
            },
          },
        }),
        tx.salesOrder.create({
          data: {
            invoiceNo: 'INV-002',
            customerId: customers[1].id,
            date: today,
            godownId: godowns[0].id,
            discount: 0,
            grandTotal: 75000,
            paymentOptionId: paymentOptions[1].id,
            status: 'Confirmed',
            notes: 'TV sale to Rafi Trading',
            lines: {
              create: [
                { productId: products[1].id, quantity: 1, rate: 75000, total: 75000 },
              ],
            },
          },
        }),
      ]);

      // Sample expenses and incomes
      await Promise.all([
        tx.expense.create({
          data: { date: today, headId: expenseHeads[0].id, amount: 50000, paymentOptionId: paymentOptions[0].id, bankId: banks[0].id, description: 'Monthly rent payment' },
        }),
        tx.expense.create({
          data: { date: today, headId: expenseHeads[1].id, amount: 15000, paymentOptionId: paymentOptions[0].id, description: 'Electricity bill' },
        }),
        tx.income.create({
          data: { date: today, headId: incomeHeads[0].id, amount: 25000, paymentOptionId: paymentOptions[0].id, bankId: banks[0].id, description: 'Repair service income' },
        }),
      ]);

      // Sample bank transactions
      await Promise.all([
        tx.bankTransaction.create({
          data: { bankId: banks[0].id, date: today, type: 'Deposit', amount: 285000, description: 'Sales collection deposit' },
        }),
        tx.bankTransaction.create({
          data: { bankId: banks[1].id, date: today, type: 'Withdraw', amount: 50000, description: 'Cash withdrawal for expenses' },
        }),
      ]);

      // Sample cash collections and deliveries
      await Promise.all([
        tx.cashCollection.create({
          data: { customerId: customers[0].id, date: today, amount: 200000, paymentOptionId: paymentOptions[0].id, bankId: banks[0].id, description: 'Partial payment from Al-Amin' },
        }),
        tx.cashDelivery.create({
          data: { supplierId: suppliers[0].id, date: today, amount: 400000, paymentOptionId: paymentOptions[4].id, bankId: banks[0].id, description: 'Payment to Samsung Bangladesh' },
        }),
      ]);

      // Sample SR targets
      await Promise.all([
        tx.sRTargetSetup.create({
          data: { employeeId: employees[0].id, month: today.getMonth() + 1, year: today.getFullYear(), targetAmount: 500000 },
        }),
        tx.sRTargetSetup.create({
          data: { employeeId: employees[1].id, month: today.getMonth() + 1, year: today.getFullYear(), targetAmount: 300000 },
        }),
        tx.sRTargetSetup.create({
          data: { employeeId: employees[4].id, month: today.getMonth() + 1, year: today.getFullYear(), targetAmount: 200000 },
        }),
      ]);

      // Sample ledger entries
      await Promise.all([
        tx.ledgerEntry.create({ data: { date: today, account: 'Cash', particulars: 'Opening balance', debit: 1000000, credit: 0, reference: 'OB-001' } }),
        tx.ledgerEntry.create({ data: { date: today, account: 'Sales', particulars: 'Sales revenue', debit: 0, credit: 360000, reference: 'INV-001' } }),
        tx.ledgerEntry.create({ data: { date: today, account: 'Purchase', particulars: 'Purchase of goods', debit: 1525000, credit: 0, reference: 'PO-001' } }),
        tx.ledgerEntry.create({ data: { date: today, account: 'Rent Expense', particulars: 'Monthly rent', debit: 50000, credit: 0, reference: 'EXP-001' } }),
        tx.ledgerEntry.create({ data: { date: today, account: 'Cash', particulars: 'Cash received', debit: 0, credit: 285000, reference: 'COL-001' } }),
        tx.ledgerEntry.create({ data: { date: today, account: 'Accounts Receivable', particulars: 'Customer receivable', debit: 285000, credit: 0, reference: 'INV-001' } }),
        tx.ledgerEntry.create({ data: { date: today, account: 'Accounts Payable', particulars: 'Supplier payable', debit: 0, credit: 850000, reference: 'PO-001' } }),
      ]);

      // Sample hire sale
      await tx.hireSales.create({
        data: {
          invoiceNo: 'HIRE-001',
          customerId: customers[2].id,
          date: today,
          godownId: godowns[2].id,
          hireRate: 5,
          duration: '12 months',
          grandTotal: 114000,
          status: 'Active',
          notes: 'Hire purchase - LG AC',
          lines: {
            create: [
              { productId: products[2].id, quantity: 2, rate: 55000, total: 110000 },
              { productId: products[9].id, quantity: 2, rate: 2000, total: 4000 },
            ],
          },
        },
      });

      // Sample stock transfer
      await tx.stockTransfer.create({
        data: {
          transferNo: 'TRF-001',
          fromGodownId: godowns[0].id,
          toGodownId: godowns[2].id,
          date: today,
          status: 'Completed',
          notes: 'Transfer for display',
          lines: {
            create: [
              { productId: products[0].id, quantity: 5 },
              { productId: products[1].id, quantity: 2 },
            ],
          },
        },
      });
    });

    return NextResponse.json({
      message: 'Database seeded successfully',
      data: {
        categories: 5,
        colors: 5,
        companies: 3,
        godowns: 3,
        departments: 3,
        designations: 5,
        employees: 5,
        paymentOptions: 5,
        cardTypes: 3,
        customers: 5,
        suppliers: 3,
        products: 10,
        expenseHeads: 3,
        incomeHeads: 3,
        banks: 3,
        segments: 2,
      },
    });
  } catch (error) {
    console.error('Error seeding database:', error);
    return NextResponse.json(
      { error: 'Failed to seed database' },
      { status: 500 }
    );
  }
}
