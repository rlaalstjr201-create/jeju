/**
 * official_awards.spot_address → 카카오 주소검색 API → spot_lat/spot_lng 업데이트
 *
 * 실행: npx tsx src/scripts/geocode-awards.ts [--dry-run] [--source=bluerribbon]
 *
 * 동작:
 *   1. official_awards WHERE spot_lat IS NULL 행 조회
 *   2. 카카오 /v2/local/search/address 호출
 *   3. spot_lat/spot_lng 업데이트 (실패 시 -1 마커로 스킵 표시)
 *   4. 제주 bbox 외 결과 경고
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
  } catch { /* .env 없음 */ }
}

const JEJU_BBOX = { latMin: 33.0, latMax: 34.0, lngMin: 126.0, lngMax: 127.0 };

function inJeju(lat: number, lng: number): boolean {
  return lat >= JEJU_BBOX.latMin && lat <= JEJU_BBOX.latMax &&
         lng >= JEJU_BBOX.lngMin && lng <= JEJU_BBOX.lngMax;
}

interface KakaoAddressDoc {
  address_name: string;
  address:      { x: string; y: string } | null;
  road_address: { x: string; y: string } | null;
}

interface KakaoAddressResponse {
  documents: KakaoAddressDoc[];
}

async function geocodeAddress(
  address: string,
  restApiKey: string,
): Promise<{ lat: number; lng: number } | null> {
  if (!address) return null;
  const url = new URL('https://dapi.kakao.com/v2/local/search/address.json');
  url.searchParams.set('query', address);
  url.searchParams.set('size', '1');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `KakaoAK ${restApiKey}` },
  });
  if (!res.ok) return null;

  const data = await res.json() as KakaoAddressResponse;
  const doc  = data.documents?.[0];
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
  const isDryRun   = process.argv.includes('--dry-run');
  const sourceArg  = process.argv.find(a => a.startsWith('--source='));
  const source     = sourceArg ? sourceArg.split('=')[1]! : 'bluerribbon';

  const KAKAO_KEY = process.env['KAKAO_REST_API_KEY'];
  if (!KAKAO_KEY) {
    console.error('[geocode-awards] KAKAO_REST_API_KEY 환경변수 필요');
    process.exit(1);
  }

  const db = new Pool({ connectionString: process.env['DATABASE_URL'] });

  // spot_lat IS NULL인 고유 주소만 처리 (같은 주소 중복 호출 방지)
  const { rows } = await db.query<{ id: number; spot_address: string; spot_name: string }>(
    `SELECT DISTINCT ON (spot_address)
       id, spot_address, spot_name
     FROM official_awards
     WHERE source = $1
       AND spot_lat IS NULL
       AND spot_address IS NOT NULL
     ORDER BY spot_address, id`,
    [source],
  );

  console.log(`[geocode-awards] 변환 대상: ${rows.length}건 (dry-run: ${isDryRun})`);

  let success = 0, fail = 0, outOfJeju = 0;
  const failLog: string[] = [];

  const DELAY_MS = 100;

  for (let i = 0; i < rows.length; i++) {
    const row    = rows[i]!;
    const coords = await geocodeAddress(row.spot_address, KAKAO_KEY);

    if (!coords) {
      fail++;
      failLog.push(`  FAIL [${row.spot_name}] ${row.spot_address}`);

      if (!isDryRun) {
        // spot_lat=-1 마커로 재시도 방지
        await db.query(
          `UPDATE official_awards SET spot_lat = -1 WHERE source = $1 AND spot_address = $2`,
          [source, row.spot_address],
        );
      }
    } else {
      success++;
      if (!isDryRun) {
        await db.query(
          `UPDATE official_awards
           SET spot_lat = $1, spot_lng = $2
           WHERE source = $3 AND spot_address = $4`,
          [coords.lat, coords.lng, source, row.spot_address],
        );
      }
    }

    if ((i + 1) % 100 === 0 || i === rows.length - 1) {
      console.log(`  진행 ${i + 1}/${rows.length} — 성공 ${success}, 실패 ${fail}`);
    }

    if (i < rows.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  await db.end();

  console.log(`\n[geocode-awards] 완료`);
  console.log(`  성공: ${success}건 (${((success / rows.length) * 100).toFixed(1)}%)`);
  console.log(`  실패: ${fail}건`);
  if (outOfJeju > 0) console.log(`  제주 외: ${outOfJeju}건`);
  if (failLog.length > 0) {
    console.log(`\n  실패 목록:`);
    failLog.slice(0, 30).forEach(l => console.log(l));
    if (failLog.length > 30) console.log(`  ... 외 ${failLog.length - 30}건`);
  }
  if (isDryRun) console.log('  (dry-run: DB 쓰기 없음)');
}

main().catch(err => { console.error(err); process.exit(1); });
