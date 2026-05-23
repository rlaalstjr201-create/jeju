/**
 * 블루리본 JSON → official_awards DB 적재
 *
 * 입력: data/processed/bluerribbon_jeju.json
 * 실행: npx tsx src/scripts/seed-bluerribbon-awards.ts [--dry-run]
 *
 * 매핑 룰:
 *   ribbon_count 0 → blue_ribbon_listed  (tier 0)
 *   ribbon_count 1 → blue_ribbon         (tier 1)
 *   ribbon_count 2 → blue_ribbon_star    (tier 2)
 *   ribbon_count 3 → blue_ribbon_top     (tier 3)
 *   label=='레드리본 선정' → 위 INSERT 외에 red_ribbon_coca row 추가
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..', '..');
const INPUT_FILE = path.join(ROOT, 'data', 'processed', 'bluerribbon_jeju.json');

function loadEnv() {
  try {
    const lines = readFileSync(path.join(ROOT, '.env'), 'utf-8').split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  } catch { /* .env 없으면 무시 */ }
}

interface BluerEntry {
  href: string;
  name: string;
  address: string;
  foodtype: string[];
  ribbon_count: number;
  label: string;
  description: string;
}

const RIBBON_TYPE: Record<number, string> = {
  0: 'blue_ribbon_listed',
  1: 'blue_ribbon',
  2: 'blue_ribbon_star',
  3: 'blue_ribbon_top',
};

const INSERT_SQL = `
  INSERT INTO official_awards
    (award_type, award_tier, award_label, spot_name, spot_address, foodtype, description, source, source_id)
  VALUES ($1, $2, $3, $4, $5, $6, $7, 'bluerribbon', $8)
  ON CONFLICT (source, source_id, award_type) DO UPDATE SET
    award_tier   = EXCLUDED.award_tier,
    award_label  = EXCLUDED.award_label,
    spot_name    = EXCLUDED.spot_name,
    spot_address = EXCLUDED.spot_address,
    foodtype     = EXCLUDED.foodtype,
    description  = EXCLUDED.description
`;

async function main() {
  loadEnv();
  const isDryRun = process.argv.includes('--dry-run');
  const db = new Pool({ connectionString: process.env['DATABASE_URL'] });

  let entries: BluerEntry[];
  try {
    entries = JSON.parse(readFileSync(INPUT_FILE, 'utf-8')) as BluerEntry[];
  } catch {
    console.error(`[seed-bluerribbon] 파일 없음: ${INPUT_FILE}`);
    process.exit(1);
  }

  console.log(`[seed-bluerribbon] ${entries.length}건 처리 시작 (dry-run: ${isDryRun})`);

  let blueRows = 0;
  let redRows  = 0;

  for (const e of entries) {
    const sourceId   = e.href;
    const awardType  = RIBBON_TYPE[e.ribbon_count];
    const isRed      = e.label === '레드리본 선정';
    const labelVal   = e.label || null;

    if (!awardType) {
      console.warn(`[seed-bluerribbon] 알 수 없는 ribbon_count=${e.ribbon_count}: ${e.name}`);
      continue;
    }

    if (!isDryRun) {
      // 블루리본 row (ribbon_count 기반)
      await db.query(INSERT_SQL, [
        awardType, e.ribbon_count, labelVal,
        e.name, e.address, e.foodtype, e.description, sourceId,
      ]);
    }
    blueRows++;

    // 레드리본 별도 row
    if (isRed) {
      if (!isDryRun) {
        await db.query(INSERT_SQL, [
          'red_ribbon_coca', null, labelVal,
          e.name, e.address, e.foodtype, e.description, sourceId,
        ]);
      }
      redRows++;
    }
  }

  await db.end();

  console.log(`[seed-bluerribbon] 완료`);
  console.log(`  블루리본 row: ${blueRows}건`);
  console.log(`  레드리본 row: ${redRows}건`);
  console.log(`  합계: ${blueRows + redRows}건`);
  if (isDryRun) console.log('  (dry-run: DB 쓰기 없음)');
}

main().catch(err => { console.error(err); process.exit(1); });
