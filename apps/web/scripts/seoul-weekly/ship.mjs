/**
 * 이번 주 서울 싣기 (criteria-01.md 5절). 감사 게이트를 통과한 판정의 keep만 → data/seoul/weekly-seoul.json. 호출 없음.
 *   node scripts/seoul-weekly/ship.mjs [NN]
 * 날짜·시간·예약·출처 글은 판정 값, 장소 이름·좌표·카카오 링크는 카카오 값. 같은 카카오 장소의 같은 기간은 하나만.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dir = resolve(webRoot, 'review/seoul-weekly');
const round = process.argv.find((a) => /^\d\d$/.test(a)) ?? '01';
const read = (p) => JSON.parse(readFileSync(resolve(dir, p), 'utf8'));
const result = readFileSync(resolve(dir, `audit-${round}-result.md`), 'utf8');
if (!/게이트: 통과/.test(result)) throw new Error('audit gate not passed: nothing shipped');
const rows = new Map(read(`judge-input-${round}.json`).rows.map((r) => [r.cid, r]));
const judged = readdirSync(resolve(dir, 'judge'))
  .filter((f) => /^out-\d\d\.json$/.test(f))
  .sort()
  .flatMap((f) => read(`judge/${f}`));
const KINDS = ['팝업', '새로 연 곳', '전시', '마켓', '축제'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const items = [];
const seen = new Set();
for (const j of judged) {
  if (!j.keep) continue;
  const r = rows.get(j.cid);
  const k = r.kakao;
  if (!k || !KINDS.includes(j.kind) || !DATE.test(j.start) || !DATE.test(j.end) || j.start > j.end || !['none', 'onsite'].includes(j.reserve) || !/^https:\/\//.test(j.src)) throw new Error(`bad keep ${j.cid}`);
  const key = `${k.id}|${j.start}|${j.end}`;
  if (seen.has(key)) continue;
  seen.add(key);
  items.push({ id: `wk-${k.id}-${j.start.replace(/-/g, '')}`, name: r.copied.name, kind: j.kind, start: j.start, end: j.end, time: j.time, place: k.name, lat: Math.round(k.lat * 1e5) / 1e5, lng: Math.round(k.lng * 1e5) / 1e5, kakao: k.url, src: j.src, reserve: j.reserve });
}
items.sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : a.id < b.id ? -1 : 1));
const file = { note: `ADR-0118 이번 주 서울 ${round}회. scripts/seoul-weekly/ship.mjs가 짓는다.`, day: read(`judge-input-${round}.json`).day, items };
writeFileSync(resolve(webRoot, 'data/seoul/weekly-seoul.json'), JSON.stringify(file, null, 1) + '\n');
const byKind = {};
for (const i of items) byKind[i.kind] = (byKind[i.kind] ?? 0) + 1;
console.log(JSON.stringify({ shipped: items.length, byKind }));
