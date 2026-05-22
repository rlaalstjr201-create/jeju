#!/usr/bin/env tsx
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv(): void {
  try {
    const lines = readFileSync(resolve(process.cwd(), '.env'), 'utf-8').split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      const val = t.slice(eq + 1).trim();
      if (key && !(key in process.env)) process.env[key] = val;
    }
  } catch { /* no .env */ }
}

if (!process.env['VITEST']) await (async () => {
  loadEnv();
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

  const name = process.argv[2] ?? '커피템플';
  const r = await pool.query<{ id: string; name: string; region: string; trend_category: string; final_score: number }>(
    'SELECT id, name, region, trend_category, final_score FROM curation_candidates WHERE name=$1 AND selected_tier=$2',
    [name, 'reference'],
  );
  const spot = r.rows[0];
  if (!spot) { console.log('spot not found:', name); await pool.end(); return; }

  console.log(`=== ${spot.name} (${spot.region}) trend=${spot.trend_category} score=${spot.final_score} ===`);
  console.log(`id: ${spot.id}`);

  const snips = await pool.query<{ source_type: string; title: string | null; description: string | null }>(
    'SELECT source_type, title, description FROM spot_snippets WHERE spot_id=$1 ORDER BY id LIMIT 5',
    [spot.id],
  );
  snips.rows.forEach((s, i) => {
    const text = (s.description ?? s.title ?? '').replace(/\s+/g, ' ').trim();
    console.log(`[${i + 1}] (${s.source_type}) ${text.slice(0, 250)}`);
  });

  await pool.end();
})();
