#!/usr/bin/env tsx
/**
 * 진단: 네이버 데이터랩 신호 현주소 + 미검토 candidates 분류
 * 수정 없음. 읽기 전용.
 */
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

function loadEnv(): void {
  try {
    const lines = readFileSync('../../.env', 'utf-8').split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  } catch { /* no .env */ }
}

loadEnv();
const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

// ── [1-A] candidates 테이블 전체 컬럼 목록 ────────────────────────────────────

console.log('\n=== [1-A] curation_candidates 전체 컬럼 ===');
const { rows: cols } = await pool.query<{
  column_name: string;
  data_type: string;
  is_nullable: string;
}>(`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'curation_candidates'
  ORDER BY ordinal_position
`);
for (const c of cols) {
  console.log(`  ${c.column_name.padEnd(36)} ${c.data_type.padEnd(20)} nullable=${c.is_nullable}`);
}

// ── [1-B] 데이터랩·trend·search 관련 컬럼 필터 ───────────────────────────────

console.log('\n=== [1-B] 데이터랩·trend·search 관련 컬럼 ===');
const trendCols = cols.filter(c =>
  /trend|search|datalab|naver_signal|volume|ratio|rank|score|popular/i.test(c.column_name)
);
if (trendCols.length === 0) {
  console.log('  (해당 없음 — trend_category 이외 검색량 컬럼 없음)');
} else {
  for (const c of trendCols) {
    console.log(`  ${c.column_name.padEnd(36)} ${c.data_type}`);
  }
}

// ── [1-C] trend_category 값 분포 (전체 테이블) ───────────────────────────────

console.log('\n=== [1-C] trend_category 값 분포 (전체 curation_candidates) ===');
const { rows: trendDist } = await pool.query<{ val: string; cnt: string }>(`
  SELECT COALESCE(trend_category, 'NULL') AS val, COUNT(*) AS cnt
  FROM curation_candidates
  GROUP BY trend_category
  ORDER BY cnt DESC
`);
let grandTotal = 0;
for (const r of trendDist) {
  grandTotal += parseInt(r.cnt, 10);
  console.log(`  ${String(r.val).padEnd(20)}: ${r.cnt}건`);
}
console.log(`  ${'합계'.padEnd(20)}: ${grandTotal}건`);

// ── [1-D] 미검토 698건 중 trend_category NULL 비율 ────────────────────────────

console.log('\n=== [1-D] 미검토 풀(comment_draft IS NOT NULL, flag IS NULL) 내 trend_category 분포 ===');
const { rows: trendInPool } = await pool.query<{ val: string; cnt: string }>(`
  SELECT COALESCE(trend_category, 'NULL') AS val, COUNT(*) AS cnt
  FROM curation_candidates
  WHERE comment_draft IS NOT NULL
    AND comment_warning_flag IS NULL
  GROUP BY trend_category
  ORDER BY cnt DESC
`);
let poolTotal = 0;
for (const r of trendInPool) {
  poolTotal += parseInt(r.cnt, 10);
}
for (const r of trendInPool) {
  const pct = ((parseInt(r.cnt, 10) / poolTotal) * 100).toFixed(1);
  console.log(`  ${String(r.val).padEnd(20)}: ${r.cnt}건 (${pct}%)`);
}
console.log(`  ${'합계'.padEnd(20)}: ${poolTotal}건`);

// ── [1-E] 검색량 절대값 컬럼 있나 — final_score·ai_estimated_score 확인 ──────

