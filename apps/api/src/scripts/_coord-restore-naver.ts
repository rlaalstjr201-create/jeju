#!/usr/bin/env tsx
// T1 마무리: review_excluded coord_restore — Naver 좌표 적용, review_excluded=false, verified_by='naver'
// Usage: npx tsx src/scripts/_coord-restore-naver.ts

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';

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

loadEnv();
const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

// ── Before 상태 ───────────────────────────────────────────────────

const { rows: before } = await pool.query<{ review_excluded_count: string; total: string }>(`
  SELECT
    COUNT(*) FILTER (WHERE review_excluded = true) AS review_excluded_count,
    COUNT(*) AS total
  FROM curation_candidates WHERE sourced_from = 'visitjeju'
`);
const beforeStats = before[0]!;
process.stdout.write(`[Before] review_excluded: ${beforeStats.review_excluded_count} / ${beforeStats.total}\n\n`);

// ── 복원 대상 조회 ────────────────────────────────────────────────

const { rows: candidates } = await pool.query<{
  id: string; name: string; category: string;
  old_lat: number | null; old_lng: number | null;
  naver_lat: string; naver_lng: string;
}>(`
  SELECT
    id, name, category,
    lat AS old_lat, lng AS old_lng,
    (external_links->'naver'->>'lat')  AS naver_lat,
    (external_links->'naver'->>'lng')  AS naver_lng
  FROM curation_candidates
  WHERE sourced_from = 'visitjeju'
    AND review_excluded = true
    AND external_links ? 'naver'
  ORDER BY id
`);

process.stdout.write(`복원 대상: ${candidates.length}건\n`);

// ── Jeju bbox 사전 검증 ───────────────────────────────────────────

let bboxFail = 0;
for (const r of candidates) {
  const lat = parseFloat(r.naver_lat);
  const lng = parseFloat(r.naver_lng);
  if (!(lat >= 33.0 && lat <= 34.0 && lng >= 126.0 && lng <= 127.0)) {
    process.stderr.write(`  BBOX FAIL: [${r.id}] ${r.name} lat=${lat} lng=${lng}\n`);
    bboxFail++;
  }
}
if (bboxFail > 0) {
  process.stderr.write(`\nBBox 검증 실패 ${bboxFail}건 — 중단\n`);
  await pool.end();
  process.exit(1);
}
process.stdout.write(`Jeju bbox 검증: 전체 통과 ✅\n\n`);

// ── 업데이트 ──────────────────────────────────────────────────────

const { rowCount } = await pool.query(`
  UPDATE curation_candidates
  SET
    lat              = (external_links->'naver'->>'lat')::float8,
    lng              = (external_links->'naver'->>'lng')::float8,
    review_excluded  = false,
    verified_by      = 'naver',
    updated_at       = now()
  WHERE sourced_from = 'visitjeju'
    AND review_excluded = true
    AND external_links ? 'naver'
`);
process.stdout.write(`UPDATE 완료: ${rowCount}행\n\n`);

// ── After 상태 ────────────────────────────────────────────────────

const { rows: after } = await pool.query<{ review_excluded_count: string; total: string }>(`
  SELECT
    COUNT(*) FILTER (WHERE review_excluded = true) AS review_excluded_count,
    COUNT(*) AS total
  FROM curation_candidates WHERE sourced_from = 'visitjeju'
`);
const afterStats = after[0]!;
process.stdout.write(`[After]  review_excluded: ${afterStats.review_excluded_count} / ${afterStats.total}\n`);
process.stdout.write(`  변화: ${beforeStats.review_excluded_count} → ${afterStats.review_excluded_count} (${Number(beforeStats.review_excluded_count) - Number(afterStats.review_excluded_count)}건 복원)\n\n`);

// ── Sample 5건 dump ───────────────────────────────────────────────

const { rows: samples } = await pool.query<{
  id: string; name: string; category: string;
  lat: number; lng: number; verified_by: string; review_excluded: boolean;
  has_kakao: boolean;
}>(`
  SELECT
    id, name, category, lat, lng, verified_by, review_excluded,
    (external_links ? 'kakao') AS has_kakao
  FROM curation_candidates
  WHERE sourced_from = 'visitjeju'
    AND verified_by = 'naver'
  ORDER BY id
  LIMIT 5
`);

process.stdout.write(`=== 복원 행 Sample 5건 ===\n`);
for (const s of samples) {
  const kakaoNote = s.has_kakao
    ? '(카카오도 있음)'
    : '→ 카카오 재시도 가능 후보 (좌표 복원으로 재매칭 가능)';
  process.stdout.write(
    `  [${s.name}] ${s.category}\n` +
    `    lat=${s.lat.toFixed(6)}, lng=${s.lng.toFixed(6)}  verified_by=${s.verified_by}  review_excluded=${s.review_excluded}\n` +
    `    ${kakaoNote}\n`
  );
}

await pool.end();
