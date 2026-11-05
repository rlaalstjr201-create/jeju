/**
 * 서울 「구경하는 가게」 (ADR-0121, review/seoul-shops/criteria-01.md). scripts/seoul-cafe/curate.mjs와 같은 단계, 호출하는 단계는 한 번만.
 *   node scripts/seoul-shops/curate.mjs candidates   kakao-01 → candidates-01.json (2절, 호출 없음)
 *   node scripts/seoul-shops/curate.mjs pop          상호 검색량 → pop-01.json (3절, 네이버 검색광고, 1회)
 *   node scripts/seoul-shops/curate.mjs evidence     블로그 최신 10개 → evidence-01.json (4절, 네이버 검색 API, 1회; 끊기면 .part에서 이어 감)
 *   node scripts/seoul-shops/curate.mjs cut          숫자 하한 → judge-input-01.json·input/batch-NN.json (5절, 호출 없음)
 *   node scripts/seoul-shops/curate.mjs sample       out/batch-NN.json → audit-01-input.json(라벨 없음)·audit-01-key.json (8절)
 *   node scripts/seoul-shops/curate.mjs result       audit-01-out.json ↔ key → audit-01-result.json (8절 게이트)
 *   node scripts/seoul-shops/curate.mjs ship         게이트 통과 뒤만: keep → 같은 상호 한 곳(9절) → data/seoul/fun-seoul.json G9 (10절)
 * 키는 저장소 루트 .env(NAVER_AD_*·NAVER_CLIENT_*)이고 출력·파일 어디에도 남기지 않는다.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, volume03 } from '../famous-measure.mjs';
import { callWithRetry } from '../busan/measure.mjs';
import { brandOf } from '../seoul-fun/prefilter.mjs';
import { drawSample, kw } from '../seoul-cafe/curate.mjs';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dir = resolve(webRoot, 'review/seoul-shops');
const G = 'G9';
const read = (p, d) => (existsSync(resolve(dir, p)) ? JSON.parse(readFileSync(resolve(dir, p), 'utf8')) : d);
const write = (p, v) => writeFileSync(resolve(dir, p), JSON.stringify(v, null, 1) + '\n');
const km = (a, b) => {
  const r = Math.PI / 180;
  return 6371 * Math.hypot((b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r), (b.lat - a.lat) * r);
};

// 2절
/** R2 받는 카테고리(카카오 category_name 앞부분) */
export const CATEGORY = /^가정,생활 > (생활용품점|문구,사무용품|패션|중고용품|가구판매|인테리어|선물|기념품|공예|미용 > 화장품)( |$)/;
export const okCategory = (c) => CATEGORY.test(String(c)) || /소품/.test(String(c));
/** R3 쇼핑몰·백화점·아울렛·마트 입점, 생활 서비스(이름이나 카테고리) */
export const MALL = /백화점|아울렛|아웃렛|면세점|쇼핑몰|스타필드|타임스퀘어|더현대|코엑스몰|아이파크몰|IFC몰|롯데월드몰|이마트|홈플러스|롯데마트|AK플라자|NC백화점|뉴코아|도매|수선|세탁|렌탈|대여|수리/i;
/** R4 대형 체인 */
export const MASS = ['다이소', '아트박스', '올리브영', '무인양품', '모던하우스', '자주', '버터', '핫트랙스', '이니스프리', '랄라블라', '롭스', '시코르', '미니소', '플라잉타이거', '유니클로', '자라', 'zara', '에이치앤엠', 'h&m', '탑텐', '스파오', '에잇세컨즈', '무신사스탠다드', '지오다노', '나이키', '아디다스', '뉴발란스', 'abc마트', '슈마커', '폴더', '다비치', '코스트코', '이케아', '한샘', '까사미아', '텐바이텐', '세이브존'].map((s) => s.toLowerCase());
const MASS_OK = /본점|1호점|플래그십|flagship/i;
export const isMass = (name) => MASS.some((m) => brandOf(name).startsWith(m)) && !MASS_OK.test(name);
/** R5 카카오가 카테고리 끝에 브랜드를 붙인 곳(「… > 안경,렌즈 > 젠틀몬스터」): 넷째 칸이 있으면 브랜드 */
export const branded = (c) => String(c).split(' > ').length >= 4;
// 5절
export const CUT = { volume: 500, volumeNullBlog: 500, blog: 200, since: '20260808', max: 900, per: 60 };
// 8절
export const SEED = 20261109;
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
  const drop = { outside: rows.length - seoul.length, category: 0, mall: 0, mass: 0, dup: 0 };
  const out = new Map();
  for (const p of seoul) {
    if (out.has(p.id)) {
      const o = out.get(p.id);
      if (!o.words.includes(p.word)) o.words.push(p.word);
      drop.dup++;
      continue;
    }
    if (!okCategory(p.category)) { drop.category++; continue; }
    if (MALL.test(p.name) || MALL.test(p.category)) { drop.mall++; continue; }
    if (isMass(p.name)) { drop.mass++; continue; }
    const n = brandIds.get(brandOf(p.name)).size;
    const chain = n >= 3 ? n : branded(p.category) ? 'brand' : null;
    out.set(p.id, { id: `kk-${p.id}`, name: p.name, category: p.category.replace(/^가정,생활 > /, ''), address: p.address, lat: p.lat, lng: p.lng, url: p.url, words: [p.word], ...(chain ? { chain } : {}) });
  }
  const places = [...out.values()];
  write('candidates-01.json', { rows: rows.length, drop, n: places.length, chain: places.filter((p) => p.chain).length, places });
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
  const items = chosen.map((p) => ({ id: p.id, name: p.name, category: p.category, address: p.address, words: p.words, ...(p.chain ? { chain: p.chain } : {}), volume: volOf(p, vol), blog: { total: ev[p.id].total, posts: ev[p.id].posts } }));
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
  const ids = drawSample(v, SEED, PER);
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

