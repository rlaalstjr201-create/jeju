import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool, PoolClient } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Migrations directory is at project root: <root>/migrations/
const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', '..', 'migrations');

const CREATE_MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id         SERIAL      PRIMARY KEY,
    name       TEXT        NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

function getMigrationFiles(direction: 'up' | 'down'): string[] {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && f.includes(`_${direction}_`))
    .sort();
  return files;
}

async function getAppliedMigrations(client: PoolClient): Promise<Set<string>> {
  const result = await client.query<{ name: string }>(
    'SELECT name FROM schema_migrations ORDER BY name ASC',
  );
  return new Set(result.rows.map((r) => r.name));
}

export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ensure migrations tracking table exists
    await client.query(CREATE_MIGRATIONS_TABLE);

    const applied = await getAppliedMigrations(client);
    const upFiles = getMigrationFiles('up');

    for (const file of upFiles) {
      if (applied.has(file)) {
        continue;
      }
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (name) VALUES ($1)',
        [file],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function rollbackMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ensure migrations tracking table exists before querying it
    await client.query(CREATE_MIGRATIONS_TABLE);

    const applied = await getAppliedMigrations(client);
    const downFiles = getMigrationFiles('down').reverse(); // reverse order

    for (const file of downFiles) {
      // Derive the matching up-file name to check if it was applied
      const upName = file.replace('_down_', '_up_');
      if (!applied.has(upName)) {
        continue;
      }
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await client.query(sql);
      await client.query(
        'DELETE FROM schema_migrations WHERE name = $1',
        [upName],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
