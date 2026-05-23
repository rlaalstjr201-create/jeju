#!/usr/bin/env tsx
// Phase B1 Option-A: NO_MATCH 재처리
// 괄호 제거 전처리 + radius 500m + 카테고리 필터
// 대상: external_links.kakao 없는 행 (1,160건)
// Usage: npx tsx src/scripts/enrich-kakao-retry.ts [--dry-run]

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { haversineMeters } from './seed-visitjeju-v2.js';

// ── Pure functions (exported for tests) ───────────────────────────

/** 괄호 및 괄호 내용 제거: "궁대오름(궁대악)" → "궁대오름" */
export function stripBrackets(name: string): string {
  return name.replace(/\s*[(\（][^)\）]*[)\）]\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

const FOOD_CODES = new Set(['FD6', 'CE7']);
const TOURIST_CODES = new Set(['AT4', 'CT1']);

/**
 * Kakao category_group_code가 spot 카테고리와 명백히 불일치하면 false
 * 미분류('')는 항상 허용
 */
export function isCategoryCompatible(spotCategory: string, kakaoCode: string): boolean {
  if (!kakaoCode) return true;
  if (['sightseeing', 'cultural_space'].includes(spotCategory) && FOOD_CODES.has(kakaoCode)) return false;
  if (['restaurant', 'cafe'].includes(spotCategory) && TOURIST_CODES.has(kakaoCode)) return false;
  if (spotCategory === 'experience' && kakaoCode === 'FD6') return false;
  return true;
}

// ── Kakao types ────────────────────────────────────────────────────

interface KakaoDoc {
  id: string;
  place_name: string;
  category_group_code: string;
  x: string;
  y: string;
}

interface KakaoResponse { documents: KakaoDoc[]; }

const JEJU_BBOX = { latMin: 33.0, latMax: 34.0, lngMin: 126.0, lngMax: 127.0 };

function isJejuBbox(lat: number, lng: number): boolean {
  return lat >= JEJU_BBOX.latMin && lat <= JEJU_BBOX.latMax &&
    lng >= JEJU_BBOX.lngMin && lng <= JEJU_BBOX.lngMax;
}

// ── Env + helpers ─────────────────────────────────────────────────

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

async function kakaoSearch(
  query: string,
  apiKey: string,
  lat: number | null,
  lng: number | null,
  radiusM: number,
): Promise<KakaoDoc[]> {
  const url = new URL('https://dapi.kakao.com/v2/local/search/keyword');
  url.searchParams.set('query', query);
  url.searchParams.set('size', '1');
  if (lat != null && lng != null) {
    url.searchParams.set('x', String(lng));
    url.searchParams.set('y', String(lat));
    url.searchParams.set('radius', String(radiusM));
  }
  let delay = 1000;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url.toString(), { headers: { Authorization: `KakaoAK ${apiKey}` } });
    if (res.status === 429) { await new Promise(r => setTimeout(r, delay)); delay *= 2; continue; }
    if (!res.ok) throw new Error(`Kakao ${res.status}`);
    const data = (await res.json()) as KakaoResponse;
    return data.documents ?? [];
  }
  return [];
}

interface MatchResult {
  matched: boolean;
  placeId?: string;
  placeUrl?: string;
  kakaoLat?: number;
  kakaoLng?: number;
  distM?: number;
  matchedQuery?: string;
  kakaoCode?: string;
  filteredBy?: string;
}

function evaluate(
  docs: KakaoDoc[],
  spotLat: number | null,
  spotLng: number | null,
  spotCategory: string,
  maxRadius: number,
  matchedQuery: string,
): MatchResult {
  const doc = docs[0];
  if (!doc) return { matched: false };

  const kLat = parseFloat(doc.y);
  const kLng = parseFloat(doc.x);
  if (!isJejuBbox(kLat, kLng)) return { matched: false, filteredBy: 'bbox' };

  if (!isCategoryCompatible(spotCategory, doc.category_group_code)) {
    return { matched: false, filteredBy: `category(spot=${spotCategory},kakao=${doc.category_group_code})` };
  }

  const distM = (spotLat != null && spotLng != null)
    ? haversineMeters(spotLat, spotLng, kLat, kLng)
    : null;

  if (distM != null && distM > maxRadius) {
    return { matched: false, filteredBy: `dist>${maxRadius}m(${distM.toFixed(0)}m)` };
  }

  return {
    matched: true,
    placeId: doc.id,
    placeUrl: `https://place.map.kakao.com/${doc.id}`,
    kakaoLat: kLat, kakaoLng: kLng,
    distM: distM ?? undefined,
    matchedQuery,
    kakaoCode: doc.category_group_code,
  };
}

// ── Main ───────────────────────────────────────────────────────────

