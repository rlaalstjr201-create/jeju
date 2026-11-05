/**
 * 서울 카페·디저트 「전통의 강자」 (ADR-0120, review/seoul-cafe/criteria-01.md). 단계마다 한 명령, 호출하는 단계는 한 번만.
 *   node scripts/seoul-cafe/curate.mjs candidates   kakao-01 → candidates-01.json (2절, 호출 없음)
 *   node scripts/seoul-cafe/curate.mjs pop          상호 검색량 → pop-01.json (3절, 네이버 검색광고, 1회)
 *   node scripts/seoul-cafe/curate.mjs evidence     블로그 최신 10개 → evidence-01.json (4절, 네이버 검색 API, 1회; 끊기면 .part에서 이어 감)
 *   node scripts/seoul-cafe/curate.mjs cut          숫자 하한 → judge-input-01.json·input/batch-NN.json (5절, 호출 없음)
 *   node scripts/seoul-cafe/curate.mjs sample       out/batch-NN.json → audit-01-input.json(라벨 없음)·audit-01-key.json (8절)
 *   node scripts/seoul-cafe/curate.mjs result       audit-01-out.json ↔ key → audit-01-result.json (8절 게이트)
 *   node scripts/seoul-cafe/curate.mjs ship         게이트 통과 뒤만: keep → data/seoul/fun-seoul.json G8 (9절)
 * 키는 저장소 루트 .env(NAVER_AD_*·NAVER_CLIENT_*)이고 출력·파일 어디에도 남기지 않는다.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, volume03 } from '../famous-measure.mjs';
import { callWithRetry } from '../busan/measure.mjs';
import { brandOf } from '../seoul-fun/prefilter.mjs';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dir = resolve(webRoot, 'review/seoul-cafe');
const read = (p, d) => (existsSync(resolve(dir, p)) ? JSON.parse(readFileSync(resolve(dir, p), 'utf8')) : d);
const write = (p, v) => writeFileSync(resolve(dir, p), JSON.stringify(v, null, 1) + '\n');
const km = (a, b) => {
  const r = Math.PI / 180;
  return 6371 * Math.hypot((b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r), (b.lat - a.lat) * r);
};

// 2절
export const THEME = /키즈카페|애견카페|고양이카페|동물카페|만화카페|스터디카페|룸카페|사주카페|보드카페|방탈출|라이브카페|북카페/;
export const MASS = ['스타벅스', '투썸플레이스', '이디야', '메가엠지씨', '메가MGC', '메가커피', '컴포즈커피', '빽다방', '할리스', '커피빈', '폴바셋', '엔제리너스', '파스쿠찌', '탐앤탐스', '커피베이', '더벤티', '매머드', '공차', '카페베네', '드롭탑', '요거프레소', '바나프레소', '텐퍼센트', '하삼동커피', '감성커피', '커피에반하다', '셀렉토커피', '더카페', '달콤커피', '파리바게뜨', '뚜레쥬르', '배스킨라빈스', '던킨', '크리스피크림', '설빙', '앤티앤스', '와플대학', '요아정', '요거트아이스크림의정석', '나뚜루', '하겐다즈', '스무디킹', '쥬씨', '로봇카페', '무인카페'].map((s) => s.toLowerCase());
const MASS_OK = /리저브|reserve|본점|1호점|플래그십|flagship/i;
export const isMass = (name) => MASS.some((m) => brandOf(name).startsWith(m)) && !MASS_OK.test(name);
// 3절
export const kw = (name) => brandOf(name).replace(/[^0-9A-Za-z가-힣]/g, '').toUpperCase();
// 5절
export const CUT = { volume: 1000, volumeNullBlog: 1000, blog: 300, since: '20260808', max: 900, per: 60 };
// 8절
export const SEED = 20261108;
export const PER = 40;
export const LABELS = ['keep', 'drop'];

function candidates() {
  const rows = [];
  for (const f of readdirSync(resolve(dir, 'kakao-01')).sort())
    for (const v of Object.values(JSON.parse(readFileSync(resolve(dir, 'kakao-01', f), 'utf8')))) for (const p of v.places) rows.push({ ...p, word: v.word });
  const seoul = rows.filter((p) => String(p.address).startsWith('서울'));
  const brandIds = new Map();
  for (const p of seoul) {
    const b = brandOf(p.name);
    if (!brandIds.has(b)) brandIds.set(b, new Set());
    brandIds.get(b).add(p.id);
  }
  const food = JSON.parse(readFileSync(resolve(webRoot, 'data/seoul/spots-seoul.json'), 'utf8')).filter((s) => s.mood === 'food');
  const sq = (s) => String(s).replace(/\s+/g, '');
  const drop = { outside: rows.length - seoul.length, category: 0, theme: 0, mass: 0, dup: 0 };
  const out = new Map();
  for (const p of seoul) {
    if (out.has(p.id)) {
      const o = out.get(p.id);
      if (!o.words.includes(p.word)) o.words.push(p.word);
      drop.dup++;
      continue;
    }
    if (!/^음식점 > (카페|간식)( |$)/.test(p.category)) { drop.category++; continue; }
    if (THEME.test(p.category) || THEME.test(sq(p.name))) { drop.theme++; continue; }
    if (isMass(p.name)) { drop.mass++; continue; }
    const n = brandIds.get(brandOf(p.name)).size;
    const inFood = food.some((s) => s.kakaoPlaceId === p.id || (sq(s.name) === sq(p.name) && km(s, p) <= 0.2));
    out.set(p.id, { id: `kk-${p.id}`, name: p.name, category: p.category.replace(/^음식점 > /, ''), address: p.address, lat: p.lat, lng: p.lng, url: p.url, words: [p.word], ...(n >= 3 ? { chain: n } : {}), ...(inFood ? { inFood: true } : {}) });
  }
  const places = [...out.values()];
  write('candidates-01.json', { rows: rows.length, drop, n: places.length, chain: places.filter((p) => p.chain).length, inFood: places.filter((p) => p.inFood).length, places });
  console.log(JSON.stringify({ rows: rows.length, kept: places.length, drop }));
}

async function pop() {
  if (existsSync(resolve(dir, 'pop-01.json'))) throw new Error('pop-01.json exists (one run only)');
  const keys = { customer: env('NAVER_AD_CUSTOMER_ID'), api: env('NAVER_AD_API_KEY'), secret: env('NAVER_AD_SECRET_KEY') };
  if (!keys.customer || !keys.api || !keys.secret) throw new Error('NAVER_AD_* missing');
  const words = [...new Set(read('candidates-01.json').places.map((p) => kw(p.name)))].filter((w) => w.length >= 2 && w.length <= 40).sort();
  const volume = {};
  let calls = 0;
  let failed = 0;
  for (let i = 0; i < words.length; i += 5) {
    const batch = words.slice(i, i + 5);
    const r = await callWithRetry(batch, keys);
    calls += r.tries;
    if (!r.rows) failed += batch.length;
    for (const row of r.rows ?? []) {
      const k = String(row.relKeyword).replace(/\s+/g, '').toUpperCase();
      if (batch.includes(k)) volume[k] = volume03(row);
    }
    await new Promise((s) => setTimeout(s, 500));
  }
  write('pop-01.json', { asked: words.length, calls, failed, volume });
  console.log(JSON.stringify({ asked: words.length, calls, failed, measured: Object.keys(volume).length }));
}
const volOf = (p, vol) => vol[kw(p.name)] ?? null;

async function evidence() {
  const out = resolve(dir, 'evidence-01.json');
  const part = `${out}.part`;
  if (existsSync(out)) throw new Error('evidence-01.json exists (one run only)');
  const id = env('NAVER_CLIENT_ID');
  const secret = env('NAVER_CLIENT_SECRET');
  if (!id || !secret) throw new Error('NAVER_CLIENT_* missing');
  const vol = read('pop-01.json').volume;
  const places = read('candidates-01.json').places.filter((p) => {
    const v = volOf(p, vol);
    return v === null || v >= CUT.volume;
  });
  const ev = existsSync(part) ? JSON.parse(readFileSync(part, 'utf8')) : {};
  const strip = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
  let calls = 0;
  for (const p of places) {
    if (ev[p.id]) continue;
    const q = `${p.name} ${String(p.address).split(' ')[1]?.replace(/구$/, '') ?? ''}`.trim();
    let body = null;
    for (let t = 0; t < 3 && !body; t++) {
      const res = await fetch(`https://openapi.naver.com/v1/search/blog.json?${new URLSearchParams({ query: q, display: '10', sort: 'date' })}`, { headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret } }).catch(() => null);
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
  console.log(JSON.stringify({ places: places.length, calls, failed: Object.values(ev).filter((e) => e.failed).length }));
}

/** 5절 문턱: 판정에 가는가 */
export function passes(volume, ev) {
  if (!ev || ev.failed) return false;
  const latest = ev.posts.map((x) => x.date).sort().pop() ?? '';
  return (volume === null ? ev.total >= CUT.volumeNullBlog : volume >= CUT.volume) && ev.total >= CUT.blog && latest >= CUT.since;
}

