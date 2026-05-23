#!/usr/bin/env tsx
/**
 * recategorize-alpha.ts
 * ADR-0051 Amendment 1 카테고리 재분류 일괄 적용.
 *
 * 이동 규칙:
 *   1. cultural_space → sightseeing: 테마파크·유적·기념관 등
 *   2. cafe → restaurant: 분식·버거·피자·김밥·국밥
 *   3. cafe → excluded_lodging: 펜션·독채·스테이
 *
 * 실행: npx tsx src/scripts/diagnostics/recategorize-alpha.ts [--apply]
 *   기본(dry-run): 영향 spot 출력만.
 *   --apply: 실제 UPDATE 실행 + backup JSON 저장.
 */
import { Pool } from 'pg';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
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

// ── 이동 규칙 ─────────────────────────────────────────────────────

// 1) cultural_space → sightseeing
//    테마파크·유적·기념관 계열. 미술관·박물관·갤러리·공연장·전시관은 유지.
const CS_TO_SIGHT_INCLUDES = [
  '%테마파크%', '%워터파크%',
  '%헬로키티%', '%테디베어%', '%스누피%',
  '%아일랜드%',                   // 헬로키티아일랜드
  '%4.3%', '%평화공원%', '%기념관%', '%유적%', '%항일%',
  '%소인국%', '%서프라이즈%',
  '%일출랜드%',                   // 관광 테마파크
  '%중문카라반%',                 // 카라반 파크
];
const CS_TO_SIGHT_EXCLUDES = [
  '%미술관%', '%박물관%', '%갤러리%', '%공연장%', '%전시관%',
  '%아트센터%', '%도서관%',
];

// 2) cafe → restaurant: 식사 중심
const CAFE_TO_REST_INCLUDES = [
  '%분식%', '%버거%', '%피자%', '%김밥%', '%국밥%', '%국수%',
];

// 3) cafe → excluded (숙박)
const CAFE_TO_EXCL_INCLUDES = [
  '%펜션%', '%독채%', '%스테이%', '%게스트하우스%', '%민박%',
];

// ── 헬퍼 ──────────────────────────────────────────────────────────

function buildLikeOr(field: string, patterns: string[]): string {
  return patterns.map(p => `${field} ILIKE '${p.replace(/'/g, "''")}'`).join(' OR ');
}

function buildLikeAnd(field: string, patterns: string[]): string {
  return patterns.map(p => `${field} NOT ILIKE '${p.replace(/'/g, "''")}'`).join(' AND ');
}

interface SpotRow {
  id: string;
  name: string;
  category: string;
  region: string;
  final_score: number;
}

// ── 메인 ──────────────────────────────────────────────────────────

