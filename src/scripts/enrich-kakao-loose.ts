#!/usr/bin/env tsx
// Phase B1 Option-D: NO_MATCH 1,160건 name-only 재검색 → external_links.kakao_loose
// Usage: npx tsx src/scripts/enrich-kakao-loose.ts [--dry-run]

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { haversineMeters } from './seed-visitjeju-v2.js';

interface KakaoDoc {
  id: string;
  place_name: string;
  x: string;
  y: string;
}

export interface LooseMatchResult {
  matched: boolean;
  placeId: string | null;
  placeName: string | null;
  placeUrl: string | null;
  kakaoLat: number | null;
  kakaoLng: number | null;
  distanceMeters: number | null;
}

const JEJU_BBOX = { latMin: 33.0, latMax: 34.0, lngMin: 126.0, lngMax: 127.0 };

function isJejuBbox(lat: number, lng: number): boolean {
  return lat >= JEJU_BBOX.latMin && lat <= JEJU_BBOX.latMax &&
    lng >= JEJU_BBOX.lngMin && lng <= JEJU_BBOX.lngMax;
}

export function computeLooseMatch(
  docs: KakaoDoc[],
  spotLat: number | null,
  spotLng: number | null,
): LooseMatchResult {
  const NO = { matched: false, placeId: null, placeName: null, placeUrl: null, kakaoLat: null, kakaoLng: null, distanceMeters: null };
  const doc = docs[0];
  if (!doc) return NO;

  const kakaoLat = parseFloat(doc.y);
  const kakaoLng = parseFloat(doc.x);
  if (!isJejuBbox(kakaoLat, kakaoLng)) return NO;

  const distanceMeters = (spotLat != null && spotLng != null)
    ? haversineMeters(spotLat, spotLng, kakaoLat, kakaoLng)
    : null;

  return {
    matched: true,
    placeId: doc.id,
    placeName: doc.place_name,
    placeUrl: `https://place.map.kakao.com/${doc.id}`,
    kakaoLat,
    kakaoLng,
    distanceMeters,
  };
}

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

async function fetchKakaoNameOnly(name: string, apiKey: string): Promise<KakaoDoc[]> {
  const url = new URL('https://dapi.kakao.com/v2/local/search/keyword');
  url.searchParams.set('query', name);
  url.searchParams.set('size', '1');

  let delay = 1000;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url.toString(), { headers: { Authorization: `KakaoAK ${apiKey}` } });
    if (res.status === 429) {
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
      continue;
    }
    if (!res.ok) throw new Error(`Kakao API ${res.status}`);
    const data = (await res.json()) as { documents: KakaoDoc[] };
    return data.documents ?? [];
  }
  return [];
}

if (!process.env['VITEST']) await (async () => {
  loadEnv();
  const isDryRun = process.argv.includes('--dry-run');
  const apiKey = process.env['KAKAO_REST_API_KEY'];
  if (!apiKey) throw new Error('KAKAO_REST_API_KEY not set');

  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

  const { rows } = await pool.query<{
    id: number; name: string; category: string;
    lat: number | null; lng: number | null;
  }>(`
    SELECT id, name, category, lat, lng
    FROM curation_candidates
    WHERE sourced_from = 'visitjeju'
      AND NOT (external_links ? 'kakao')
    ORDER BY id
    ${isDryRun ? 'LIMIT 10' : ''}
  `);

  process.stdout.write(`[Option-D ${isDryRun ? 'DRY-RUN' : 'FULL-RUN'}] NO_MATCH ${rows.length}건 name-only 재검색\n\n`);

  const stats = {
    total: 0, matched: 0, noMatch: 0, error: 0,
    dist5km: 0,
  };
  const catCounts: Record<string, number> = {};
  const matchedSamples: Array<{
    spotName: string; kakaoName: string;
    spotLat: number | null; spotLng: number | null;
    kakaoLat: number; kakaoLng: number;
    distKm: number | null;
    category: string;
  }> = [];

  for (const row of rows) {
    stats.total++;
    let docs: KakaoDoc[] = [];
    try {
      docs = await fetchKakaoNameOnly(row.name, apiKey);
    } catch (err) {
      stats.error++;
      console.error(`  ERROR [${row.id}] ${row.name}: ${String(err)}`);
      await new Promise(r => setTimeout(r, 100));
      continue;
    }

    const result = computeLooseMatch(docs, row.lat, row.lng);

    if (!result.matched) {
      stats.noMatch++;
      await new Promise(r => setTimeout(r, 100));
      continue;
    }

    stats.matched++;
    catCounts[row.category] = (catCounts[row.category] ?? 0) + 1;

    const distKm = result.distanceMeters != null ? result.distanceMeters / 1000 : null;
    if (distKm != null && distKm > 5) stats.dist5km++;

    matchedSamples.push({
      spotName: row.name,
      kakaoName: result.placeName!,
      spotLat: row.lat,
      spotLng: row.lng,
      kakaoLat: result.kakaoLat!,
      kakaoLng: result.kakaoLng!,
      distKm,
      category: row.category,
    });

    if (!isDryRun) {
      const payload = {
        place_id: result.placeId,
        place_url: result.placeUrl,
        kakao_match_type: 'name_only',
      };
      await pool.query(`
        UPDATE curation_candidates
        SET external_links = external_links || jsonb_build_object('kakao_loose', $1::jsonb)
        WHERE id = $2
      `, [JSON.stringify(payload), row.id]);
    }

    await new Promise(r => setTimeout(r, 100));
  }

  await pool.end();

  process.stdout.write(`\n=== Option-D 통계 ===\n`);
  process.stdout.write(`  총 처리: ${stats.total}건\n`);
  process.stdout.write(`  추가 매칭: ${stats.matched}건 (${(stats.matched / stats.total * 100).toFixed(1)}%)\n`);
  process.stdout.write(`  NO_MATCH: ${stats.noMatch}건\n`);
  process.stdout.write(`  ERROR: ${stats.error}건\n`);
  process.stdout.write(`  거리 >5km 의심: ${stats.dist5km}건\n`);

  process.stdout.write(`\n  카테고리별 추가 매칭:\n`);
  for (const [cat, cnt] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
    process.stdout.write(`    ${cat}: ${cnt}\n`);
  }

  // false positive sample 20건 (거리 큰 순 정렬)
  const sample = matchedSamples
    .sort((a, b) => (b.distKm ?? 0) - (a.distKm ?? 0))
    .slice(0, 20);

  process.stdout.write(`\n=== False Positive 의심 샘플 (거리 큰 순 최대 20건) ===\n`);
  for (const s of sample) {
    const distStr = s.distKm != null ? `${s.distKm.toFixed(2)}km` : 'null좌표';
    process.stdout.write(`  [${s.category}] "${s.spotName}" vs Kakao:"${s.kakaoName}" dist=${distStr}\n`);
    if (s.spotLat != null) {
      process.stdout.write(`    spot(${s.spotLat.toFixed(4)},${s.spotLng?.toFixed(4)}) kakao(${s.kakaoLat.toFixed(4)},${s.kakaoLng.toFixed(4)})\n`);
    }
  }

  if (isDryRun) process.stdout.write('\n[DRY-RUN: DB 변경 없음]\n');
})();
