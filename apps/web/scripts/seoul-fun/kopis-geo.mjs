/**
 * KOPIS 대중음악 공연장의 좌표 (criteria-07.md 1절). 공연 3회 이상, 카카오 키워드 「서울 <이름>」 첫 쪽 한 번.
 *   node scripts/seoul-fun/kopis-geo.mjs   → review/seoul-fun/kopis-live-geo-01.json (있으면 멈춘다)
 * 호출은 kakao-calls.log에 합산(하루 3,000). 키는 .env의 KAKAO_REST_API_KEY, 어디에도 남기지 않는다.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kstDay } from '../busan/collect.mjs';
import { env } from '../famous-measure.mjs';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../review/seoul-fun');
const out = resolve(dir, 'kopis-live-geo-01.json');
if (existsSync(out)) throw new Error('kopis-live-geo-01.json exists (one run only)');
const key = env('KAKAO_REST_API_KEY');
if (!key) throw new Error('KAKAO_REST_API_KEY missing');
const norm = (s) => String(s).replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/\s+/g, '').toLowerCase();
export const clean = (s) => String(s).replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
const venues = JSON.parse(readFileSync(resolve(dir, 'kopis-live-01.json'), 'utf8')).venues.filter((v) => v.shows >= 3);
const places = [];
const missed = [];
for (const v of venues) {
  const q = new URLSearchParams({ query: `서울 ${clean(v.name)}`, size: '15', page: '1' });
  const res = await fetch(`https://dapi.kakao.com/v2/local/search/keyword?${q}`, { headers: { Authorization: `KakaoAK ${key}` } });
  appendFileSync(resolve(dir, 'kakao-calls.log'), `${kstDay(new Date())}\t${new Date().toISOString()}\tkopis:${v.name}\t${res.status}\n`);
  const docs = res.status === 200 ? (await res.json()).documents : [];
  const a = norm(clean(v.name));
  const d = docs.find((x) => String(x.road_address_name || x.address_name).startsWith('서울') && (norm(x.place_name).includes(a) || a.includes(norm(x.place_name))));
  if (d) places.push({ id: d.id, name: d.place_name, category: d.category_name, address: d.road_address_name || d.address_name, lat: Number(d.y), lng: Number(d.x), url: d.place_url, shows: v.shows, kopisName: v.name });
  else missed.push(v.name);
  await new Promise((s) => setTimeout(s, 120));
}
writeFileSync(out, JSON.stringify({ asked: venues.length, found: places.length, missed, places }, null, 1) + '\n');
console.log(JSON.stringify({ asked: venues.length, found: places.length, missed: missed.length }));
