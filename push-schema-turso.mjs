import { createClient } from '@libsql/client';

const TURSO_URL = 'libsql://volterp-db-taj3d.aws-ap-northeast-1.turso.io';
const TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODExNjkwMDgsImlkIjoiMDE5ZWI1ZjEtN2YwMS03NTdjLWFhYjEtYmVhOTUyZmY5YjFkIiwicmlkIjoiOGRlMWI4ZGEtZmI2YS00ZDczLTk1ODctYmM5Y2VhOTQ2NjBiIn0.BK5c_6biOODBjwQp0niWNkIoyLR5ocm7QbLSok39jSNAZjcXOOrPjIi0Rlj5CkAKaMxLv-wzbqC9oWFyGIBEDQ';

const client = createClient({
  url: TURSO_URL,
  authToken: TURSO_TOKEN,
});

import { readFileSync } from 'fs';
const sql = readFileSync('/tmp/volterp-schema.sql', 'utf-8');

// Split into individual statements - split on ; followed by newline
const statements = sql
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))  // Remove comment lines
  .join('\n')
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0);

console.log(`Total statements to execute: ${statements.length}`);

let success = 0;
let failed = 0;

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  try {
    await client.execute(stmt);
    success++;
    if ((i + 1) % 20 === 0) {
      console.log(`  Progress: ${i + 1}/${statements.length} (${success} ok, ${failed} failed)`);
    }
  } catch (err) {
    failed++;
    // Only log first occurrence of "already exists" errors
    if (err.message && err.message.includes('already exists')) {
      console.log(`  [SKIP] Statement ${i + 1}: Table/index already exists`);
    } else {
      console.error(`  [ERROR] Statement ${i + 1} failed: ${err.message}`);
      console.error(`  SQL: ${stmt.substring(0, 100)}...`);
    }
  }
}

console.log(`\nDone! Success: ${success}, Failed: ${failed}`);
