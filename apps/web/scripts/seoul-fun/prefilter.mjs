/**
 * 서울 즐길 거리 후보 거르기 (ADR-0115 Amendment 1, review/seoul-fun/criteria-07.md 2절). 호출 없음, 결정적.
 *   node scripts/seoul-fun/prefilter.mjs   kakao-01·kakao-02(+ kopis-live-geo-01) → review/seoul-fun/candidates-01.json
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dir = resolve(webRoot, 'review/seoul-fun');

/** 검색어 → 받는 카테고리(카카오 category_name의 첫 「 > 」 뒤, 앞부분이 같으면 받음). criteria-07.md 2절 R1. */
export const ALLOW = {
  한강공원: ['공원'],
  루프탑: ['카페', '술집', '양식'],
  '서울 루프탑바': ['카페', '술집', '양식'],
  전망대: ['관광,명소>전망대', '관광,명소'],
  야경: ['관광,명소'],
  '노을 명소': ['관광,명소>전망대', '공원'],
  '한강 다리 야경': ['관광,명소', '공원'],
  '한강 피크닉': ['공원', '관광,명소'],
  야시장: ['시장', '이벤트>페스티벌'],
  '밤도깨비 야시장': ['시장', '이벤트', '문화시설', '공원'],
  포장마차: ['술집>실내포장마차'],
  포차거리: ['술집', '관광,명소', '시장'],
  노가리골목: ['술집', '관광,명소', '시장'],
  야장: ['술집'],
  전통시장: ['시장'],
  독립서점: ['도서>서점', '카페>테마카페>북카페'],
  편집숍: ['패션'],
  편집샵: ['패션', '생활,편의>생활용품'],
  빈티지샵: ['패션'],
  레코드샵: ['음악>음반,레코드샵', '음악'],
  팝업스토어: ['이벤트>팝업스토어', '문화시설>전시관'],
  LP바: ['술집', '카페', '음악>음반,레코드샵'],
  방탈출: ['여가시설>방탈출카페', '카페>테마카페'],
  클라이밍: ['클라이밍'],
  찜질방: ['목욕탕,사우나'],
  볼링장: ['볼링'],
  보드게임카페: ['여가시설>보드카페'],
  야구장: ['야구>야구장'],
  라이브클럽: ['카페>테마카페>라이브카페', '문화시설>공연장,연극극장'],
  재즈바: ['술집', '카페>테마카페>라이브카페'],
  재즈클럽: ['술집', '카페>테마카페>라이브카페', '문화시설>공연장,연극극장'],
  라이브바: ['술집', '카페>테마카페>라이브카페'],
  라이브하우스: ['문화시설>공연장,연극극장', '카페>테마카페>라이브카페', '술집'],
  '인디밴드 공연': ['문화시설>공연장,연극극장', '카페>테마카페>라이브카페'],
  '인디 공연장': ['문화시설>공연장,연극극장'],
  소극장: ['문화시설>공연장,연극극장'],
  독립영화관: ['영화,영상>영화관'],
  예술영화관: ['영화,영상>영화관'],
  '아트하우스 영화관': ['영화,영상>영화관'],
  시네마테크: ['영화,영상>영화관', '문화시설'],
  대안공간: ['문화시설>전시관', '문화시설>미술관'],
  버스킹: ['문화시설', '공연,연극'],
};
/** 어디서 왔든 빼는 이름 꼴(시설 일부): R1 */
const FACILITY = /(주차장|화장실|매표소|안내소|입구|출구|나들목|관리사무소|정류장|\d+번\s*출입구)(\s*\d+)?$/;
/** 프로야구 경기장만(R1): 리틀·연습장은 직관이 아니다 */
const PRO_BALLPARK = /잠실야구장|고척스카이돔/;
/** 체인이어도 남기는 검색어(주인 결정, Amendment 1) */
export const CHAIN_OK = new Set(['방탈출', '볼링장']);

/** 상호: 지점 이름을 뗀 이름(공백 없이). R2 */
export function brandOf(name) {
  return String(name)
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s*(본점|[0-9]+호점|[^\s]+점)$/, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
export function collect() {
  const rows = [];
  for (const round of ['kakao-01', 'kakao-02']) {
    const d = resolve(dir, round);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d).sort()) {
      const r = read(resolve(d, f));
      for (const [q, v] of Object.entries(r)) {
        const word = q.split(' ').slice(1).join(' ');
        for (const p of v.places) rows.push({ ...p, g: v.g, word });
      }
    }
  }
  const geo = resolve(dir, 'kopis-live-geo-01.json');
  if (existsSync(geo)) for (const p of read(geo).places) rows.push({ ...p, g: 'G7', word: 'KOPIS 대중음악' });
  return rows;
}

export function prefilter(rows) {
  const drop = { outside: 0, category: 0, facility: 0, ballpark: 0, chain: 0, dup: 0 };
  const allowed = [];
  for (const p of rows) {
    if (!String(p.address).startsWith('서울')) { drop.outside++; continue; }
    const cat = String(p.category).split(' > ').slice(1).join('>');
    const ok = p.word === 'KOPIS 대중음악' || (ALLOW[p.word] ?? []).some((a) => cat === a || cat.startsWith(`${a}>`));
    if (!ok) { drop.category++; continue; }
    if (FACILITY.test(p.name)) { drop.facility++; continue; }
    if (p.word === '야구장' && !PRO_BALLPARK.test(p.name)) { drop.ballpark++; continue; }
    allowed.push({ ...p, cat });
  }
  // R2 체인: 같은 상호의 서로 다른 곳이 셋 이상(받은 모든 후보 안에서, 카테고리 거르기 전), 또는 카카오 카테고리에 상호 갈래가 있음
  const brandIds = new Map();
  for (const p of rows) {
    const b = brandOf(p.name);
    if (!brandIds.has(b)) brandIds.set(b, new Set());
    brandIds.get(b).add(p.id);
  }
  const KNOWN_LEAF = /^(술집>실내포장마차|여가시설>보드카페|여가시설>방탈출카페|목욕탕,사우나>찜질방|카페>커피전문점|한식>육류,고기>족발,보쌈)>/;
  const out = new Map();
  for (const p of allowed) {
    const chain = brandIds.get(brandOf(p.name)).size >= 3 || KNOWN_LEAF.test(p.cat);
    if (chain && !CHAIN_OK.has(p.word)) { drop.chain++; continue; }
    if (out.has(p.id)) { drop.dup++; continue; }
    out.set(p.id, { id: `kk-${p.id}`, name: p.name, g: p.g, word: p.word, category: p.cat, address: p.address, lat: p.lat, lng: p.lng, url: p.url, ...(p.shows ? { shows: p.shows } : {}), ...(chain ? { chain: true } : {}) });
  }
  return { drop, places: [...out.values()] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = collect();
  const { drop, places } = prefilter(rows);
  const byG = {};
  const byWord = {};
  for (const p of places) {
    byG[p.g] = (byG[p.g] ?? 0) + 1;
    byWord[p.word] = (byWord[p.word] ?? 0) + 1;
  }
  writeFileSync(resolve(dir, 'candidates-01.json'), JSON.stringify({ rows: rows.length, drop, byG, byWord, places }, null, 1) + '\n');
  console.log(JSON.stringify({ rows: rows.length, kept: places.length, drop, byG, byWord }));
}
