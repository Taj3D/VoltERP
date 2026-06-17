// Verify Turso User table structure
import { createClient } from '@libsql/client';

const client = createClient({
  url: 'libsql://volterp-db-taj3d.aws-ap-northeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODExNjkwMDgsImlkIjoiMDE5ZWI1ZjEtN2YwMS03NTdjLWFhYjEtYmVhOTUyZmY5YjFkIiwicmlkIjoiOGRlMWI4ZGEtZmI2YS00ZDczLTk1ODctYmM5Y2VhOTQ2NjBiIn0.BK5c_6biOODBjwQp0niWNkIoyLR5ocm7QbLSok39jSNAZjcXOOrPjIi0Rlj5CkAKaMxLv-wzbqC9oWFyGIBEDQ',
});

const res = await client.execute("PRAGMA table_info(User)");
console.log('User table columns:');
for (const row of res.rows) {
  console.log(`  - ${row.name} (${row.type}) notnull=${row.notnull} default=${row.dflt_value}`);
}

// Count existing users
const countRes = await client.execute("SELECT COUNT(*) as cnt FROM User");
console.log(`\nUser count: ${countRes.rows[0].cnt}`);

// Check Company
const compRes = await client.execute("SELECT id, code, name FROM Company LIMIT 5");
console.log('\nCompanies:');
for (const row of compRes.rows) {
  console.log(`  - ${row.id} | ${row.code} | ${row.name}`);
}
