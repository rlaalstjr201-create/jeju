// 트렌드 05 규칙 추출 v2 (00-preregistration.md 「규칙 v2」). 원자료는 04·03 그대로, 외부 호출 없음. 한 번만 돌린다.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(readFileSync(resolve(here, p), 'utf8'));
const posts = read('../trend-seoul-04/02-posts.json').posts;
const yt = read('../trend-seoul-03/02-sources.json').s6.map((v) => ({ kind: 'youtube', link: v.link, date: v.published.slice(0, 10).replace(/-/g, ''), title: v.title, desc: v.description ?? '', areas: v.areas, queries: v.queries }));
const CAND_SINCE = '20261015';

// 4. 지역: 본문 지명 우선, 「용산 팝업」은 지역을 정하지 않음
const PLACE = { 성수: /성수|연무장|서울숲|뚝섬/, 홍대: /홍대|연남|합정|상수|망원/, 이태원: /이태원|한남/ };
function areaOf(doc) {
  const text = `${doc.title} ${doc.desc}`;
  const hit = Object.entries(PLACE).filter(([, re]) => re.test(text)).map(([a]) => a);
  if (hit.length === 1) return hit[0];
  if (hit.length > 1) return null; // 여러 지역을 나열한 글: 정하지 않음
  const qs = (doc.queries ?? []).filter((q) => q !== '용산 팝업');
  if (!qs.length) return null;
  const a = doc.areas.filter((x) => x !== '이태원' || qs.some((q) => /이태원|한남/.test(q)));
  return a.length === 1 ? a[0] : null;
}