console.log('\n=== [1-E] 점수 컬럼 분포 (미검토 풀) ===');
const { rows: [scoreStats] } = await pool.query<{
  fs_not_null: string;
  fs_null: string;
  ai_not_null: string;
  ai_null: string;
  fs_min: string;
  fs_med: string;
  fs_max: string;
  ai_min: string;
  ai_med: string;
  ai_max: string;
}>(`
  SELECT
    COUNT(*) FILTER (WHERE final_score IS NOT NULL)       AS fs_not_null,
    COUNT(*) FILTER (WHERE final_score IS NULL)           AS fs_null,
    COUNT(*) FILTER (WHERE ai_estimated_score IS NOT NULL) AS ai_not_null,
    COUNT(*) FILTER (WHERE ai_estimated_score IS NULL)     AS ai_null,
    MIN(final_score)::text                                 AS fs_min,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY final_score)::text AS fs_med,
    MAX(final_score)::text                                 AS fs_max,
    MIN(ai_estimated_score)::text                          AS ai_min,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ai_estimated_score)::text AS ai_med,
    MAX(ai_estimated_score)::text                          AS ai_max
  FROM curation_candidates
  WHERE comment_draft IS NOT NULL
    AND comment_warning_flag IS NULL
`);
console.log(`  final_score     : NOT NULL=${scoreStats!.fs_not_null}건 / NULL=${scoreStats!.fs_null}건`);
if (parseInt(scoreStats!.fs_not_null, 10) > 0) {
  console.log(`    min=${scoreStats!.fs_min} median=${scoreStats!.fs_med} max=${scoreStats!.fs_max}`);
}
console.log(`  ai_estimated_score: NOT NULL=${scoreStats!.ai_not_null}건 / NULL=${scoreStats!.ai_null}건`);
if (parseInt(scoreStats!.ai_not_null, 10) > 0) {
  console.log(`    min=${scoreStats!.ai_min} median=${scoreStats!.ai_med} max=${scoreStats!.ai_max}`);
}

// ── [2] 미검토 candidates 4분류 ───────────────────────────────────────────────
// 대상: comment_draft IS NOT NULL AND comment_warning_flag IS NULL AND spots 미등재
// 분류 기준 — trend_category 값만 있으면 그것 사용, 없으면 NULL 분류
// trend_category 값이 실제로 어떤 문자열인지 먼저 확인

console.log('\n=== [2] 미검토 candidates 분류 ===');

// 대상 확인 (spots 미등재 = candidate status not 'approved')
const { rows: [targetCount] } = await pool.query<{ cnt: string }>(`
  SELECT COUNT(*) AS cnt
  FROM curation_candidates
  WHERE comment_draft IS NOT NULL
    AND comment_warning_flag IS NULL
    AND status NOT IN ('approved')
`);
console.log(`  분류 대상: ${targetCount!.cnt}건 (spots 미등재 기준)`);

// trend_category 실제 값 집합
const { rows: trendValues } = await pool.query<{ trend_category: string | null; cnt: string }>(`
  SELECT trend_category, COUNT(*) AS cnt
  FROM curation_candidates
  WHERE comment_draft IS NOT NULL
    AND comment_warning_flag IS NULL
    AND status NOT IN ('approved')
  GROUP BY trend_category
  ORDER BY cnt DESC
`);
console.log('\n  trend_category 실제 값:');
for (const r of trendValues) {
  console.log(`    "${r.trend_category ?? 'NULL'}": ${r.cnt}건`);
}

// declining 후보 (flag=declining은 여기서 제외됐으므로 trend_category 기반만)
// 분류: declining-like trend vs steady vs rising vs NULL
// trend_category 실제 값에 따라 동적으로 분류

// declining/낮음 분류
const { rows: decliningRows } = await pool.query<{ name: string; trend_category: string | null }>(`
  SELECT name, trend_category
  FROM curation_candidates
  WHERE comment_draft IS NOT NULL
    AND comment_warning_flag IS NULL
    AND status NOT IN ('approved')
    AND trend_category ILIKE ANY(ARRAY['%declin%','%낮음%','%low%','%drop%','%하락%'])
  ORDER BY name
  LIMIT 20
`);

// steady 분류
const { rows: steadyRows } = await pool.query<{ name: string; trend_category: string | null }>(`
  SELECT name, trend_category
  FROM curation_candidates
  WHERE comment_draft IS NOT NULL
    AND comment_warning_flag IS NULL
    AND status NOT IN ('approved')
    AND trend_category ILIKE ANY(ARRAY['%steady%','%꾸준%','%stable%','%유지%'])
  ORDER BY name
  LIMIT 20
`);

