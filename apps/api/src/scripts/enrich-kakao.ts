#!/usr/bin/env tsx
// Phase B1+B2: curation_candidates(sourced_from='visitjeju') → external_links.kakao 보강
// Usage: npx tsx enrich-kakao.ts [--dry-run] [--coord-restore]

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { haversineMeters } from './seed-visitjeju-v2.js';

// ── Types ──────────────────────────────────────────────────────────

export interface KakaoDoc {
  id: string;
  place_name: string;
  x: string; // lng
  y: string; // lat
}

export interface KakaoMatchResult {
  matched: boolean;
  placeId: string | null;
  placeUrl: string | null;
  kakaoLat: number | null;
  kakaoLng: number | null;
  unverified: boolean;
  coordRestoreCandidate: boolean;
}

interface CandidateRow {
  id: number;
  name: string;
  lat: number | null;
  lng: number | null;
  review_excluded: boolean;
}

// ── Pure functions (exported for tests) ───────────────────────────

export function isKakaoJejuBbox(lat: number, lng: number): boolean {
  return lat >= 33.0 && lat <= 34.0 && lng >= 126.0 && lng <= 127.0;
}

export function matchKakaoResult(
  docs: KakaoDoc[],
  spotLat: number | null,
  spotLng: number | null,
  isReviewExcluded: boolean,
): KakaoMatchResult {
  const NO_MATCH: KakaoMatchResult = {
    matched: false,
    placeId: null,
    placeUrl: null,
    kakaoLat: null,
    kakaoLng: null,
    unverified: false,
    coordRestoreCandidate: false,
  };

  if (docs.length === 0) return NO_MATCH;

  const doc = docs[0];
  const kakaoLat = parseFloat(doc.y);
  const kakaoLng = parseFloat(doc.x);

  if (!isKakaoJejuBbox(kakaoLat, kakaoLng)) return NO_MATCH;

  if (isReviewExcluded) {
    return {
      matched: true,
      placeId: doc.id,
      placeUrl: `https://place.map.kakao.com/${doc.id}`,
      kakaoLat,
      kakaoLng,
      unverified: true,
      coordRestoreCandidate: true,
    };
  }

  // Normal row: distance check only when spot coords are available
  if (spotLat !== null && spotLng !== null) {
    const dist = haversineMeters(spotLat, spotLng, kakaoLat, kakaoLng);
    if (dist > 300) return NO_MATCH;
  }

  return {
    matched: true,
    placeId: doc.id,
    placeUrl: `https://place.map.kakao.com/${doc.id}`,
    kakaoLat,
    kakaoLng,
    unverified: false,
    coordRestoreCandidate: false,
  };
}

// ── Env loader ─────────────────────────────────────────────────────

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

// ── Kakao API call ─────────────────────────────────────────────────

async function fetchKakao(
  name: string,
  apiKey: string,
  coords?: { lat: number; lng: number },
): Promise<KakaoDoc[]> {
  const url = new URL('https://dapi.kakao.com/v2/local/search/keyword');
  url.searchParams.set('query', name);
  url.searchParams.set('size', '1');
  if (coords) {
    url.searchParams.set('x', String(coords.lng));
    url.searchParams.set('y', String(coords.lat));
    url.searchParams.set('radius', '300');
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `KakaoAK ${apiKey}` },
  });

  if (res.status === 429) {
    const err = new Error('HTTP 429');
    (err as NodeJS.ErrnoException).code = '429';
    throw err;
  }

  if (!res.ok) throw new Error(`Kakao API ${res.status}`);

  const data = (await res.json()) as { documents: KakaoDoc[] };
  return data.documents;
}

async function fetchWithRetry(
  name: string,
  apiKey: string,
  coords?: { lat: number; lng: number },
): Promise<KakaoDoc[]> {
  let delay = 1000;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetchKakao(name, apiKey, coords);
    } catch (err) {
      const is429 = err instanceof Error && (err as NodeJS.ErrnoException).code === '429';
      if (!is429 || attempt === 2) throw err;
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
  throw new Error('unreachable');
}

// ── Main ───────────────────────────────────────────────────────────

