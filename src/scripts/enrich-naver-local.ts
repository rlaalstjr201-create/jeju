#!/usr/bin/env tsx
// Phase T1.5: Naver 지역검색 → 잔여 NO_MATCH 1,029건 external_links.naver 보강
// Usage: npx tsx src/scripts/enrich-naver-local.ts [--dry-run]

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { haversineMeters } from './seed-visitjeju-v2.js';
import { stripBrackets } from './enrich-kakao-retry.js';

// ── Pure functions (exported for tests) ───────────────────────────

/** Naver mapx/mapy (integer × 1e7) → WGS84 */
export function naverCoordToWgs84(mapCoord: number): number {
  return mapCoord / 1e7;
}

/** HTML 태그 + 엔티티 제거 */
export function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** 비교용 정규화: 괄호 제거 + 공백 제거 + 소문자 */
export function normalizeForNameMatch(s: string): string {
  return stripBrackets(s).replace(/\s+/g, '').toLowerCase();
}

/**
 * Naver title이 spot name과 이름 일치하는지 판정
 * startsWith 양방향으로 허용 (접두 부속시설 처리)
 * "카페한라산".startsWith("한라산") → false (false positive 차단)
 */
export function isNameMatch(spotName: string, naverTitle: string): boolean {
  const sName = normalizeForNameMatch(spotName);
  const nName = normalizeForNameMatch(naverTitle);
  if (!sName || !nName) return false;
  return sName === nName || nName.startsWith(sName) || sName.startsWith(nName);
}

const JEJU_BBOX = { latMin: 33.0, latMax: 34.0, lngMin: 126.0, lngMax: 127.0 };

export function isJejuBbox(lat: number, lng: number): boolean {
  return lat >= JEJU_BBOX.latMin && lat <= JEJU_BBOX.latMax &&
    lng >= JEJU_BBOX.lngMin && lng <= JEJU_BBOX.lngMax;
}

// ── Naver API types ────────────────────────────────────────────────

interface NaverLocalItem {
  title: string;
  category: string;
  address: string;
  roadAddress: string;
  mapx: number;
  mapy: number;
}

interface NaverLocalResponse {
  total: number;
  items: NaverLocalItem[];
}

interface MatchResult {
  matched: boolean;
  naverLat?: number;
  naverLng?: number;
  address?: string;
  roadAddress?: string;
  distM?: number;
  unverified?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────

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

async function naverLocalSearch(
  query: string,
  clientId: string,
  clientSecret: string,
): Promise<NaverLocalItem[]> {
  const url = new URL('https://openapi.naver.com/v1/search/local.json');
  url.searchParams.set('query', query);
  url.searchParams.set('display', '5');

  let delay = 1000;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url.toString(), {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    });
    if (res.status === 429) { await new Promise(r => setTimeout(r, delay)); delay *= 2; continue; }
    if (!res.ok) throw new Error(`Naver Local API ${res.status}`);
    const data = (await res.json()) as NaverLocalResponse;
    return data.items ?? [];
  }
  return [];
}

export function evaluateNaverItems(
  items: NaverLocalItem[],
  spotName: string,
  spotLat: number | null,
  spotLng: number | null,
  isReviewExcluded: boolean,
  maxDistM = 500,
): MatchResult {
  for (const item of items) {
    const title = stripHtml(item.title);
    if (!isNameMatch(spotName, title)) continue;

    const naverLat = naverCoordToWgs84(item.mapy);
    const naverLng = naverCoordToWgs84(item.mapx);
    if (!isJejuBbox(naverLat, naverLng)) continue;

    if (isReviewExcluded || spotLat == null || spotLng == null) {
      return {
        matched: true,
        naverLat, naverLng,
        address: item.address,
        roadAddress: item.roadAddress,
        unverified: true,
      };
    }

    const distM = haversineMeters(spotLat, spotLng, naverLat, naverLng);
    if (distM > maxDistM) continue;

    return {
      matched: true,
      naverLat, naverLng,
      address: item.address,
      roadAddress: item.roadAddress,
      distM,
    };
  }
  return { matched: false };
}

// ── Main ───────────────────────────────────────────────────────────

