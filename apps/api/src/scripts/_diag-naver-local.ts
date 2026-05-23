#!/usr/bin/env tsx
// T1.5 사전 검증: 네이버 지역검색 API raw 확인 + 좌표 변환 검증

import { readFileSync } from 'node:fs';
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

// ── 좌표 변환 함수 (검증 대상) ─────────────────────────────────────

/** Naver mapx/mapy (integer, × 1e7 encoded) → WGS84 */
export function naverCoordToWgs84(mapCoord: number): number {
  return mapCoord / 1e7;
}

/** 제주 bbox 체크 (seed-visitjeju-v2 기준) */
export function isJejuBboxWgs84(lat: number, lng: number): boolean {
  return lat >= 33.0 && lat <= 34.0 && lng >= 126.0 && lng <= 127.0;
}

// ── Naver API 호출 ─────────────────────────────────────────────────

interface NaverLocalItem {
  title: string;
  link: string;
  category: string;
  description: string;
  telephone: string;
  address: string;
  roadAddress: string;
  mapx: number;
  mapy: number;
}

interface NaverLocalResponse {
  lastBuildDate: string;
  total: number;
  start: number;
  display: number;
  items: NaverLocalItem[];
}

async function searchNaverLocal(query: string, clientId: string, clientSecret: string): Promise<NaverLocalResponse> {
  const url = new URL('https://openapi.naver.com/v1/search/local.json');
  url.searchParams.set('query', query);
  url.searchParams.set('display', '3');
  const res = await fetch(url.toString(), {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
  });
  if (!res.ok) throw new Error(`Naver Local API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<NaverLocalResponse>;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

// ── 사전 검증 1: raw API 응답 dump ────────────────────────────────

loadEnv();
const clientId = process.env['NAVER_CLIENT_ID']!;
const clientSecret = process.env['NAVER_CLIENT_SECRET']!;
if (!clientId || !clientSecret) throw new Error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET not set');

const TARGETS = ['한라산', '성산일출봉', '만장굴'];
// 참고용: 카카오 결과에서 확인된 실제 WGS84 좌표
const EXPECTED: Record<string, { lat: number; lng: number }> = {
  '한라산':    { lat: 33.3614, lng: 126.5294 },
  '성산일출봉': { lat: 33.4591, lng: 126.9405 },
  '만장굴':    { lat: 33.5284, lng: 126.7716 },
};

console.log('═'.repeat(60));
console.log('사전 검증 1: 네이버 지역검색 raw 응답');
console.log('═'.repeat(60));

for (const name of TARGETS) {
  const expected = EXPECTED[name]!;
  console.log(`\n▶ 검색어: "${name} 제주"`);
  console.log(`  기대 좌표(카카오 기준): lat=${expected.lat}, lng=${expected.lng}`);

  const data = await searchNaverLocal(`${name} 제주`, clientId, clientSecret);
  console.log(`  total=${data.total}, display=${data.display}`);

  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i]!;
    const titleRaw = item.title;
    const titleClean = stripHtml(item.title);
    const lat = naverCoordToWgs84(item.mapy);
    const lng = naverCoordToWgs84(item.mapx);
    const inBbox = isJejuBboxWgs84(lat, lng);

    console.log(`\n  [${i}] title_raw="${titleRaw}"`);
    console.log(`       title_clean="${titleClean}"`);
    console.log(`       mapx(raw)=${item.mapx}  mapy(raw)=${item.mapy}`);
    console.log(`       → WGS84 lat=${lat.toFixed(6)}, lng=${lng.toFixed(6)}  bbox=${inBbox ? '✅' : '❌'}`);
    console.log(`       address="${item.address}"`);
    console.log(`       roadAddress="${item.roadAddress}"`);
    console.log(`       category="${item.category}"`);
  }

  await new Promise(r => setTimeout(r, 200));
}

// ── 사전 검증 2: 좌표 변환 단위 검증 ─────────────────────────────

console.log('\n' + '═'.repeat(60));
console.log('사전 검증 2: 좌표 변환 함수 검증');
console.log('═'.repeat(60));
console.log('\n변환식: WGS84 = mapCoord / 1e7\n');

let allPass = true;
for (const name of TARGETS) {
  const data = await searchNaverLocal(`${name} 제주`, clientId, clientSecret);
  const item = data.items[0];
  if (!item) { console.log(`${name}: 결과 없음 ⚠️`); continue; }

  const lat = naverCoordToWgs84(item.mapy);
  const lng = naverCoordToWgs84(item.mapx);
  const inBbox = isJejuBboxWgs84(lat, lng);
  const expected = EXPECTED[name]!;
  const latDiff = Math.abs(lat - expected.lat);
  const lngDiff = Math.abs(lng - expected.lng);

  const pass = inBbox && latDiff < 0.5 && lngDiff < 0.5;
  if (!pass) allPass = false;

  console.log(`${name}:`);
  console.log(`  변환 결과: lat=${lat.toFixed(6)}, lng=${lng.toFixed(6)}`);
  console.log(`  기대(카카오): lat=${expected.lat}, lng=${expected.lng}`);
  console.log(`  차이: Δlat=${latDiff.toFixed(4)}, Δlng=${lngDiff.toFixed(4)}`);
  console.log(`  Jeju bbox: ${inBbox ? '✅' : '❌'}  → ${pass ? '✅ PASS' : '❌ FAIL'}`);

  await new Promise(r => setTimeout(r, 200));
}

console.log('\n' + '─'.repeat(40));
console.log(`좌표 변환 검증: ${allPass ? '✅ 전체 통과 → T1.5 진입 가능' : '❌ 실패 → 변환식 보정 필요'}`);