const _isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (!process.env['VITEST'] && _isMain) await (async () => {
  loadEnv();
  const isDryRun = process.argv.includes('--dry-run');
  const apiKey = process.env['KAKAO_REST_API_KEY'];
  if (!apiKey) throw new Error('KAKAO_REST_API_KEY not set');

  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

  const { rows } = await pool.query<{
    id: number; name: string; category: string;
    lat: number | null; lng: number | null; review_excluded: boolean;
  }>(`
    SELECT id, name, category, lat, lng, review_excluded
    FROM curation_candidates
    WHERE sourced_from = 'visitjeju'
      AND NOT (external_links ? 'kakao')
    ORDER BY id
    ${isDryRun ? 'LIMIT 10' : ''}
  `);

  process.stdout.write(`[Option-A ${isDryRun ? 'DRY-RUN' : 'FULL-RUN'}] NO_MATCH ${rows.length}건 재처리\n`);
  process.stdout.write(`  보정: 괄호 제거 + radius 500m + 카테고리 필터\n\n`);

  const stats = {
    total: 0, matched: 0, noMatch: 0, error: 0,
    bracketHelped: 0, categoryFiltered: 0, dist300_500: 0,
  };
  const catCounts: Record<string, number> = {};

  for (const row of rows) {
    stats.total++;

    // review_excluded: 이름만 검색 (좌표 없음), radius 적용 X
    const useLat = row.review_excluded ? null : row.lat;
    const useLng = row.review_excluded ? null : row.lng;
    const radius = 500;

    const stripped = stripBrackets(row.name);
    const hasStripped = stripped !== row.name && stripped.length > 0;

    let result: MatchResult = { matched: false };
    let apiCalls = 0;

    // 1차: stripped name
    if (hasStripped) {
      try {
        const docs = await kakaoSearch(stripped, apiKey, useLat, useLng, radius);
        apiCalls++;
        result = evaluate(docs, row.lat, row.lng, row.category, radius, stripped);
        if (result.matched) stats.bracketHelped++;
      } catch (err) {
        stats.error++;
        process.stdout.write(`  ERROR ${row.name}: ${String(err)}\n`);
        await new Promise(r => setTimeout(r, 100));
        continue;
      }
    }

    // 2차: original name (stripped 실패 or 괄호 없는 경우)
    if (!result.matched) {
      try {
        if (apiCalls > 0) await new Promise(r => setTimeout(r, 100)); // 1차 이미 호출됨
        const docs = await kakaoSearch(row.name, apiKey, useLat, useLng, radius);
        result = evaluate(docs, row.lat, row.lng, row.category, radius, row.name);
      } catch (err) {
        stats.error++;
        process.stdout.write(`  ERROR ${row.name}: ${String(err)}\n`);
        await new Promise(r => setTimeout(r, 100));
        continue;
      }
    }

    if (result.filteredBy?.startsWith('category')) stats.categoryFiltered++;

    if (result.matched) {
      stats.matched++;
      catCounts[row.category] = (catCounts[row.category] ?? 0) + 1;
      if (result.distM != null && result.distM > 300) stats.dist300_500++;

      if (isDryRun) {
        const distStr = result.distM != null ? `${result.distM.toFixed(0)}m` : 'null좌표';
        const qStr = result.matchedQuery !== row.name ? ` [괄호제거:"${result.matchedQuery}"]` : '';
        process.stdout.write(`  MATCH [${row.id}] ${row.name}${qStr} dist=${distStr} code=${result.kakaoCode || '--'}\n`);
      } else {
        const payload: Record<string, unknown> = {
          place_id: result.placeId,
          place_url: result.placeUrl,
        };
        if (result.matchedQuery !== row.name) payload['match_via'] = 'bracket_stripped';
        if (result.distM != null && result.distM > 300) payload['match_radius'] = 500;
        if (row.review_excluded) payload['unverified'] = true;

        await pool.query(`
          UPDATE curation_candidates
          SET external_links = external_links || jsonb_build_object('kakao', $1::jsonb)
          WHERE id = $2
        `, [JSON.stringify(payload), row.id]);
      }
    } else {
      stats.noMatch++;
      if (isDryRun && result.filteredBy) {
        process.stdout.write(`  FILTERED [${row.id}] ${row.name} → ${result.filteredBy}\n`);
      }
    }

    await new Promise(r => setTimeout(r, 100));
  }

  await pool.end();

  process.stdout.write(`\n=== Option-A 통계 ===\n`);
  process.stdout.write(`  총 처리: ${stats.total}건\n`);
  process.stdout.write(`  추가 매칭: ${stats.matched}건 (${(stats.matched / stats.total * 100).toFixed(1)}%)\n`);
  process.stdout.write(`    괄호 제거 덕분에 매칭: ${stats.bracketHelped}건\n`);
  process.stdout.write(`    300~500m 구간 추가: ${stats.dist300_500}건\n`);
  process.stdout.write(`  카테고리 필터 차단: ${stats.categoryFiltered}건\n`);
  process.stdout.write(`  NO_MATCH: ${stats.noMatch}건\n`);
  process.stdout.write(`  ERROR: ${stats.error}건\n`);
  process.stdout.write(`\n  카테고리별 추가 매칭:\n`);
  for (const [cat, cnt] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
    process.stdout.write(`    ${cat}: ${cnt}\n`);
  }
  if (isDryRun) process.stdout.write('\n[DRY-RUN: DB 변경 없음]\n');
})();