function cut() {
  const vol = read('pop-01.json').volume;
  const ev = read('evidence-01.json');
  const cand = read('candidates-01.json').places;
  const pass = cand.filter((p) => passes(volOf(p, vol), ev[p.id]));
  pass.sort((a, b) => (volOf(b, vol) ?? 0) - (volOf(a, vol) ?? 0) || ev[b.id].total - ev[a.id].total || (a.id < b.id ? -1 : 1));
  const chosen = pass.slice(0, CUT.max).sort((a, b) => (a.id < b.id ? -1 : 1));
  const items = chosen.map((p) => ({ id: p.id, name: p.name, category: p.category, address: p.address, words: p.words, ...(p.chain ? { chain: p.chain } : {}), ...(p.inFood ? { inFood: true } : {}), volume: volOf(p, vol), blog: { total: ev[p.id].total, posts: ev[p.id].posts } }));
  write('judge-input-01.json', { criteria: 'criteria-01.md', evidenced: Object.keys(ev).length, failed: Object.values(ev).filter((e) => e.failed).length, passed: pass.length, n: items.length, places: items });
  mkdirSync(resolve(dir, 'input'), { recursive: true });
  const files = [];
  for (let i = 0; i * CUT.per < items.length; i++) {
    const nn = String(i + 1).padStart(2, '0');
    write(`input/batch-${nn}.json`, { batch: nn, items: items.slice(i * CUT.per, (i + 1) * CUT.per) });
    files.push(nn);
  }
  console.log(JSON.stringify({ candidates: cand.length, evidenced: Object.keys(ev).length, passed: pass.length, judged: items.length, batches: files.length }));
}