if (!process.env['VITEST']) await (async () => {
  const args = process.argv.slice(2);
  const DRY_RUN = args.includes('--dry-run');
  const COORD_RESTORE = args.includes('--coord-restore');

  loadEnv();

  const apiKey = process.env['KAKAO_REST_API_KEY'];
  if (!apiKey) throw new Error('KAKAO_REST_API_KEY is not set');

  const pool = DRY_RUN ? null : new Pool({ connectionString: process.env['DATABASE_URL'] });

  const limitClause = DRY_RUN ? 'LIMIT 10' : '';
  const queryText = `
    SELECT id, name, lat, lng, review_excluded
    FROM curation_candidates
    WHERE sourced_from = 'visitjeju'
    ORDER BY id
    ${limitClause}
  `;

  const client = pool ?? new Pool({ connectionString: process.env['DATABASE_URL'] });
  const { rows } = await client.query<CandidateRow>(queryText);

  let total = 0;
  let matchCount = 0;
  let noMatchCount = 0;
  let errorCount = 0;
  let reviewExcludedCount = 0;
  let coordRestoreCandidateCount = 0;

  for (const row of rows) {
    total++;

    if (row.review_excluded) reviewExcludedCount++;

    await new Promise(r => setTimeout(r, 100));

    let docs: KakaoDoc[];
    try {
      const coords =
        !row.review_excluded && row.lat !== null && row.lng !== null
          ? { lat: row.lat, lng: row.lng }
          : undefined;
      docs = await fetchWithRetry(row.name, apiKey, coords);
    } catch (err) {
      errorCount++;
      console.error(`ERROR [${row.id}] ${row.name}:`, err instanceof Error ? err.message : err);
      const errorRate = errorCount / total;
      if (errorRate > 0.05 && total >= 20) {
        console.error(`Error rate ${(errorRate * 100).toFixed(1)}% > 5% — aborting`);
        break;
      }
      continue;
    }

    const result = matchKakaoResult(docs, row.lat, row.lng, row.review_excluded);

    if (result.coordRestoreCandidate) coordRestoreCandidateCount++;

    if (DRY_RUN) {
      const status = result.matched ? 'MATCH' : 'NO_MATCH';
      const extra = result.coordRestoreCandidate ? ' [coord_restore_candidate]' : '';
      console.log(`[${row.id}] ${row.name} → ${status}${extra}`);
      if (result.matched) matchCount++; else noMatchCount++;
      continue;
    }

    if (!result.matched) {
      noMatchCount++;
      continue;
    }

    matchCount++;

    const kakaoJson: Record<string, unknown> = {
      place_id: result.placeId,
      place_url: result.placeUrl,
    };
    if (result.unverified) {
      kakaoJson['unverified'] = true;
      kakaoJson['kakao_lat'] = result.kakaoLat;
      kakaoJson['kakao_lng'] = result.kakaoLng;
    }

    if (COORD_RESTORE && result.coordRestoreCandidate) {
      await client.query(
        `UPDATE curation_candidates
         SET external_links = external_links || jsonb_build_object('kakao', $1::jsonb),
             lat = $2, lng = $3, review_excluded = false
         WHERE id = $4`,
        [JSON.stringify(kakaoJson), result.kakaoLat, result.kakaoLng, row.id],
      );
    } else {
      await client.query(
        `UPDATE curation_candidates
         SET external_links = external_links || jsonb_build_object('kakao', $1::jsonb)
         WHERE id = $2`,
        [JSON.stringify(kakaoJson), row.id],
      );
    }
  }

  if (!DRY_RUN && pool) await pool.end();
  else if (DRY_RUN) await client.end();

  console.log('\n=== T1 Kakao 통계 ===');
  console.log(`  총 처리: ${total}건`);
  console.log(`  MATCH: ${matchCount}건 (${total ? ((matchCount / total) * 100).toFixed(1) : 0}%)`);
  console.log(`  NO_MATCH: ${noMatchCount}건`);
  console.log(`  ERROR: ${errorCount}건`);
  console.log(`  review_excluded 처리: ${reviewExcludedCount}건`);
  console.log(`  coord_restore_candidate: ${coordRestoreCandidateCount}건`);
})();
