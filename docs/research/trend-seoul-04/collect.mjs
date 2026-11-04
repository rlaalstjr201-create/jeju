// 트렌드 04 (00-preregistration.md): H1 넓게 받기(네이버 블로그·뉴스 10쪽), H2 자동 후보 목록. 한 번만 돌린다.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const env = (k) => {
  for (const line of readFileSync(resolve(here, '../../../.env'), 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0 && line.slice(0, i).trim() === k) return line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '';
};
const QUERIES = {
  성수: ['성수 팝업', '성수동 팝업', '성수 팝업스토어', '연무장길 팝업'],
  홍대: ['홍대 팝업', '홍대 팝업스토어', '연남동 팝업', '합정 팝업'],
  이태원: ['이태원 팝업', '한남동 팝업', '한남 팝업스토어', '용산 팝업'],
};
const SINCE = '20261008';
const CAND_SINCE = '20261015';
const id = env('NAVER_CLIENT_ID');
const secret = env('NAVER_CLIENT_SECRET');
const calls = { blog: 0, news: 0 };
const errors = [];
const strip = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');

const posts = new Map(); // link → post
async function pull(kind, area, query) {
  for (let start = 1; start <= 901; start += 100) {
    if (calls[kind] >= 120) return;
    calls[kind]++;
    try {
      const q = new URLSearchParams({ query, display: '100', start: String(start), sort: 'date' });
      const body = await (await fetch(`https://openapi.naver.com/v1/search/${kind}.json?${q}`, { headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret } })).json();
      if (body.errorMessage) throw new Error(body.errorMessage);
      const items = body.items ?? [];
      let older = 0;
      for (const i of items) {
        const date = kind === 'blog' ? String(i.postdate) : ymd(new Date(new Date(i.pubDate).getTime() + 9 * 3600e3));
        if (date < SINCE) {
          older++;
          continue;
        }
        const link = kind === 'blog' ? i.link : i.originallink || i.link;
        const p = posts.get(link) ?? { kind, link, date, title: strip(i.title), desc: strip(i.description), areas: [], queries: [] };
        if (!p.areas.includes(area)) p.areas.push(area);
        if (!p.queries.includes(query)) p.queries.push(query);
        posts.set(link, p);
      }
      // 최신순이라 이 쪽이 다 기간 밖이면 더 받을 것이 없다
      if (items.length < 100 || older === items.length) return;
    } catch (e) {
      errors.push(`${kind} ${query} start=${start}: ${e.message}`);
      return;
    }
  }
}
for (const [area, qs] of Object.entries(QUERIES)) for (const q of qs) for (const kind of ['blog', 'news']) await pull(kind, area, q);

// H2: 이름 후보 (01과 같은 규칙) — 글·영상마다 한 번만 세고, 10-15 이후 2건 이상
const yt = JSON.parse(readFileSync(resolve(here, '../trend-seoul-03/02-sources.json'), 'utf8')).s6.map((v) => ({
  kind: 'youtube',
  link: v.link,
  date: v.published.slice(0, 10).replace(/-/g, ''),
  title: v.title,
  desc: v.description ?? '',
  areas: v.areas,
}));
const NAME = /((?:[^\s,.!?'"()[\]「」#|/~·:]+\s){0,2}[^\s,.!?'"()[\]「」#|/~·:]+)\s*팝업(?:\s*스토어)?/g;
const STOP = new Set(['성수', '성수동', '홍대', '연남', '연남동', '합정', '이태원', '한남', '한남동', '용산', '서울', '연무장길', '서울숲', '요즘', '이번', '오늘', '주말', '신규', '인기', '무료', '추천', '최근', '다양한', '이색', '현재', '오픈', '진행', '첫', '팝업', '기간', '일', '월']);
const norm = (s) => s.replace(/[\s\-_'"`’‘·.:]/g, '').toLowerCase();
const cands = new Map();
for (const doc of [...posts.values(), ...yt]) {
  if (doc.date < CAND_SINCE) continue;
  const seen = new Set();
  for (const m of `${doc.title} ${doc.desc}`.matchAll(NAME)) {
    // 지명·일반어로만 된 꼬리는 버리고, 마지막 어절(가장 이름에 가까운 것)부터 다시 붙인다
    const words = m[1].split(/\s+/).filter((w) => !STOP.has(w));
    if (!words.length) continue;
    const name = words.join(' ');
    const k = norm(name);
    if (k.length < 2 || seen.has(k)) continue;
    seen.add(k);
    const c = cands.get(k) ?? { key: k, names: new Map(), docs: 0, areas: {}, kinds: {}, first: doc.date, last: doc.date, examples: [] };
    c.names.set(name, (c.names.get(name) ?? 0) + 1);
    c.docs++;
    for (const a of doc.areas) c.areas[a] = (c.areas[a] ?? 0) + 1;
    c.kinds[doc.kind] = (c.kinds[doc.kind] ?? 0) + 1;
    if (doc.date < c.first) c.first = doc.date;
    if (doc.date > c.last) c.last = doc.date;
    if (c.examples.length < 3) c.examples.push({ title: doc.title.slice(0, 80), link: doc.link, date: doc.date });
    cands.set(k, c);
  }
}
const list = [...cands.values()]
  .filter((c) => c.docs >= 2)
  .map((c) => ({ name: [...c.names.entries()].sort((a, b) => b[1] - a[1])[0][0], docs: c.docs, area: Object.entries(c.areas).sort((a, b) => b[1] - a[1])[0][0], areas: c.areas, kinds: c.kinds, first: c.first, last: c.last, examples: c.examples }))
  .sort((a, b) => b.docs - a.docs);

const perQuery = {};
for (const p of posts.values()) for (const q of p.queries) {
  const k = `${p.kind}:${q}`;
  perQuery[k] = perQuery[k] ?? { n: 0, oldest: p.date, newest: p.date };
  perQuery[k].n++;
  if (p.date < perQuery[k].oldest) perQuery[k].oldest = p.date;
  if (p.date > perQuery[k].newest) perQuery[k].newest = p.date;
}
writeFileSync(resolve(here, '02-posts.json'), `${JSON.stringify({ startedAt: new Date().toISOString(), since: SINCE, perQuery, calls, errors, posts: [...posts.values()] }, null, 1)}\n`);
writeFileSync(resolve(here, '02-candidates.json'), `${JSON.stringify({ rule: '10-15 이후 서로 다른 글·영상 2건 이상', count: list.length, candidates: list }, null, 1)}\n`);
console.log(JSON.stringify({ posts: posts.size, candidates: list.length, calls, errors: errors.length, perQuery }, null, 1));