// rising 분류
const { rows: risingRows } = await pool.query<{ name: string; trend_category: string | null }>(`
  SELECT name, trend_category
  FROM curation_candidates
  WHERE comment_draft IS NOT NULL
    AND comment_warning_flag IS NULL
    AND status NOT IN ('approved')
    AND trend_category ILIKE ANY(ARRAY['%rising%','%상승%','%떠오름%','%rise%','%급상승%','%new%','%신규%'])
  ORDER BY name
  LIMIT 20
`);

// NULL 분류
const { rows: nullRows } = await pool.query<{ name: string; trend_category: string | null }>(`
  SELECT name, trend_category
  FROM curation_candidates
  WHERE comment_draft IS NOT NULL
    AND comment_warning_flag IS NULL
    AND status NOT IN ('approved')
    AND trend_category IS NULL
  ORDER BY name
  LIMIT 20
`);

// 건수 집계
const { rows: classCounts } = await pool.query<{ cls: string; cnt: string }>(`
  SELECT
    CASE
      WHEN trend_category ILIKE ANY(ARRAY['%declin%','%낮음%','%low%','%drop%','%하락%']) THEN '죽어있음/낮음'
      WHEN trend_category ILIKE ANY(ARRAY['%steady%','%꾸준%','%stable%','%유지%'])        THEN '꾸준함'
      WHEN trend_category ILIKE ANY(ARRAY['%rising%','%상승%','%떠오름%','%rise%','%급상승%','%new%','%신규%']) THEN '떠오름/신규'
      WHEN trend_category IS NULL THEN '신규/측정불가(NULL)'
      ELSE '기타(' || trend_category || ')'
    END AS cls,
    COUNT(*) AS cnt
  FROM curation_candidates
  WHERE comment_draft IS NOT NULL
    AND comment_warning_flag IS NULL
    AND status NOT IN ('approved')
  GROUP BY cls
  ORDER BY cnt DESC
`);

console.log('\n  분류 결과:');
for (const r of classCounts) {
  console.log(`    ${r.cls.padEnd(24)}: ${r.cnt}건`);
}

function printTop20(label: string, rows: Array<{ name: string; trend_category: string | null }>): void {
  console.log(`\n  [${label}] 상위 ${rows.length}건:`);
  if (rows.length === 0) {
    console.log('    (없음)');
    return;
  }
  for (const r of rows) {
    console.log(`    - ${r.name}${r.trend_category ? ` (${r.trend_category})` : ''}`);
  }
}

printTop20('죽어있음/낮음', decliningRows);
printTop20('꾸준함', steadyRows);
printTop20('떠오름/신규', risingRows);
printTop20('NULL', nullRows);

// ── [3] 신호 완전성 진단 ──────────────────────────────────────────────────────

console.log('\n=== [3] 데이터랩 신호 완전성 진단 ===');
const nullCount   = trendValues.find(r => r.trend_category === null)?.cnt ?? '0';
const totalInPool = parseInt(targetCount!.cnt, 10);
const nullPct     = ((parseInt(nullCount, 10) / totalInPool) * 100).toFixed(1);

console.log(`  trend_category NULL 비율: ${nullCount}건 / ${totalInPool}건 = ${nullPct}%`);

// 검색량 절대값 컬럼 유무 체크
const hasAbsoluteVolume = trendCols.some(c =>
  /volume|count|absolute|raw/i.test(c.column_name)
);
const hasTimeSeries = trendCols.some(c =>
  /series|history|weekly|monthly|timeline/i.test(c.column_name)
);

console.log(`  검색량 절대값 컬럼: ${hasAbsoluteVolume ? '있음' : '없음'}`);
console.log(`  시계열 컬럼      : ${hasTimeSeries ? '있음' : '없음'}`);

if (parseFloat(nullPct) > 50) {
  console.log(`\n  ⚠ 진단: 데이터랩 통합 미완성`);
  console.log(`    - trend_category NULL ${nullPct}% — 분류 신뢰도 낮음`);
  console.log(`    - 검색량 절대값·시계열 컬럼 없음 — 순위 기반 분류 불가`);
  console.log(`    - trend_category 값 자체가 있는 건수: ${totalInPool - parseInt(nullCount, 10)}건`);
} else {
  console.log(`\n  진단: trend_category 커버리지 ${100 - parseFloat(nullPct)}% — 분류 활용 가능`);
}

await pool.end();