if (!process.env['VITEST']) await (async () => {
  loadEnv();
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  const isApply = process.argv.includes('--apply');

  // 1) cultural_space → sightseeing
  const cs2sightWhere = `category = 'cultural_space'
    AND selected_tier = 'reference'
    AND (${buildLikeOr('name', CS_TO_SIGHT_INCLUDES)})
    AND (${buildLikeAnd('name', CS_TO_SIGHT_EXCLUDES)})`;

  const { rows: cs2sight } = await pool.query<SpotRow>(
    `SELECT id, name, category, region, final_score
     FROM curation_candidates WHERE ${cs2sightWhere}
     ORDER BY name`,
  );

  // 2) cafe → restaurant
  const cafe2restWhere = `category = 'cafe'
    AND selected_tier = 'reference'
    AND (${buildLikeOr('name', CAFE_TO_REST_INCLUDES)})`;

  const { rows: cafe2rest } = await pool.query<SpotRow>(
    `SELECT id, name, category, region, final_score
     FROM curation_candidates WHERE ${cafe2restWhere}
     ORDER BY name`,
  );

  // 3) cafe → excluded (숙박)
  const cafe2exclWhere = `category = 'cafe'
    AND selected_tier = 'reference'
    AND (${buildLikeOr('name', CAFE_TO_EXCL_INCLUDES)})`;

  const { rows: cafe2excl } = await pool.query<SpotRow>(
    `SELECT id, name, category, region, final_score
     FROM curation_candidates WHERE ${cafe2exclWhere}
     ORDER BY name`,
  );

  // ── 출력 ────────────────────────────────────────────────────────

  console.log(`\n[recategorize] mode: ${isApply ? 'APPLY' : 'dry-run'}\n`);

  console.log(`=== 1. cultural_space → sightseeing (${cs2sight.length}건) ===`);
  for (const r of cs2sight) console.log(`  ${r.name} (${r.region})`);

  console.log(`\n=== 2. cafe → restaurant (${cafe2rest.length}건) ===`);
  for (const r of cafe2rest) console.log(`  ${r.name} (${r.region})`);

  console.log(`\n=== 3. cafe → excluded_lodging (${cafe2excl.length}건) ===`);
  for (const r of cafe2excl) console.log(`  ${r.name} (${r.region})`);

  const total = cs2sight.length + cafe2rest.length + cafe2excl.length;
  console.log(`\n합계 영향: ${total}건`);

  // 변경 전 카운트
  const { rows: before } = await pool.query<{ category: string; cnt: string }>(
    `SELECT category, COUNT(*) AS cnt FROM curation_candidates
     WHERE selected_tier = 'reference' GROUP BY category ORDER BY category`,
  );
  console.log('\n변경 전 카테고리별 카운트:');
  for (const r of before) console.log(`  ${r.category.padEnd(16)}: ${r.cnt}건`);

  if (!isApply) {
    console.log('\n(dry-run: DB 변경 없음. --apply 플래그로 실제 적용)');
    await pool.end();
    return;
  }

  // ── 백업 ────────────────────────────────────────────────────────

  const { rows: allSpots } = await pool.query(
    `SELECT id, name, category, region, selected_tier FROM curation_candidates
     WHERE selected_tier = 'reference' ORDER BY name`,
  );
  const backupDir = resolve(process.cwd(), 'backup');
  mkdirSync(backupDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = resolve(backupDir, `recategorize-${ts}.json`);
  writeFileSync(backupPath, JSON.stringify(allSpots, null, 2), 'utf-8');
  console.log(`\n[backup] ${backupPath}`);

  // ── 실제 UPDATE ─────────────────────────────────────────────────

  if (cs2sight.length > 0) {
    const ids = cs2sight.map(r => r.id);
    await pool.query(
      `UPDATE curation_candidates SET category = 'sightseeing'
       WHERE id = ANY($1)`,
      [ids],
    );
    console.log(`[apply] cultural_space → sightseeing: ${ids.length}건`);
  }

  if (cafe2rest.length > 0) {
    const ids = cafe2rest.map(r => r.id);
    await pool.query(
      `UPDATE curation_candidates SET category = 'restaurant'
       WHERE id = ANY($1)`,
      [ids],
    );
    console.log(`[apply] cafe → restaurant: ${ids.length}건`);
  }

  if (cafe2excl.length > 0) {
    const ids = cafe2excl.map(r => r.id);
    await pool.query(
      `UPDATE curation_candidates
       SET selected_tier = NULL, category = 'cafe'
       WHERE id = ANY($1)`,
      [ids],
    );
    console.log(`[apply] cafe → excluded (selected_tier=NULL): ${ids.length}건`);
  }

  // 변경 후 카운트
  const { rows: after } = await pool.query<{ category: string; cnt: string }>(
    `SELECT category, COUNT(*) AS cnt FROM curation_candidates
     WHERE selected_tier = 'reference' GROUP BY category ORDER BY category`,
  );
  console.log('\n변경 후 카테고리별 카운트:');
  for (const r of after) console.log(`  ${r.category.padEnd(16)}: ${r.cnt}건`);

  const { rows: excluded } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM curation_candidates WHERE selected_tier = 'excluded_lodging'`,
  );
  console.log(`  excluded_lodging   : ${excluded[0]?.cnt ?? 0}건`);

  await pool.end();
})();
