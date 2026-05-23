import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

function loadEnv(): void {
  try {
    const lines = readFileSync('.env', 'utf-8').split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  } catch { /* ignore */ }
}

loadEnv();
const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

async function main() {
  const client = await pool.connect();
  try {
    const cc = await client.query<{ column_name: string; data_type: string; is_nullable: string }>(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'curation_candidates'
      ORDER BY ordinal_position
    `);
    console.log('=== curation_candidates columns ===');
    for (const r of cc.rows) {
      console.log(` ${r.column_name} | ${r.data_type} | nullable:${r.is_nullable}`);
    }

    const cd = await client.query<{ column_name: string; data_type: string }>(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'curation_decisions'
      ORDER BY ordinal_position
    `);
    console.log('\n=== curation_decisions columns ===');
    if (cd.rows.length === 0) {
      console.log('  (table does not exist or is empty)');
    } else {
      for (const r of cd.rows) console.log(` ${r.column_name} | ${r.data_type}`);
    }

    const sp = await client.query<{ column_name: string; data_type: string; is_nullable: string }>(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'spots' AND column_name IN ('kakao_place_id', 'synthetic_id')
      ORDER BY column_name
    `);
    console.log('\n=== spots (kakao_place_id, synthetic_id) ===');
    if (sp.rows.length === 0) {
      console.log('  (columns not found)');
    } else {
      for (const r of sp.rows) console.log(` ${r.column_name} | ${r.data_type} | nullable:${r.is_nullable}`);
    }

    // Check indexes on curation_decisions
    const idx = await client.query<{ indexname: string; indexdef: string }>(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'curation_decisions'
    `);
    console.log('\n=== curation_decisions indexes ===');
    for (const r of idx.rows) console.log(` ${r.indexname}: ${r.indexdef}`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
