import pg from 'pg';
import { readFileSync } from 'fs';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://postgres:jeju123@localhost:5432/jeju' });

const sql = readFileSync('migrations/019_up_events_table.sql', 'utf8');
await pool.query(sql);
console.log('Migration 019 applied.');

// Verify
const r = await pool.query(`SELECT COUNT(*) FROM events`);
console.log('events row count:', r.rows[0].count);

const idx = await pool.query(`
  SELECT indexname FROM pg_indexes WHERE tablename = 'events' ORDER BY indexname
`);
console.log('indexes:', idx.rows.map(r => r.indexname).join(', '));

await pool.end();
