// Push schema SQL to Turso via @libsql/client (robust line-based splitter)
import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';

const client = createClient({
  url: 'libsql://volterp-db-taj3d.aws-ap-northeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODExNjkwMDgsImlkIjoiMDE5ZWI1ZjEtN2YwMS03NTdjLWFhYjEtYmVhOTUyZmY5YjFkIiwicmlkIjoiOGRlMWI4ZGEtZmI2YS00ZDczLTk1ODctYmM5Y2VhOTQ2NjBiIn0.BK5c_6biOODBjwQp0niWNkIoyLR5ocm7QbLSok39jSNAZjcXOOrPjIi0Rlj5CkAKaMxLv-wzbqC9oWFyGIBEDQ',
});

const sql = readFileSync('/tmp/turso-schema.sql', 'utf8');
console.log('[turso-push] SQL file size:', sql.length, 'bytes');

// Robust splitter: Prisma outputs each statement on its own line(s) ending with ";\n"
// We split on ";\n" and filter out comment-only fragments.
const rawStatements = sql.split(';\n');
const statements = rawStatements
  .map(s => s.trim())
  .filter(s => s.length > 0)
  // Remove leading comment lines from each statement
  .map(s => s.replace(/^--[^\n]*\n/gm, '').trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

console.log(`[turso-push] Total statements to execute: ${statements.length}`);
console.log(`[turso-push] First statement: ${statements[0]?.substring(0, 80)}...`);

let executed = 0, failed = 0;
for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  // Ensure statement ends with semicolon
  const fullStmt = stmt.endsWith(';') ? stmt : stmt + ';';
  try {
    await client.execute(fullStmt);
    executed++;
    if (executed % 50 === 0) console.log(`[turso-push] Progress: ${executed}/${statements.length}`);
  } catch (e) {
    const msg = e.message || '';
    if (!msg.includes('already exists') && !msg.includes('Duplicate')) {
      console.error(`[turso-push] Statement ${i} failed:`, msg.substring(0, 120));
      failed++;
    } else {
      executed++;
    }
  }
}

console.log(`[turso-push] DONE. Executed: ${executed}, Failed: ${failed}`);

// Verify
const res = await client.execute("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table'");
console.log(`[turso-push] Tables in Turso: ${res.rows[0].cnt}`);

const userCols = await client.execute("PRAGMA table_info(User)");
const cols = userCols.rows.map(r => r.name);
console.log(`[turso-push] User.designation exists: ${cols.includes('designation')}`);
console.log(`[turso-push] User columns: ${cols.join(', ')}`);
