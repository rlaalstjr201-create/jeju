import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { runMigrations } from '../infrastructure/persistence/migrationRunner.js';

function loadEnv(): void {
  try {
    const envPath = fileURLToPath(new URL('../../../../.env', import.meta.url));
    const lines = readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (key && !(key in process.env)) process.env[key] = val;
    }
  } catch {
    // No .env file — rely on actual environment
  }
}

loadEnv();

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

async function main() {
  const client = await pool.connect();
  let before: string[] = [];
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const r = await client.query<{ name: string }>('SELECT name FROM schema_migrations ORDER BY name');
    before = r.rows.map((row) => row.name);
  } finally {
    client.release();
  }

  console.log('Previously applied migrations:', before.length);
  await runMigrations(pool);

  const client2 = await pool.connect();
  let after: string[] = [];
  try {
    const r = await client2.query<{ name: string }>('SELECT name FROM schema_migrations ORDER BY name');
    after = r.rows.map((row) => row.name);
  } finally {
    client2.release();
  }

  const newlyApplied = after.filter((m) => !before.includes(m));
  if (newlyApplied.length === 0) {
    console.log('All migrations already applied — nothing to do.');
  } else {
    console.log('Newly applied:', newlyApplied);
  }
  console.log('Total applied:', after.length);

  await pool.end();
}

main().catch((err) => {
  console.error('Migration error:', err instanceof Error ? err.message : String(err));
  pool.end().finally(() => process.exit(1));
});
