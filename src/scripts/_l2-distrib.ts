import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lines = readFileSync(resolve(process.cwd(), '.env'), 'utf-8').split('\n');
for (const line of lines) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('='); if (eq === -1) continue;
  const key = t.slice(0, eq).trim(); const val = t.slice(eq + 1).trim();
  if (key && !(key in process.env)) process.env[key] = val;
}

const c = new Client({ connectionString: process.env['DATABASE_URL'] });
await c.connect();

const r1 = await c.query(`
  SELECT name, category,
    (comment_verified::jsonb->>'l2_cosine')::float AS l2,
    comment_draft::jsonb->>'comment'        AS comment,
    comment_draft::jsonb->>'evidence_quote' AS quote
  FROM curation_candidates
  WHERE selected_tier = 'reference'
    AND (comment_verified::jsonb->>'l2_cosine') IS NOT NULL
  ORDER BY (comment_verified::jsonb->>'l2_cosine')::float ASC
`);

interface Row { name: string; category: string; l2: number; comment: string; quote: string; }
const rows = r1.rows as Row[];

const bins = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: 0 };
for (const r of rows) {
  const v = Number(r.l2);
  if (v < 0.65)      bins.a++;
  else if (v < 0.70) bins.b++;
  else if (v < 0.75) bins.c++;
  else if (v < 0.80) bins.d++;
  else if (v < 0.85) bins.e++;
  else if (v < 0.90) bins.f++;
  else               bins.g++;
}
const sum = rows.reduce((s, r) => s + Number(r.l2), 0);
const avg = (sum / rows.length).toFixed(3);

console.log(`=== 기존 L2 분포 (${rows.length}건) ===`);
console.log(`  avg=${avg}  min=${Number(rows[0]!.l2).toFixed(3)}  max=${Number(rows[rows.length-1]!.l2).toFixed(3)}`);
console.log(`  <0.65      : ${bins.a}건`);
console.log(`  0.65~0.70  : ${bins.b}건`);
console.log(`  0.70~0.75  : ${bins.c}건`);
console.log(`  0.75~0.80  : ${bins.d}건`);
console.log(`  0.80~0.85  : ${bins.e}건`);
console.log(`  0.85~0.90  : ${bins.f}건`);
console.log(`  >=0.90     : ${bins.g}건`);

console.log('\n=== 최하위 15건 (comment vs evidence_quote) ===');
for (const r of rows.slice(0, 15)) {
  console.log(`\n  [${Number(r.l2).toFixed(3)}] ${r.name} (${r.category})`);
  console.log(`    comment: ${(r.comment || '').slice(0, 80)}`);
  console.log(`    quote  : ${(r.quote || '').slice(0, 80)}`);
}

await c.end();
