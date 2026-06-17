// Seed 5 default users into Turso with bcrypt-hashed passwords
import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';

const client = createClient({
  url: 'libsql://volterp-db-taj3d.aws-ap-northeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODExNjkwMDgsImlkIjoiMDE5ZWI1ZjEtN2YwMS03NTdjLWFhYjEtYmVhOTUyZmY5YjFkIiwicmlkIjoiOGRlMWI4ZGEtZmI2YS00ZDczLTk1ODctYmM5Y2VhOTQ2NjBiIn0.BK5c_6biOODBjwQp0niWNkIoyLR5ocm7QbLSok39jSNAZjcXOOrPjIi0Rlj5CkAKaMxLv-wzbqC9oWFyGIBEDQ',
});

// Dynamically fetch the first active company ID
const compRes = await client.execute("SELECT id FROM Company WHERE isActive = 1 ORDER BY createdAt ASC LIMIT 1");
if (compRes.rows.length === 0) {
  console.error('[seed-users] ❌ No active company found in Turso. Run seed-reference-data.js first.');
  process.exit(1);
}
const COMPANY_ID = compRes.rows[0].id;
console.log(`[seed-users] Using company ID: ${COMPANY_ID}`);

const users = [
  { id: 'user_admin_001',    email: 'emart.amit',    name: 'Amit Sharma (Admin)',      password: 'Test_123',     role: 'admin',       phone: '+8801711111111', designation: 'System Administrator' },
  { id: 'user_manager_001',  email: 'emart.manager', name: 'Kamal Hossain (Manager)',  password: 'Manager_123',  role: 'manager',     phone: '+8801722222222', designation: 'Store Manager' },
  { id: 'user_sr_001',       email: 'emart.sr',      name: 'Fatima Khan (SR)',         password: 'SR_123',       role: 'sr',          phone: '+8801733333333', designation: 'Sales Representative' },
  { id: 'user_dealer_001',   email: 'emart.dealer',  name: 'Mahmud Hardware (Dealer)', password: 'Dealer_123',   role: 'dealer',      phone: '+8801744444444', designation: 'Dealer' },
  { id: 'user_vat_001',      email: 'emart.vat',     name: 'Rakib Hasan (VAT Auditor)',password: 'VAT_123',      role: 'vat_auditor', phone: '+8801755555555', designation: 'VAT Auditor' },
];

console.log('[seed-users] Seeding 5 default users into Turso...');

for (const u of users) {
  // Check if user already exists
  const existing = await client.execute({ sql: 'SELECT id FROM User WHERE email = ?', args: [u.email] });
  if (existing.rows.length > 0) {
    console.log(`[seed-users] User ${u.email} already exists, updating...`);
    const hashed = bcrypt.hashSync(u.password, 10);
    await client.execute({
      sql: `UPDATE User SET name = ?, password = ?, role = ?, companyId = ?, phone = ?, designation = ?, isActive = 1 WHERE email = ?`,
      args: [u.name, hashed, u.role, COMPANY_ID, u.phone, u.designation, u.email],
    });
    console.log(`[seed-users] ✅ Updated ${u.email} (${u.role})`);
  } else {
    const hashed = bcrypt.hashSync(u.password, 10);
    await client.execute({
      sql: `INSERT INTO User (id, email, name, password, role, companyId, isActive, createdAt, updatedAt, phone, address, designation, photo, voterIdFront, voterIdBack, pdfExports, csvImports, csvExports) VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'), ?, '', ?, '', '', '', 0, 0, 0)`,
      args: [u.id, u.email, u.name, hashed, u.role, COMPANY_ID, u.phone, u.designation],
    });
    console.log(`[seed-users] ✅ Created ${u.email} (${u.role})`);
  }
}

// Verify
const res = await client.execute('SELECT email, name, role, companyId FROM User ORDER BY role');
console.log('\n[seed-users] Users in Turso:');
for (const row of res.rows) {
  console.log(`  - ${row.email} | ${row.name} | ${row.role} | company=${row.companyId}`);
}
console.log(`\n[seed-users] ✅ Total users: ${res.rows.length}`);
