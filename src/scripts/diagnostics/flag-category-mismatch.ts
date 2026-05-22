#!/usr/bin/env tsx
/**
 * 카테고리-snippet 불일치 spot에 comment_warning_flag='category_mismatch' 설정.
 * 인수: spot 이름 목록 (공백 구분)
 * 예: npx tsx flag-category-mismatch.ts 카이로스 "다른spot"
 */
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
  const names = process.argv.slice(2);
  if (names.length === 0) { console.error('인수: spot 이름 1개 이상 필요'); process.exit(1); }

  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

  for (const name of names) {
    const r = await pool.query<{ id: string; name: string; comment_warning_flag: string | null }>(
      `UPDATE curation_candidates
       SET comment_warning_flag = 'category_mismatch'
       WHERE name = $1 AND selected_tier = 'reference'
       RETURNING id, name, comment_warning_flag`,
      [name],
    );
    if (r.rows.length === 0) {
      console.log(`[skip] ${name} — reference 셋에 없음`);
    } else {
      console.log(`[flagged] ${r.rows[0]!.name} (${r.rows[0]!.id}) → ${r.rows[0]!.comment_warning_flag}`);
    }
  }

  await pool.end();
})();
