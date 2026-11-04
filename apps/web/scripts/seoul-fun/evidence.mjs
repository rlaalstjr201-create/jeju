/**
 * 서울 즐길 거리 판정 근거 (criteria-08.md 1절). 네이버 검색 API 블로그, 곳마다 한 번(최신순 5개: 날짜·제목만).
 *   node scripts/seoul-fun/evidence.mjs   → review/seoul-fun/evidence-01.json (있으면 멈춘다: 한 번만; 끊기면 .part에서 이어 감)
 * 키는 .env의 NAVER_CLIENT_ID·NAVER_CLIENT_SECRET이고 출력·파일 어디에도 남기지 않는다.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../famous-measure.mjs';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../review/seoul-fun');
const out = resolve(dir, 'evidence-01.json');
const part = `${out}.part`;
if (existsSync(out)) throw new Error('evidence-01.json exists (one run only)');
const id = env('NAVER_CLIENT_ID');
const secret = env('NAVER_CLIENT_SECRET');
if (!id || !secret) throw new Error('NAVER_CLIENT_* missing');
const places = JSON.parse(readFileSync(resolve(dir, 'judge-input-01.json'), 'utf8')).places;
const ev = existsSync(part) ? JSON.parse(readFileSync(part, 'utf8')) : {};
const strip = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
export const queryOf = (p) => `${p.name} ${String(p.address).split(' ')[1]?.replace(/구$/, '') ?? ''}`.trim();
let calls = 0;
for (const p of places) {
  if (ev[p.id]) continue;
  const q = queryOf(p);
  let body = null;
  for (let t = 0; t < 3 && !body; t++) {
    const res = await fetch(`https://openapi.naver.com/v1/search/blog.json?${new URLSearchParams({ query: q, display: '5', sort: 'date' })}`, { headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret } }).catch(() => null);
    calls++;
    if (res?.status === 200) body = await res.json();
    else {
      await res?.body?.cancel();
      await new Promise((s) => setTimeout(s, 1500));
    }
  }
  ev[p.id] = body ? { q, total: body.total, posts: body.items.map((i) => ({ date: i.postdate, title: strip(i.title) })) } : { q, failed: true };
  if (calls % 50 === 0) writeFileSync(part, JSON.stringify(ev));
  await new Promise((s) => setTimeout(s, 120));
}
writeFileSync(part, JSON.stringify(ev));
renameSync(part, out);
const failed = Object.values(ev).filter((e) => e.failed).length;
console.log(JSON.stringify({ places: places.length, calls, failed, none: Object.values(ev).filter((e) => e.total === 0).length }));
