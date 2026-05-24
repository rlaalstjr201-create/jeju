#!/usr/bin/env tsx
// backfill-image-url.ts
// spots.image_url을 VisitJeju API의 repPhoto.imgpath로 채운다.
// 전략: curation_candidates.visitjeju_content_id JOIN → API fetchAll → UPDATE
//
// Usage:
//   tsx src/scripts/backfill-image-url.ts --dry-run   # 1-2건 미리보기
//   tsx src/scripts/backfill-image-url.ts              # 전체 실행

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { VisitjejuAdapter } from '../infrastructure/visitjeju/VisitjejuAdapter.js';

function loadEnv(): void {
  try {
    const envPath = fileURLToPath(new URL('../../../../.env', import.meta.url));
    const lines = readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      const val = t.slice(eq + 1).trim();
      if (key && !(key in process.env)) process.env[key] = val;
    }
  } catch { /* no .env — rely on environment */ }
}

loadEnv();

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
const DRY_RUN = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  // 1. spots ↔ curation_candidates JOIN으로 (spot_id, content_id) 수집
  const client = await pool.connect();
  let spotRows: Array<{ id: string; name: string; visitjeju_content_id: string }>;
  try {
    const res = await client.query<{ id: string; name: string; visitjeju_content_id: string }>(`
      SELECT s.id, s.name, cc.visitjeju_content_id
      FROM spots s
      JOIN curation_candidates cc ON s.thumbnail_url = cc.thumbnail_url
      WHERE s.is_active = true
        AND cc.visitjeju_content_id IS NOT NULL
        AND s.image_url IS NULL
      ORDER BY s.name
    `);
    spotRows = res.rows;
  } finally {
    client.release();
  }

  if (spotRows.length === 0) {
    console.log('image_url이 이미 모두 채워져 있습니다. 할 일 없음.');
    await pool.end();
    return;
  }

  console.log(`image_url이 비어있는 spot: ${spotRows.length}건`);
  const targetIds = new Set(spotRows.map((r) => r.visitjeju_content_id));

  // 2. VisitJeju API 전체 페이지 순회 → targetIds 매칭
  const apiKey = process.env['VISITJEJU_API_KEY'];
  if (!apiKey) {
    console.error('VISITJEJU_API_KEY 환경변수가 없습니다. .env를 확인하세요.');
    await pool.end();
    process.exit(1);
  }

  const adapter = new VisitjejuAdapter({ apiKey });
  const contentToImgPath = new Map<string, string>();
  let fetched = 0;

  process.stdout.write('VisitJeju API 조회 중...');
  for await (const spot of adapter.fetchAll({ pageSize: 100 })) {
    fetched++;
    if (fetched % 100 === 0) process.stdout.write(` ${fetched}`);

    if (targetIds.has(spot.contentsid) && spot.repPhoto?.imgpath) {
      contentToImgPath.set(spot.contentsid, spot.repPhoto.imgpath);
    }
  }
  console.log(`\n총 ${fetched}건 조회, 매칭 ${contentToImgPath.size}/${spotRows.length}건`);

  // 3. 업데이트
  const previewLimit = DRY_RUN ? 3 : Infinity;
  let updated = 0;
  let missing = 0;

  for (const row of spotRows) {
    const imgPath = contentToImgPath.get(row.visitjeju_content_id);
    if (!imgPath) {
      console.log(`  SKIP(no imgpath): ${row.name} [${row.visitjeju_content_id}]`);
      missing++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY] ${row.name}`);
      console.log(`        imgpath: ${imgPath}`);
      if (updated + 1 >= previewLimit) {
        console.log(`  ... (--dry-run: ${previewLimit}건 미리보기만)`);
        break;
      }
    } else {
      const c = await pool.connect();
      try {
        await c.query('UPDATE spots SET image_url = $1, updated_at = now() WHERE id = $2', [imgPath, row.id]);
      } finally {
        c.release();
      }
    }
    updated++;
  }

  if (DRY_RUN) {
    console.log(`\n[DRY-RUN 완료] 실제 업데이트 없음. --dry-run 플래그 제거 후 재실행하세요.`);
  } else {
    console.log(`\n업데이트 완료: ${updated}건 / 미매칭: ${missing}건`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('에러:', err instanceof Error ? err.message : String(err));
  pool.end().finally(() => process.exit(1));
});