/** mulberry32 — 씨앗 고정 의사난수(scripts/seoul-2040/curate.mjs와 같은 식). */
export function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function drawSample(verdicts, seed = SEED, per = PER) {
  const rnd = mulberry32(seed);
  const out = [];
  for (const label of LABELS) {
    const a = verdicts.filter((v) => v.label === label).map((v) => v.id).sort();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    out.push(...a.slice(0, per));
  }
  return out;
}
function verdicts() {
  const inputs = new Map();
  for (const f of readdirSync(resolve(dir, 'input')).filter((f) => /^batch-\d+\.json$/.test(f)).sort()) for (const x of read(`input/${f}`).items) inputs.set(x.id, x);
  const v = readdirSync(resolve(dir, 'out')).filter((f) => /^batch-\d+\.json$/.test(f)).sort().flatMap((f) => read(`out/${f}`).items);
  const seen = new Set(v.map((x) => x.id));
  const bad = v.filter((x) => !inputs.has(x.id) || !LABELS.includes(x.label));
  const missing = [...inputs.keys()].filter((id) => !seen.has(id));
  if (bad.length || missing.length || v.length !== inputs.size) {
    console.error(`판정 출력이 입력과 맞지 않음: 잘못 ${bad.length}, 빠짐 ${missing.length}, 판정 ${v.length}/${inputs.size}`);
    process.exit(1);
  }
  return { inputs, v };
}
function sample() {
  const { inputs, v } = verdicts();
  const ids = drawSample(v);
  const byId = new Map(v.map((x) => [x.id, x]));
  write('audit-01-input.json', { seed: SEED, per: PER, n: ids.length, criteria: 'criteria-01.md', items: [...ids].sort().map((id) => inputs.get(id)) });
  const counts = Object.fromEntries(LABELS.map((l) => [l, v.filter((x) => x.label === l).length]));
  write('audit-01-key.json', { seed: SEED, per: PER, counts, items: ids.map((id) => byId.get(id)) });
  console.log(`판정 ${v.length}곳 ${JSON.stringify(counts)} → 감사 표본 ${ids.length}곳`);
}
function result() {
  const key = read('audit-01-key.json');
  const audit = new Map(read('audit-01-out.json').items.map((x) => [x.id, x.label]));
  const by = {};
  const mismatch = [];
  for (const k of key.items) {
    by[k.label] ??= { n: 0, agree: 0 };
    by[k.label].n++;
    if (audit.get(k.id) === k.label) by[k.label].agree++;
    else mismatch.push({ id: k.id, judge: k.label, audit: audit.get(k.id) ?? null });
  }
  const rate = Object.fromEntries(LABELS.map((l) => [l, by[l] ? by[l].agree / by[l].n : null]));
  const pass = LABELS.every((l) => rate[l] !== null && rate[l] >= 0.9);
  write('audit-01-result.json', { counts: key.counts, by, rate, pass, mismatch });
  console.log(JSON.stringify({ by, pass }));
}

