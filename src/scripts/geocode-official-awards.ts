/**
 * official_awards 주소 → 좌표 변환 (카카오 주소검색 API)
 *
 * 실행: npx tsx src/scripts/geocode-official-awards.ts [--dry-run] [--source=bluerribbon]
 *
 * 동작:
 *   1. official_awards WHERE geocoded_at IS NULL 행 조회
 *   2. 카카오 /v2/local/search/address 호출
 *   3. lat/lng 업데이트 후 geocoded_at 기록 (1회성 캐시)
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..', '..');

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

interface KakaoAddressDoc {
  address_name: string;
  address: { x: string; y: string } | null;
  road_address: { x: string; y: string } | null;
}

interface KakaoAddressResponse {
  documents: KakaoAddressDoc[];
}

// 제주도 bounding box 검증
const JEJU_BBOX = { latMin: 33.0, latMax: 34.0, lngMin: 126.0, lngMax: 127.0 };

function inJeju(lat: number, lng: number): boolean {
  return lat >= JEJU_BBOX.latMin && lat <= JEJU_BBOX.latMax &&
         lng >= JEJU_BBOX.lngMin && lng <= JEJU_BBOX.lngMax;
}

async function geocodeAddress(address: string, restApiKey: string): Promise<{ lat: number; lng: number } | null> {
  if (!address) return null;
  const url = new URL('https://dapi.kakao.com/v2/local/search/address.json');
  url.searchParams.set('query', address);
  url.searchParams.set('size', '1');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `KakaoAK ${restApiKey}` },
  });

  if (!res.ok) return null;

  const data = await res.json() as KakaoAddressResponse;
  const doc = data.documents?.[0];
  if (!doc) return null;

  const coords = doc.road_address ?? doc.address;
  if (!coords) return null;

  const lat = parseFloat(coords.y);
  const lng = parseFloat(coords.x);

  if (!inJeju(lat, lng)) return null;
  return { lat, lng };
}

async function main() {
  loadEnv();

  const isDryRun = process.argv.includes('--dry-run');
  const sourceArg = process.argv.find(a => a.startsWith('--source='));
  const source = sourceArg ? sourceArg.split('=')[1] : null;

  const KAKAO_KEY = process.env['KAKAO_REST_API_KEY'];
  if (!KAKAO_KEY) {
    console.error('[geocode] KAKAO_REST_API_KEY 환경변수 필요');
    process.exit(1);
  }

  const db = new Pool({ connectionString: process.env['DATABASE_URL'] });

  const whereSource = source ? `AND source = $1` : '';
  const params = source ? [source] : [];

  const { rows } = await db.query<{ id: number; spot_address: string }>(
    `SELECT id, spot_address FROM official_awards
     WHERE geocoded_at IS NULL AND spot_address IS NOT NULL ${whereSource}
     ORDER BY id`,
    params,
  );

  console.log(`[geocode] 변환 대상: ${rows.length}건 (dry-run: ${isDryRun})`);

  let success = 0, fail = 0, outOfJeju = 0;

  const DELAY_MS = 100; // 카카오 QPS 준수

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const coords = await geocodeAddress(row.spot_address, KAKAO_KEY);

    if (!coords) {
      fail++;
      if ((fail + success) % 50 === 0) {
        console.log(`  진행: ${i + 1}/${rows.length} (성공 ${success}, 실패 ${fail})`);
      }
      if (!isDryRun) {
        await db.query(
          `UPDATE official_awards SET geocoded_at = NOW() WHERE id = $1`,
          [row.id],
        );
      }
    } else {
      success++;
      if (!isDryRun) {
        await db.query(
          `UPDATE official_awards SET lat = $1, lng = $2, geocoded_at = NOW() WHERE id = $3`,
          [coords.lat, coords.lng, row.id],
        );
      }
    }

    if (i < rows.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  await db.end();

  console.log(`[geocode] 완료`);
  console.log(`  성공: ${success}건 (${((success / rows.length) * 100).toFixed(1)}%)`);
  console.log(`  실패: ${fail}건`);
  console.log(`  제주 외: ${outOfJeju}건`);
  if (isDryRun) console.log('  (dry-run: DB 쓰기 없음)');
}

main().catch(err => { console.error(err); process.exit(1); });
