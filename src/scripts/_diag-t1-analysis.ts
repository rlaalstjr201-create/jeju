#!/usr/bin/env tsx
// T1 매칭 실패 원인 분석 — 4개 실험
// 실험1: NO_MATCH 20건 raw 검색 결과 dump
// 실험2: 자연 관광지 5개 raw 확인
// 실험3: radius 1km 재시도 (sightseeing+experience 100건)
// 실험4: 괄호 별칭 제거 후 재검색 (50건)

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { haversineMeters } from './seed-visitjeju-v2.js';

interface KakaoDoc {
  id: string;
  place_name: string;
  category_name: string;
  category_group_code: string;
  category_group_name: string;
  address_name: string;
  road_address_name: string;
  x: string;
  y: string;
}

interface KakaoResponse {
  documents: KakaoDoc[];
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

async function kakaoSearch(
  name: string,
  apiKey: string,
  opts: { lat?: number; lng?: number; radius?: number; size?: number } = {},
): Promise<KakaoDoc[]> {
  const url = new URL('https://dapi.kakao.com/v2/local/search/keyword');
  url.searchParams.set('query', name);
  url.searchParams.set('size', String(opts.size ?? 5));
  if (opts.lat != null && opts.lng != null) {
    url.searchParams.set('x', String(opts.lng));
    url.searchParams.set('y', String(opts.lat));
    if (opts.radius != null) url.searchParams.set('radius', String(opts.radius));
  }
  const res = await fetch(url.toString(), { headers: { Authorization: `KakaoAK ${apiKey}` } });
  if (!res.ok) throw new Error(`Kakao ${res.status}`);
  const data = (await res.json()) as KakaoResponse;
  return data.documents ?? [];
}

function distStr(spotLat: number | null, spotLng: number | null, doc: KakaoDoc): string {
  if (spotLat == null || spotLng == null) return 'spot좌표없음';
  const m = haversineMeters(spotLat, spotLng, parseFloat(doc.y), parseFloat(doc.x));
  return m < 1000 ? `${m.toFixed(0)}m` : `${(m / 1000).toFixed(2)}km`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

loadEnv();
const apiKey = process.env['KAKAO_REST_API_KEY'];
if (!apiKey) throw new Error('KAKAO_REST_API_KEY not set');
const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

// ════════════════════════════════════════════════════════════════════
// 실험 1: NO_MATCH 20건 raw 검색 결과
// ════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log('실험 1: NO_MATCH 20건 — raw Kakao 결과 (display=5)');
console.log('═'.repeat(60));

{
  const { rows } = await pool.query<{ id: number; name: string; lat: number | null; lng: number | null; category: string }>(`
    SELECT id, name, lat, lng, category
    FROM curation_candidates
    WHERE sourced_from = 'visitjeju'
      AND NOT (external_links ? 'kakao')
    ORDER BY RANDOM()
    LIMIT 20
  `);

  for (const row of rows) {
    const docs = await kakaoSearch(row.name, apiKey);
    const coordInfo = row.lat != null ? `lat=${row.lat.toFixed(4)} lng=${row.lng?.toFixed(4)}` : 'null좌표';
    console.log(`\n▶ ${row.name} [${row.category}] ${coordInfo}`);
    if (docs.length === 0) {
      console.log('  → 카카오 결과 없음 (0건)');
    } else {
      for (let i = 0; i < docs.length; i++) {
        const d = docs[i]!;
        const dist = distStr(row.lat, row.lng, d);
        console.log(`  [${i}] "${d.place_name}" | ${d.category_group_code || '--'}(${d.category_group_name || '미분류'}) | (${d.y},${d.x}) | dist=${dist}`);
      }
    }
    await sleep(100);
  }
}

// ════════════════════════════════════════════════════════════════════
// 실험 2: 자연 관광지 5개 raw 확인
// ════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log('실험 2: 자연 관광지 5개 직접 검증');
console.log('═'.repeat(60));

{
  const targets = ['한라산', '성산일출봉', '만장굴', '우도', '비자림'];
  for (const name of targets) {
    const { rows } = await pool.query<{ lat: number | null; lng: number | null }>(
      `SELECT lat, lng FROM curation_candidates WHERE sourced_from='visitjeju' AND name=$1 LIMIT 1`,
      [name],
    );
    const spotLat = rows[0]?.lat ?? null;
    const spotLng = rows[0]?.lng ?? null;
    const coordInfo = spotLat != null ? `visitjeju:(${spotLat.toFixed(4)},${spotLng?.toFixed(4)})` : 'visitjeju:null좌표';

    const docs = await kakaoSearch(name, apiKey);
    console.log(`\n▶ ${name} — ${coordInfo}`);
    if (docs.length === 0) {
      console.log('  → 카카오 결과 없음');
    } else {
      for (let i = 0; i < docs.length; i++) {
        const d = docs[i]!;
        const dist = distStr(spotLat, spotLng, d);
        console.log(`  [${i}] "${d.place_name}" | ${d.category_group_code || '--'}(${d.category_group_name || '미분류'}) | kakao:(${d.y},${d.x}) | dist=${dist}`);
      }
    }
    await sleep(100);
  }
}

// ════════════════════════════════════════════════════════════════════
// 실험 3: radius 1km 재시도 — sightseeing+experience 100건
// ════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log('실험 3: radius 1km 재시도 (sightseeing+experience NO_MATCH 100건)');
console.log('═'.repeat(60));

{
  const { rows } = await pool.query<{ id: number; name: string; lat: number; lng: number }>(`
    SELECT id, name, lat, lng
    FROM curation_candidates
    WHERE sourced_from = 'visitjeju'
      AND NOT (external_links ? 'kakao')
      AND category IN ('sightseeing', 'experience')
      AND lat IS NOT NULL
      AND lng IS NOT NULL
    ORDER BY RANDOM()
    LIMIT 100
  `);

  let matched300_500 = 0;
  let matched500_1000 = 0;
  let noMatch = 0;
  const JEJU_BBOX = { latMin: 33.0, latMax: 34.0, lngMin: 126.0, lngMax: 127.0 };

  for (const row of rows) {
    const docs = await kakaoSearch(row.name, apiKey, { lat: row.lat, lng: row.lng, radius: 1000, size: 1 });
    if (docs.length === 0) { noMatch++; await sleep(100); continue; }
    const d = docs[0]!;
    const kLat = parseFloat(d.y); const kLng = parseFloat(d.x);
    if (kLat < JEJU_BBOX.latMin || kLat > JEJU_BBOX.latMax || kLng < JEJU_BBOX.lngMin || kLng > JEJU_BBOX.lngMax) {
      noMatch++; await sleep(100); continue;
    }
    const dist = haversineMeters(row.lat, row.lng, kLat, kLng);
    if (dist <= 500) matched300_500++;
    else matched500_1000++;
    await sleep(100);
  }

  const total = rows.length;
  const matched = matched300_500 + matched500_1000;
  console.log(`\n처리: ${total}건`);
  console.log(`매칭 (300~500m): ${matched300_500}건`);
  console.log(`매칭 (500~1000m): ${matched500_1000}건`);
  console.log(`추가 매칭 합계: ${matched}건 / ${total}건 = ${(matched / total * 100).toFixed(1)}%`);
  console.log(`NO_MATCH (1km 초과 or 결과없음): ${noMatch}건`);
  if (matched > 0) {
    console.log(`\n→ radius 1km로 확장 시 ${matched}/${total} 추가 확보 가능`);
    console.log(`  이 중 300~500m 구간: ${matched300_500}건 (비교적 신뢰)`);
    console.log(`  500m~1km 구간: ${matched500_1000}건 (false positive 리스크 있음)`);
  }
}

// ════════════════════════════════════════════════════════════════════
// 실험 4: 괄호 별칭 제거 후 재검색 (50건)
// ════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log('실험 4: 괄호 별칭 제거 재검색 (NO_MATCH 중 괄호 포함 50건)');
console.log('═'.repeat(60));

{
  const { rows } = await pool.query<{ id: number; name: string; lat: number | null; lng: number | null }>(`
    SELECT id, name, lat, lng
    FROM curation_candidates
    WHERE sourced_from = 'visitjeju'
      AND NOT (external_links ? 'kakao')
      AND name LIKE '%(%'
    ORDER BY RANDOM()
    LIMIT 50
  `);

  let added = 0;
  const samples: Array<{ original: string; stripped: string; kakaoName: string; dist: string }> = [];
  const JEJU_BBOX = { latMin: 33.0, latMax: 34.0, lngMin: 126.0, lngMax: 127.0 };

  for (const row of rows) {
    // 괄호 및 내용 제거: "궁대오름(궁대악)" → "궁대오름"
    const stripped = row.name.replace(/\s*\(.*?\)\s*/g, '').trim();
    if (stripped === row.name || stripped.length === 0) { await sleep(100); continue; }

    const docs = await kakaoSearch(stripped, apiKey, {
      lat: row.lat ?? undefined,
      lng: row.lng ?? undefined,
      radius: row.lat != null ? 300 : undefined,
      size: 1,
    });

    if (docs.length === 0) { await sleep(100); continue; }
    const d = docs[0]!;
    const kLat = parseFloat(d.y); const kLng = parseFloat(d.x);
    if (kLat < JEJU_BBOX.latMin || kLat > JEJU_BBOX.latMax || kLng < JEJU_BBOX.lngMin || kLng > JEJU_BBOX.lngMax) {
      await sleep(100); continue;
    }
    if (row.lat != null && haversineMeters(row.lat, row.lng!, kLat, kLng) > 300) {
      await sleep(100); continue;
    }

    added++;
    samples.push({
      original: row.name,
      stripped,
      kakaoName: d.place_name,
      dist: distStr(row.lat, row.lng, d),
    });
    await sleep(100);
  }

  console.log(`\n처리: ${rows.length}건 (괄호 포함 NO_MATCH)`);
  console.log(`추가 매칭: ${added}건 / ${rows.length}건 = ${rows.length > 0 ? (added / rows.length * 100).toFixed(1) : 0}%`);
  if (samples.length > 0) {
    console.log('\n매칭 케이스:');
    for (const s of samples) {
      console.log(`  "${s.original}" → "${s.stripped}" → Kakao:"${s.kakaoName}" dist=${s.dist}`);
    }
  }
}

// ════════════════════════════════════════════════════════════════════
// 종합
// ════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log('종합 보고 완료');
console.log('═'.repeat(60));

await pool.end();