// 2. 잡음
const GENERIC = new Set(
  '브랜드 뷰티 패션 단독 오프라인 체험형 신규 한정 이색 인기 요즘 이번 오늘 주말 추천 최근 다양한 현재 오픈 진행 첫 팝업 기간 서울 성수 성수동 홍대 연남 연남동 합정 이태원 한남 한남동 용산 연무장길 서울숲 뚝섬 상수 망원 무료 체험 굿즈 전시 스토어 카페 캐릭터 웹툰 애니 게임 아이돌 콜라보 플래그십 행사 이벤트 소식 정보 후기 방문 리뷰 근황 총정리 정리 모음 일정 위치 예약 웨이팅 오픈런 공식 국내 최초 첫번째 대형 프리미엄 글로벌 한국 서울시 겨울 가을 연말 홀리데이 크리스마스 할로윈 핫플 데이트 가볼만한곳 놀거리 볼거리 브이로그 vlog shorts'.split(
    ' ',
  ),
);
const MODIFIER = /^(열린|열리는|진행된|진행되는|진행중인|진행 중인|마련된|선보인|선보이는|오픈한|오픈하는|문을|연|여는|개최한|개최되는|성황리|단독으로|함께하는|이어지는|.+에서|.+에선|.+으로|.+까지|.+부터)$/;
const DATE = /^(\d+|\d+월|\d+일|\d{4}년|\d+월\d+일|\d+\.\d+|\d+\/\d+|\d+주년|\d+탄|\d+차|\d+번째|\d+개)$/;
const PARTICLE = /(에서|에선|의|가|이|을|를|와|과|도|은|는|로|으로)$/;
function clean(raw) {
  let words = raw
    .replace(/[#@]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
  // 앞쪽 꾸밈말·일반어·날짜는 떼고, 마지막 어절 끝 조사는 뗀다
  while (words.length && (MODIFIER.test(words[0]) || GENERIC.has(words[0]) || DATE.test(words[0]))) words.shift();
  words = words.filter((w) => !DATE.test(w));
  if (!words.length) return null;
  const last = words.length - 1;
  if (words[last].length > 2) words[last] = words[last].replace(PARTICLE, '');
  if (words.every((w) => GENERIC.has(w) || MODIFIER.test(w))) return null;
  const name = words.join(' ');
  return name.replace(/\s+/g, '').length >= 2 ? name : null;
}

// 1. 이름 꼴
const SEP = `[^\\s,.!?'"()\\[\\]「」『』<>#|/~·:]`;
const PRE = `((?:${SEP}+\\s){0,2}${SEP}+)`;
const PATTERNS = [
  new RegExp(`${PRE}\\s*팝업(?:\\s*스토어|\\s*카페|\\s*전시)?`, 'g'),
  new RegExp(`${PRE}\\s*콜라보\\s*(?:카페|팝업|스토어)`, 'g'),
  new RegExp(`${PRE}\\s*(?:전시회|특별전|기획전)`, 'g'),
  new RegExp(`${PRE}\\s*(?:스토어|쇼룸)\\s*(?:오픈|개장)`, 'g'),
  new RegExp(`${PRE}\\s*체험존`, 'g'),
];
const BRACKET = /[「『\[<]([^」』\]>]{2,30})[」』\]>]/g;
const CONTEXT = /팝업|전시|오픈|콜라보|체험/;

const norm = (s) => s.replace(/[\s\-_'"`’‘·.:&x×X]/g, '').toLowerCase();
const cands = new Map();
let docsUsed = 0;
for (const doc of [...posts, ...yt]) {
  if (doc.date < CAND_SINCE) continue;
  docsUsed++;
  const text = `${doc.title} ${doc.desc}`;
  const names = new Set();
  for (const re of PATTERNS) for (const m of text.matchAll(re)) {
    const n = clean(m[1]);
    if (n) names.add(n);
  }
  if (CONTEXT.test(doc.title)) for (const m of doc.title.matchAll(BRACKET)) {
    const n = clean(m[1].replace(/팝업(스토어)?|전시회?|오픈/g, ' ').trim());
    if (n) names.add(n);
  }
  const area = areaOf(doc);
  const seen = new Set();
  for (const name of names) {
    const k = norm(name);
    if (k.length < 2 || seen.has(k)) continue;
    seen.add(k);
    const c = cands.get(k) ?? { key: k, names: new Map(), docs: 0, areas: {}, kinds: {}, first: doc.date, last: doc.date, examples: [] };
    c.names.set(name, (c.names.get(name) ?? 0) + 1);
    c.docs++;
    if (area) c.areas[area] = (c.areas[area] ?? 0) + 1;
    c.kinds[doc.kind] = (c.kinds[doc.kind] ?? 0) + 1;
    if (doc.date < c.first) c.first = doc.date;
    if (doc.date > c.last) c.last = doc.date;
    if (c.examples.length < 3) c.examples.push({ title: doc.title.slice(0, 80), link: doc.link, date: doc.date });
    cands.set(k, c);
  }
}

// 3. 이름 합치기: 짧은 키(3자 이상)를 품는 긴 키로 — 짧은 것부터, 가장 많이 나온 긴 키로
const keys = [...cands.keys()].sort((a, b) => a.length - b.length);
for (const k of keys) {
  const c = cands.get(k);
  if (!c || k.length < 3) continue;
  const into = [...cands.values()].filter((o) => o.key !== k && o.key.length > k.length && o.key.includes(k)).sort((a, b) => b.docs - a.docs)[0];
  if (!into) continue;
  into.docs += c.docs;
  for (const [n, v] of c.names) into.names.set(n, (into.names.get(n) ?? 0) + v);
  for (const [a, v] of Object.entries(c.areas)) into.areas[a] = (into.areas[a] ?? 0) + v;
  for (const [a, v] of Object.entries(c.kinds)) into.kinds[a] = (into.kinds[a] ?? 0) + v;
  if (c.first < into.first) into.first = c.first;
  if (c.last > into.last) into.last = c.last;
  for (const e of c.examples) if (into.examples.length < 3) into.examples.push(e);
  cands.delete(k);
}

// 5. 남기는 기준
const list = [...cands.values()]
  .filter((c) => c.docs >= 2)
  .map((c) => {
    const names = [...c.names.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
    const areas = Object.entries(c.areas).sort((a, b) => b[1] - a[1]);
    return { name: names[0][0], alt: names.slice(1, 4).map((n) => n[0]), docs: c.docs, area: areas[0]?.[0] ?? null, areas: c.areas, kinds: c.kinds, first: c.first, last: c.last, examples: c.examples };
  })
  .sort((a, b) => b.docs - a.docs);

writeFileSync(resolve(here, '02-candidates-v2.json'), `${JSON.stringify({ rule: 'v2 (00-preregistration.md)', docsUsed, count: list.length, candidates: list }, null, 1)}\n`);
console.log(JSON.stringify({ docsUsed, candidates: list.length, top30: list.slice(0, 30).map((c) => `${c.name}(${c.docs},${c.area})`) }));