const _isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (!process.env['VITEST'] && _isMain) await (async () => {
  loadEnv();
  const isDryRun = process.argv.includes('--dry-run');
  const clientId = process.env['NAVER_CLIENT_ID'];
  const clientSecret = process.env['NAVER_CLIENT_SECRET'];
  if (!clientId || !clientSecret) throw new Error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET not set');

  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

  // 카테고리별 총계 (full NO_MATCH pool 기준 — dry-run LIMIT 무관)
  const { rows: catTotals } = await pool.query<{ category: string; cnt: string }>(`
    SELECT category, COUNT(*) AS cnt
    FROM curation_candidates
    WHERE sourced_from = 'visitjeju'
      AND NOT (external_links ? 'kakao')
    GROUP BY category
  `);
  const catTotal: Record<string, number> = {};
  for (const r of catTotals) catTotal[r.category] = Number(r.cnt);

  const { rows } = await pool.query<{
    id: string; name: string; category: string;
    lat: number | null; lng: number | null; review_excluded: boolean;
  }>(`
    SELECT id, name, category, lat, lng, review_excluded
    FROM curation_candidates
    WHERE sourced_from = 'visitjeju'
      AND NOT (external_links ? 'kakao')
    ORDER BY id
    ${isDryRun ? 'LIMIT 10' : ''}
  `);

  process.stdout.write(`[T1.5 Naver ${isDryRun ? 'DRY-RUN' : 'FULL-RUN'}] NO_MATCH ${rows.length}건\n\n`);

  const stats = {
    total: 0, matched: 0, noMatch: 0, error: 0,
    unverified: 0, coordRestore: 0,
    dist0_300: 0, dist300_500: 0,
  };
  const catMatched: Record<string, number> = {};
  const fpSamples: Array<{
    spotName: string; naverTitle: string; distM: number | null; distStr: string;
    spotLat: number | null; spotLng: number | null;
    naverLat: number; naverLng: number; nameDiff: number;
  }> = [];

  for (const row of rows) {
    stats.total++;
    const stripped = stripBrackets(row.name);
    const query = `${stripped !== row.name ? stripped : row.name} 제주`;

    let items: NaverLocalItem[];
    try {
      items = await naverLocalSearch(query, clientId, clientSecret);
    } catch (err) {
      stats.error++;
      console.error(`  ERROR [${row.id}] ${row.name}: ${String(err)}`);
      await new Promise(r => setTimeout(r, 100));
      continue;
    }

    const result = evaluateNaverItems(items, row.name, row.lat, row.lng, row.review_excluded);

    if (!result.matched) {
      stats.noMatch++;
      await new Promise(r => setTimeout(r, 100));
      continue;
    }

    stats.matched++;
    catMatched[row.category] = (catMatched[row.category] ?? 0) + 1;
    if (result.unverified) stats.unverified++;

    const isCoordRestore = row.review_excluded && result.naverLat != null;
    if (isCoordRestore) stats.coordRestore++;

    if (result.distM != null) {
      if (result.distM <= 300) stats.dist0_300++;
      else stats.dist300_500++;
    }

    const distStr = result.distM != null ? `${(result.distM / 1000).toFixed(2)}km` : 'null좌표';
    const matchedItem = items.find(i => isNameMatch(row.name, stripHtml(i.title)));
    if (matchedItem) {
      const naverTitle = stripHtml(matchedItem.title);
      const nameDiff = Math.abs(
        normalizeForNameMatch(row.name).length - normalizeForNameMatch(naverTitle).length
      );
      fpSamples.push({
        spotName: row.name,
        naverTitle,
        distM: result.distM ?? null,
        distStr,
        spotLat: row.lat, spotLng: row.lng,
        naverLat: result.naverLat!, naverLng: result.naverLng!,
        nameDiff,
      });
    }

    if (isDryRun) {
      const flags = [result.unverified ? 'unverified' : '', isCoordRestore ? 'coord_restore' : ''].filter(Boolean).join(',');
      process.stdout.write(`  MATCH [${row.id}] "${row.name}" → Naver dist=${distStr}${flags ? ' [' + flags + ']' : ''}\n`);
    } else {
      const payload: Record<string, unknown> = {
        lat: result.naverLat,
        lng: result.naverLng,
        address: result.address,
        roadAddress: result.roadAddress || undefined,
        naver_only: true,
      };
      if (result.unverified) payload['naver_unverified'] = true;

      await pool.query(`
        UPDATE curation_candidates
        SET external_links = external_links || jsonb_build_object('naver', $1::jsonb)
        WHERE id = $2
      `, [JSON.stringify(payload), row.id]);
    }

    await new Promise(r => setTimeout(r, 100));
  }

  // 최종 매칭률 (카카오+네이버 합산) 쿼리
  const { rows: finalRows } = await pool.query<{
    kakao_matched: string; naver_matched: string; total: string;
  }>(`
    SELECT
      COUNT(*) FILTER (WHERE external_links ? 'kakao') AS kakao_matched,
      COUNT(*) FILTER (WHERE external_links ? 'naver') AS naver_matched,
      COUNT(*) AS total
    FROM curation_candidates WHERE sourced_from = 'visitjeju'
  `);
  const finalStats = finalRows[0]!;

  // 카테고리별 최종 합산 (kakao OR naver)
  const { rows: catFinalRows } = await pool.query<{
    category: string; kakao: string; naver: string; cat_total: string;
  }>(`
    SELECT
      category,
      COUNT(*) FILTER (WHERE external_links ? 'kakao') AS kakao,
      COUNT(*) FILTER (WHERE external_links ? 'naver') AS naver,
      COUNT(*) AS cat_total
    FROM curation_candidates WHERE sourced_from = 'visitjeju'
    GROUP BY category ORDER BY cat_total DESC
  `);

  await pool.end();

  // 통계
  process.stdout.write(`\n=== T1.5 Naver 통계 ===\n`);
  process.stdout.write(`  총 처리: ${stats.total}건\n`);
  process.stdout.write(`  추가 매칭: ${stats.matched}건 (${(stats.matched / stats.total * 100).toFixed(1)}%)\n`);
  process.stdout.write(`    좌표 확인 (0~300m): ${stats.dist0_300}건\n`);
  process.stdout.write(`    좌표 확인 (300~500m): ${stats.dist300_500}건\n`);
  process.stdout.write(`    naver_unverified (null좌표/review_excluded): ${stats.unverified}건\n`);
  process.stdout.write(`    coord_restore_candidate: ${stats.coordRestore}건\n`);
  process.stdout.write(`  NO_MATCH: ${stats.noMatch}건\n`);
  process.stdout.write(`  ERROR: ${stats.error}건\n`);

  process.stdout.write(`\n  카테고리별 추가 매칭 (NO_MATCH 풀 대비):\n`);
  for (const [cat, cnt] of Object.entries(catMatched).sort((a, b) => b[1] - a[1])) {
    const poolTotal = catTotal[cat] ?? stats.total;
    process.stdout.write(`    ${cat}: ${cnt}/${poolTotal} (${(cnt / poolTotal * 100).toFixed(1)}%)\n`);
  }

  if (!isDryRun) {
    const kakaoN = Number(finalStats.kakao_matched);
    const naverN = Number(finalStats.naver_matched);
    const totalN = Number(finalStats.total);
    const combined = kakaoN + naverN;
    process.stdout.write(`\n=== 최종 매칭률 (카카오+네이버 합산) ===\n`);
    process.stdout.write(`  전체: ${combined}/${totalN} = ${(combined / totalN * 100).toFixed(1)}%\n`);
    process.stdout.write(`    카카오: ${kakaoN}건\n`);
    process.stdout.write(`    네이버: ${naverN}건\n`);
    process.stdout.write(`    미매칭: ${totalN - combined}건\n`);
    process.stdout.write(`\n  카테고리별 최종 합산 매칭률:\n`);
    for (const r of catFinalRows) {
      const kakaoC = Number(r.kakao);
      const naverC = Number(r.naver);
      const catTotalN = Number(r.cat_total);
      const combinedC = kakaoC + naverC;
      process.stdout.write(`    ${r.category}: ${combinedC}/${catTotalN} (${(combinedC / catTotalN * 100).toFixed(1)}%)  [카카오 ${kakaoC} + 네이버 ${naverC}]\n`);
    }
  }

  // false positive sample: >400m 우선, 그 다음 이름 차이 큰 순
  const fpTop = fpSamples.sort((a, b) => {
    const aOver = (a.distM ?? 0) > 400 ? 1 : 0;
    const bOver = (b.distM ?? 0) > 400 ? 1 : 0;
    if (bOver !== aOver) return bOver - aOver;
    if ((b.distM ?? 0) !== (a.distM ?? 0)) return (b.distM ?? 0) - (a.distM ?? 0);
    return b.nameDiff - a.nameDiff;
  }).slice(0, 20);

  process.stdout.write(`\n=== False Positive 의심 샘플 (>400m 우선, 최대 20건) ===\n`);
  for (const s of fpTop) {
    const flag = (s.distM ?? 0) > 400 ? ' ⚠️>400m' : '';
    process.stdout.write(`  "${s.spotName}" vs Naver:"${s.naverTitle}" dist=${s.distStr}${flag}\n`);
    if (s.spotLat != null) {
      process.stdout.write(`    spot(${s.spotLat.toFixed(4)},${s.spotLng?.toFixed(4)}) naver(${s.naverLat.toFixed(4)},${s.naverLng.toFixed(4)}) nameDiff=${s.nameDiff}\n`);
    }
  }

  if (isDryRun) process.stdout.write('\n[DRY-RUN: DB 변경 없음]\n');
})();