/** 9절 종류 */
export function kindOf(category, name, words) {
  const c = String(category);
  if (/도넛/.test(c)) return '도넛';
  if (/아이스크림/.test(c)) return /젤라또|젤라토/.test(`${name} ${words.join(' ')}`) ? '젤라또' : '아이스크림';
  if (/제과|베이커리/.test(c)) return '베이커리';
  if (/케이크/.test(c)) return '케이크';
  if (/떡|한과|초콜릿|디저트|와플|마카롱/.test(c)) return '디저트';
  if (/전통찻집|(^|>)\s*차(\s|$)/.test(c)) return '찻집';
  if (/로스터리|로스터스|로스팅/.test(name) || (words.length === 1 && words[0].includes('로스터리'))) return '로스터리';
  if (words.length === 1 && words[0].includes('티하우스')) return '찻집';
  return '카페';
}
/** 감사 뒤 리뷰가 찾은 기준 C 위반(ADR-0120 Amendment 1, predeploy-review.md m1·m2): 같은 브랜드 keep 두 지점 가운데 한 곳만.
 * 이름에 본점·1호점이 있으면 그곳, 아니면 상호 검색량 높은 쪽(같으면 블로그 total 높은 쪽). 여기 적힌 쪽은 싣지 않는다. */
export const OWNER_DROP = {
  'kk-1314678355': '타르틴베이커리 이태원점 — 한남점과 검색량 같고 블로그 적음(19,893 < 22,601)',
  'kk-921034789': '피터팬1978 사러가점 — 이름에 본점인 「피터팬1978 본점」을 남김',
  'kk-795337625': '스코프 서촌2호점 — 서촌점과 검색량 같고 블로그 적음(2,050 < 2,470)',
  'kk-745214463': '테일러커피 서촌경복궁점 — 이름에 1호점인 「테일러커피 연남1호점」을 남김(감사도 drop)',
  'kk-434507199': '젠제로 압구정점 — 「젠제로」와 검색량 같고 블로그 적음(919 < 4,471)',
};
function ship() {
  const res = read('audit-01-result.json');
  if (!res?.pass) throw new Error('감사 게이트 미통과 — 싣지 않는다 (criteria-01.md 8절)');
  const { inputs, v } = verdicts();
  const cand = new Map(read('candidates-01.json').places.map((p) => [p.id, p]));
  const hoods = JSON.parse(readFileSync(resolve(webRoot, 'review/seoul-fun/hoods-01.json'), 'utf8'));
  const path = resolve(webRoot, 'data/seoul/fun-seoul.json');
  const file = JSON.parse(readFileSync(path, 'utf8'));
  const others = file.places.filter((p) => p.g !== 'G8');
  const taken = new Set(others.map((p) => p.id));
  const add = [];
  let clash = 0;
  let owner = 0;
  for (const j of v.filter((x) => x.label === 'keep')) {
    if (taken.has(j.id)) { clash++; continue; }
    if (OWNER_DROP[j.id]) { owner++; continue; }
    const p = cand.get(j.id);
    const i = inputs.get(j.id);
    const hood = hoods.map((h) => ({ h, d: km(h, p) })).sort((a, b) => a.d - b.d)[0];
    const near = hood.d <= 0.7;
    const where = near ? hood.h.name : (String(p.address).split(' ')[1] ?? '');
    const word = kindOf(p.category, p.name, i.words);
    add.push({ id: p.id, name: p.name, g: 'G8', word, lat: Math.round(p.lat * 1e5) / 1e5, lng: Math.round(p.lng * 1e5) / 1e5, line: `${word} · ${where}`, walkin: true, url: String(p.url).replace(/^http:/, 'https:'), ...(near ? { hood: hood.h.name } : {}) });
  }
  file.places = [...others, ...add].sort((a, b) => (a.id < b.id ? -1 : 1));
  writeFileSync(path, JSON.stringify(file) + '\n');
  const byWord = {};
  const byWhere = {};
  for (const p of add) {
    byWord[p.word] = (byWord[p.word] ?? 0) + 1;
    const w = p.line.split(' · ')[1];
    byWhere[w] = (byWhere[w] ?? 0) + 1;
  }
  console.log(JSON.stringify({ shipped: add.length, clash, owner, byWord, byWhere }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = { candidates, pop, evidence, cut, sample, result, ship }[process.argv[2]];
  if (!run) {
    console.error('candidates | pop | evidence | cut | sample | result | ship');
    process.exit(1);
  }
  await run();
}
