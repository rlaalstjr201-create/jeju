// 서울 즐길 거리 G7 (ADR-0115 Amendment 1): 최근 6개월 KOPIS 서울 대중음악 공연을 연 공연장. 목록만 묻는다(공연장 이름·공연 수).
//   npx tsx scripts/seoul-fun/kopis-live.ts   → review/seoul-fun/kopis-live-01.json (있으면 멈춘다: 한 번만)
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { xmlRecords, xmlTag } from '../../functions/_lib/kopis';
import { kopisGet, kopisKey } from '../kopis/kopis-venues';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../review/seoul-fun/kopis-live-01.json');
if (existsSync(out)) throw new Error('kopis-live-01.json exists (one run only)');
const key = kopisKey();
const ymd = (d: Date) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
const to = new Date();
const from = new Date(to.getTime() - 183 * 86_400_000);
const venues = new Map<string, { shows: number; titles: string[] }>();
let pages = 0;
for (let page = 1; page <= 40; page++) {
  const xml = await kopisGet(key, 'pblprfr', `&stdate=${ymd(from)}&eddate=${ymd(to)}&cpage=${page}&rows=100&signgucode=11&shcate=CCCD`);
  pages++;
  const recs = xmlRecords(xml);
  for (const r of recs) {
    const name = xmlTag(r, 'fcltynm').trim();
    if (!name) continue;
    const v = venues.get(name) ?? { shows: 0, titles: [] };
    v.shows++;
    if (v.titles.length < 5) v.titles.push(xmlTag(r, 'prfnm'));
    venues.set(name, v);
  }
  if (recs.length < 100) break;
}
const list = [...venues].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.shows - a.shows);
writeFileSync(out, JSON.stringify({ from: ymd(from), to: ymd(to), genre: '대중음악(CCCD)', pages, venues: list }, null, 1) + '\n');
console.log(JSON.stringify({ pages, venues: list.length, top: list.slice(0, 15).map((v) => `${v.name} ${v.shows}`) }));
