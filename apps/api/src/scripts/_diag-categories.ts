#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';

function loadEnv(): void {
  try {
    const lines = readFileSync(resolve(process.cwd(), '.env'), 'utf-8').split('\n');
    for (const line of lines) {
      const t = line.trim(); if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('='); if (eq === -1) continue;
      const key = t.slice(0, eq).trim(); const val = t.slice(eq + 1).trim();
      if (key && !(key in process.env)) process.env[key] = val;
    }
  } catch { /* no .env */ }
}
loadEnv();

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

// All distinct category values in DB
const cats = await pool.query(`SELECT category, COUNT(*) as n FROM curation_candidates GROUP BY category ORDER BY n DESC`);
process.stdout.write('=== All category values ===\n');
for (const r of cats.rows) process.stdout.write(`${String(r.category).padEnd(25)} ${r.n}\n`);

// Check constraint definition
const constraint = await pool.query(`
  SELECT pg_get_constraintdef(oid) as def
  FROM pg_constraint
  WHERE conrelid = 'curation_candidates'::regclass AND conname = 'curation_candidates_category_check'
`);
process.stdout.write('\n=== category CHECK constraint ===\n');
process.stdout.write(constraint.rows[0]?.def ?? 'NOT FOUND');
process.stdout.write('\n');

await pool.end();