/** 10절 종류(카드 줄 앞말·보통 시간) */
export const KINDS = ['플래그십', '문구점', '향수·향', '빈티지숍', '리빙숍', '편집숍', '소품샵', '가게'];
export function kindOf(category, name, chain) {
  const c = String(category);
  const n = String(name);
  if (chain && /플래그십|flagship|하우스|스페이스|쇼룸|스토어/i.test(n)) return '플래그십';
  if (/문구/.test(c) || /문구|stationery|페이퍼|paper/i.test(n)) return '문구점';
  if (/향수/.test(c) || /향수|퍼퓸|캔들|인센스|perfume|fragrance|scent|candle/i.test(n)) return '향수·향';
  if (/중고/.test(c) || /빈티지|vintage/i.test(n)) return '빈티지숍';
  if (/가구|인테리어|침구|주방/.test(c) || /리빙|living|그릇|가구|홈/i.test(n)) return '리빙숍';
  if (/패션/.test(c)) return chain ? '플래그십' : '편집숍';
  if (/생활용품|소품|선물|기념품|공예/.test(c)) return '소품샵';
  if (/화장품/.test(c)) return chain ? '플래그십' : '향수·향';
  return '가게';
}
/** 9절 같은 상호 keep 한 번 더 보기: 상호(검색량 키워드)가 같은 keep 가운데 한 곳. 이름에 본점·1호점·플래그십이 있으면 그곳, 아니면 블로그
 * total 큰 쪽, 같으면 id 순. 돌려주는 것: 남기는 id 집합과 빠지는 곳(이유). */
export function oneEach(keeps) {
  const by = new Map();
  for (const k of keeps) {
    const b = kw(k.name);
    if (!by.has(b)) by.set(b, []);
    by.get(b).push(k);
  }
  const keep = new Set();
  const out = [];
  for (const [b, list] of by) {
    const best = [...list].sort((x, y) => Number(MASS_OK.test(y.name)) - Number(MASS_OK.test(x.name)) || (y.total ?? 0) - (x.total ?? 0) || (x.id < y.id ? -1 : 1))[0];
    keep.add(best.id);
    for (const x of list) if (x !== best) out.push({ id: x.id, name: x.name, why: `같은 상호(${b}) — ${best.name}을 남김` });
  }
  return { keep, out };
}
/** 진행자 수동 제외(이유 적음). 판정·감사 뒤 리뷰에서만 더한다. */
export const OWNER_DROP = {};
function ship() {
  const res = read('audit-01-result.json');
  if (!res?.pass) throw new Error('감사 게이트 미통과 — 싣지 않는다 (criteria-01.md 8절)');
  const { inputs, v } = verdicts();
  const cand = new Map(read('candidates-01.json').places.map((p) => [p.id, p]));
  const hoods = JSON.parse(readFileSync(resolve(webRoot, 'review/seoul-fun/hoods-01.json'), 'utf8'));
  const path = resolve(webRoot, 'data/seoul/fun-seoul.json');
  const file = JSON.parse(readFileSync(path, 'utf8'));
  const others = file.places.filter((p) => p.g !== G);
  const taken = new Set(others.map((p) => p.id));
  const keeps = v.filter((x) => x.label === 'keep').map((x) => ({ id: x.id, name: inputs.get(x.id).name, total: inputs.get(x.id).blog.total }));
  const clash = keeps.filter((k) => taken.has(k.id)).map((k) => k.name);
  const owner = keeps.filter((k) => !taken.has(k.id) && OWNER_DROP[k.id]).map((k) => k.name);
  const { keep, out } = oneEach(keeps.filter((k) => !taken.has(k.id) && !OWNER_DROP[k.id]));
  const add = [];
  for (const id of keep) {
    const p = cand.get(id);
    const hood = hoods.map((h) => ({ h, d: km(h, p) })).sort((a, b) => a.d - b.d)[0];
    const near = hood.d <= 0.7;
    const where = near ? hood.h.name : (String(p.address).split(' ')[1] ?? '');
    const word = kindOf(p.category, p.name, p.chain);
    add.push({ id: p.id, name: p.name, g: G, word, lat: Math.round(p.lat * 1e5) / 1e5, lng: Math.round(p.lng * 1e5) / 1e5, line: `${word} · ${where}`, walkin: true, url: String(p.url).replace(/^http:/, 'https:'), ...(near ? { hood: hood.h.name } : {}) });
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
  write('ship-01.json', { shipped: add.length, clash, owner, sameName: out, byWord, byWhere });
  console.log(JSON.stringify({ shipped: add.length, clash, owner, sameName: out, byWord, byWhere }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = { candidates, pop, evidence, cut, sample, result, ship }[process.argv[2]];
  if (!run) {
    console.error('candidates | pop | evidence | cut | sample | result | ship');
    process.exit(1);
  }
  await run();
}
