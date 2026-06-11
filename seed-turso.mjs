import { createClient } from '@libsql/client';

const TURSO_URL = 'libsql://volterp-db-taj3d.aws-ap-northeast-1.turso.io';
const TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODExNjkwMDgsImlkIjoiMDE5ZWI1ZjEtN2YwMS03NTdjLWFhYjEtYmVhOTUyZmY5YjFkIiwicmlkIjoiOGRlMWI4ZGEtZmI2YS00ZDczLTk1ODctYmM5Y2VhOTQ2NjBiIn0.BK5c_6biOODBjwQp0niWNkIoyLR5ocm7QbLSok39jSNAZjcXOOrPjIi0Rlj5CkAKaMxLv-wzbqC9oWFyGIBEDQ';

const client = createClient({
  url: TURSO_URL,
  authToken: TURSO_TOKEN,
});

// 1. Create default company
const companyId = 'company_default_001';
try {
  await client.execute({
    sql: `INSERT INTO Company (id, code, name, address, phone, email, "isActive", "createdAt", "updatedAt")
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    args: [companyId, 'EM-001', 'Electronics Mart', 'Dhaka, Bangladesh', '+880-1234567890', 'info@electronicsmart.com', 1]
  });
  console.log('✅ Default company created');
} catch (err) {
  if (err.message?.includes('UNIQUE')) {
    console.log('⏭️ Default company already exists');
  } else {
    console.error('❌ Company creation failed:', err.message);
  }
}

// 2. Create admin user
const adminId = 'user_admin_001';
try {
  await client.execute({
    sql: `INSERT INTO User (id, email, name, password, role, "companyId", "isActive", "createdAt", "updatedAt", "pdfExports", "csvImports", "csvExports")
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 0, 0, 0)`,
    args: [adminId, 'emart.amit', 'Amit Sharma', 'Test_123', 'admin', companyId, 1]
  });
  console.log('✅ Admin user created');
} catch (err) {
  if (err.message?.includes('UNIQUE')) {
    console.log('⏭️ Admin user already exists');
  } else {
    console.error('❌ Admin user creation failed:', err.message);
  }
}

// 3. Create manager user
try {
  await client.execute({
    sql: `INSERT INTO User (id, email, name, password, role, "companyId", "isActive", "createdAt", "updatedAt", "pdfExports", "csvImports", "csvExports")
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 0, 0, 0)`,
    args: ['user_manager_001', 'emart.manager', 'Rahul Manager', 'Manager_123', 'manager', companyId, 1]
  });
  console.log('✅ Manager user created');
} catch (err) {
  if (err.message?.includes('UNIQUE')) {
    console.log('⏭️ Manager user already exists');
  } else {
    console.error('❌ Manager user creation failed:', err.message);
  }
}

// 4. Create SR user
try {
  await client.execute({
    sql: `INSERT INTO User (id, email, name, password, role, "companyId", "isActive", "createdAt", "updatedAt", "pdfExports", "csvImports", "csvExports")
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 0, 0, 0)`,
    args: ['user_sr_001', 'emart.sr', 'Sunil SR', 'SR_123', 'sr', companyId, 1]
  });
  console.log('✅ SR user created');
} catch (err) {
  if (err.message?.includes('UNIQUE')) {
    console.log('⏭️ SR user already exists');
  } else {
    console.error('❌ SR user creation failed:', err.message);
  }
}

// 5. Create Dealer user
try {
  await client.execute({
    sql: `INSERT INTO User (id, email, name, password, role, "companyId", "isActive", "createdAt", "updatedAt", "pdfExports", "csvImports", "csvExports")
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 0, 0, 0)`,
    args: ['user_dealer_001', 'emart.dealer', 'Dipu Dealer', 'Dealer_123', 'dealer', companyId, 1]
  });
  console.log('✅ Dealer user created');
} catch (err) {
  if (err.message?.includes('UNIQUE')) {
    console.log('⏭️ Dealer user already exists');
  } else {
    console.error('❌ Dealer user creation failed:', err.message);
  }
}

// 6. Create VAT Auditor user
try {
  await client.execute({
    sql: `INSERT INTO User (id, email, name, password, role, "companyId", "isActive", "createdAt", "updatedAt", "pdfExports", "csvImports", "csvExports")
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 0, 0, 0)`,
    args: ['user_vat_001', 'emart.vat', 'Vikram VAT', 'VAT_123', 'vat_auditor', companyId, 1]
  });
  console.log('✅ VAT Auditor user created');
} catch (err) {
  if (err.message?.includes('UNIQUE')) {
    console.log('⏭️ VAT Auditor user already exists');
  } else {
    console.error('❌ VAT Auditor user creation failed:', err.message);
  }
}

// 7. Create default bank
try {
  await client.execute({
    sql: `INSERT INTO Bank (id, "bankName", "bankType", branch, "accountNo", "accountHolder", "openingBalance", "currentBalance", "companyId", "isActive", "createdAt", "updatedAt")
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    args: ['bank_default_001', 'Dutch Bangla Bank', 'Bank', 'Dhaka Main', 'DBBL-001234', 'Electronics Mart', 0, 0, companyId, 1]
  });
  console.log('✅ Default bank created');
} catch (err) {
  if (err.message?.includes('UNIQUE')) {
    console.log('⏭️ Default bank already exists');
  } else {
    console.error('❌ Bank creation failed:', err.message);
  }
}

// 8. Create default godown
try {
  await client.execute({
    sql: `INSERT INTO Godown (id, code, name, address, status, "capacityValue", "companyId", "isActive", "createdAt", "updatedAt")
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    args: ['godown_default_001', 'WH-00001', 'Main Warehouse', 'Dhaka', 'ACTIVE', 0, companyId, 1]
  });
  console.log('✅ Default godown created');
} catch (err) {
  if (err.message?.includes('UNIQUE')) {
    console.log('⏭️ Default godown already exists');
  } else {
    console.error('❌ Godown creation failed:', err.message);
  }
}

// 9. Create default department
try {
  await client.execute({
    sql: `INSERT INTO Department (id, code, name, "companyId", "isActive", "createdAt", "updatedAt")
          VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    args: ['dept_default_001', 'DEPT-00001', 'General', companyId, 1]
  });
  console.log('✅ Default department created');
} catch (err) {
  if (err.message?.includes('UNIQUE')) {
    console.log('⏭️ Default department already exists');
  } else {
    console.error('❌ Department creation failed:', err.message);
  }
}

// 10. Create default designation
try {
  await client.execute({
    sql: `INSERT INTO Designation (id, code, name, "departmentId", "companyId", "isActive", "createdAt", "updatedAt")
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    args: ['desg_default_001', 'DSG-00001', 'General Staff', 'dept_default_001', companyId, 1]
  });
  console.log('✅ Default designation created');
} catch (err) {
  if (err.message?.includes('UNIQUE')) {
    console.log('⏭️ Default designation already exists');
  } else {
    console.error('❌ Designation creation failed:', err.message);
  }
}

// Verify: count tables and users
const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'");
console.log(`\n📊 Total tables in Turso: ${tables.rows.length}`);

const users = await client.execute("SELECT email, role FROM User");
console.log(`👥 Users in Turso:`);
for (const user of users.rows) {
  console.log(`  - ${user.email} (${user.role})`);
}

console.log('\n🎉 Turso database seeded successfully!');
