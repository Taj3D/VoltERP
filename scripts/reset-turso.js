// Reset Turso: iteratively drop all tables (FK-safe), then re-push schema
import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';

const client = createClient({
  url: 'libsql://volterp-db-taj3d.aws-ap-northeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODExNjkwMDgsImlkIjoiMDE5ZWI1ZjEtN2YwMS03NTdjLWFhYjEtYmVhOTUyZmY5YjFkIiwicmlkIjoiOGRlMWI4ZGEtZmI2YS00ZDczLTk1ODctYmM5Y2VhOTQ2NjBiIn0.BK5c_6biOODBjwQp0niWNkIoyLR5ocm7QbLSok39jSNAZjcXOOrPjIi0Rlj5CkAKaMxLv-wzbqC9oWFyGIBEDQ',
});

// Iteratively drop tables: repeat passes until no tables remain
console.log('[reset] Iteratively dropping all tables...');
let pass = 0;
let totalDropped = 0;
while (true) {
  pass++;
  const res = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"
  );
  const tables = res.rows.map(r => r.name);
  if (tables.length === 0) {
    console.log(`[reset] Pass ${pass}: no tables remaining. Done.`);
    break;
  }
  let droppedThisPass = 0;
  for (const table of tables) {
    try {
      await client.execute(`DROP TABLE IF EXISTS "${table}"`);
      droppedThisPass++;
    } catch (e) {
      // FK constraint — will retry next pass
    }
  }
  totalDropped += droppedThisPass;
  console.log(`[reset] Pass ${pass}: dropped ${droppedThisPass}/${tables.length} (total ${totalDropped})`);
  if (droppedThisPass === 0) {
    // No progress — force drop remaining by disabling FKs per-statement
    console.log('[reset] No progress. Forcing remaining drops with FK override...');
    for (const table of tables) {
      try {
        await client.execute(`PRAGMA foreign_keys=OFF; DROP TABLE IF EXISTS "${table}";`);
      } catch (e) {
        console.error(`[reset] Force-drop failed for ${table}:`, e.message.substring(0, 80));
      }
    }
  }
  if (pass > 15) {
    console.log('[reset] Max passes reached, breaking.');
    break;
  }
}

// Verify clean
const verifyRes = await client.execute(
  "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"
);
console.log(`[reset] Remaining tables: ${verifyRes.rows[0].cnt}`);

// Drop leftover indexes
try {
  const idxRes = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'"
  );
  for (const row of idxRes.rows) {
    try { await client.execute(`DROP INDEX IF EXISTS "${row.name}"`); } catch {}
  }
} catch {}

// Re-push full schema
console.log('[reset] Re-pushing full schema...');
const sql = readFileSync('/tmp/turso-schema.sql', 'utf8');
const statements = [];
let current = '';
let inString = false;
for (let i = 0; i < sql.length; i++) {
  const ch = sql[i];
  current += ch;
  if (ch === "'") inString = !inString;
  if (ch === ';' && !inString) {
    const trimmed = current.trim();
    if (trimmed && !trimmed.startsWith('--')) statements.push(trimmed);
    current = '';
  }
}

console.log(`[reset] Executing ${statements.length} schema statements...`);
let executed = 0, failed = 0;
for (const stmt of statements) {
  try {
    await client.execute(stmt);
    executed++;
  } catch (e) {
    if (!e.message.includes('already exists')) {
      console.error(`[reset] Failed:`, e.message.substring(0, 100));
      failed++;
    }
  }
}
console.log(`[reset] Schema applied. Executed: ${executed}, Failed: ${failed}`);

// Final verify
const finalRes = await client.execute("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table'");
console.log(`[reset] ✅ Total tables now: ${finalRes.rows[0].cnt}`);
const userCols = await client.execute("PRAGMA table_info(User)");
const cols = userCols.rows.map(r => r.name);
console.log(`[reset] User columns: ${cols.join(', ')}`);
console.log(`[reset] User.designation exists: ${cols.includes('designation')}`);
