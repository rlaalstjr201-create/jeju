/**
 * 이번 주 서울 글 모으기 (ADR-0118, specs/seoul-weekly.md 「후보 추출」 1). 고정 검색어 표(review/seoul-weekly/queries-NN.json)를
 * 네이버 블로그·뉴스에 한 번씩(최신순 display건) 묻는다. 한 번만 돈다: naver-NN.json이 있으면 멈춘다.
 *
 *   node scripts/seoul-weekly/collect.mjs [NN]   → review/seoul-weekly/naver-NN.json(받은 그대로, 글자만) + raw-NN.json(거른 것)
 *
 * 거르기: 글 날짜가 수집일 windowDays일 전부터 수집일까지, 같은 링크·같은 제목(공백·기호 뺀 것)은 하나. 키는 저장소 루트 .env의
 * NAVER_CLIENT_ID·NAVER_CLIENT_SECRET이고 출력·파일 어디에도 남기지 않는다.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../famous-measure.mjs';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../review/seoul-weekly');
const round = process.argv.find((a) => /^\d\d$/.test(a)) ?? '01';
const Q = JSON.parse(readFileSync(resolve(dir, `queries-${round}.json`), 'utf8'));
const out = resolve(dir, `naver-${round}.json`);
export const strip = (s) =>
  String(s ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
/** 블로그 postdate 20261105, 뉴스 pubDate RFC 822(+0900) → YYYY-MM-DD (KST) */
export function dayOf(i) {
  if (/^\d{8}$/.test(i.postdate ?? '')) return `${i.postdate.slice(0, 4)}-${i.postdate.slice(4, 6)}-${i.postdate.slice(6, 8)}`;
  const t = Date.parse(i.pubDate ?? '');
  return Number.isNaN(t) ? '' : new Date(t + 9 * 3600_000).toISOString().slice(0, 10);
}
const norm = (s) => s.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

if (!existsSync(out)) {
  const id = env('NAVER_CLIENT_ID');
  const secret = env('NAVER_CLIENT_SECRET');
  if (!id || !secret) throw new Error('NAVER_CLIENT_* missing in the repo-root .env');
  const got = [];
  let calls = 0;
  for (const q of Q.queries) {
    for (const src of ['blog', 'news']) {
      let body = null;
      for (let t = 0; t < 3 && !body; t++) {
        const res = await fetch(`https://openapi.naver.com/v1/search/${src}.json?${new URLSearchParams({ query: q, display: String(Q.display), sort: 'date' })}`, { headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret } }).catch(() => null);
        calls++;
        if (res?.status === 200) body = await res.json();
        else {
          await res?.body?.cancel();
          await new Promise((s) => setTimeout(s, 1500));
        }
      }
      if (!body) throw new Error(`naver ${src} failed: ${q}`);
      for (const i of body.items) got.push({ q, src, title: strip(i.title), desc: strip(i.description), day: dayOf(i), link: i.originallink || i.link, by: strip(i.bloggername ?? '') });
      await new Promise((s) => setTimeout(s, 150));
    }
  }
  writeFileSync(out, JSON.stringify({ day: Q.day, calls, items: got }, null, 1) + '\n');
  console.log(JSON.stringify({ calls, items: got.length }));
}

const all = JSON.parse(readFileSync(out, 'utf8')).items;
const from = new Date(Date.parse(`${Q.day}T00:00:00Z`) - Q.windowDays * 864e5).toISOString().slice(0, 10);
const links = new Set();
const titles = new Set();
const kept = [];
for (const i of all) {
  if (!i.day || i.day < from || i.day > Q.day) continue;
  const t = norm(i.title);
  if (links.has(i.link) || titles.has(t)) continue;
  links.add(i.link);
  titles.add(t);
  kept.push(i);
}
const raw = kept.map((i, n) => ({ n: n + 1, ...i }));
writeFileSync(resolve(dir, `raw-${round}.json`), JSON.stringify({ day: Q.day, from, items: raw }, null, 1) + '\n');
console.log(JSON.stringify({ received: all.length, kept: raw.length, from }));
