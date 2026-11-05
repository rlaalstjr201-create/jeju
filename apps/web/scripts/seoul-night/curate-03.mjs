/**
 * 서울 「밤 놀거리」 2회차 (ADR-0122, review/seoul-night/criteria-03.md). 수집·거르기·검색량·블로그는 1회차(기준 02) 결과를 그대로 쓰고
 * (kakao-01·candidates-01·pop-01·evidence-01, 다시 부르지 않음), R6(LP·재즈 바와 이미 즐길 거리인 곳 빼기)부터 새로 한다.
 *   node scripts/seoul-night/curate-03.mjs cut      R6 + 숫자 하한 → judge-input-03.json·input-03/batch-NN.json (호출 없음)
 *   node scripts/seoul-night/curate-03.mjs sample   out-03/batch-NN.json → audit-03-input.json(라벨 없음)·audit-03-key.json
 *   node scripts/seoul-night/curate-03.mjs result   audit-03-out.json ↔ key → audit-03-result.json (게이트)
 *   node scripts/seoul-night/curate-03.mjs ship     게이트 통과 뒤만: keep → 같은 상호 한 곳 → data/seoul/fun-seoul.json G10
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, volume03 } from '../famous-measure.mjs';
import { callWithRetry } from '../busan/measure.mjs';
import { brandOf as branchOff } from '../seoul-fun/prefilter.mjs';
import { drawSample } from '../seoul-cafe/curate.mjs';

/** 상호(2절 R5·3절): 지점 이름을 뗀 이름. 「…주점」「…상점」처럼 이름 전체가 지워지면(두 자 미만) 이름 전체(공백 없이 소문자) — 가게 회차의 교훈 */
export function brandOf(name) {
  const b = branchOff(name);
  return b.length >= 2 ? b : String(name).replace(/\s+/g, '').toLowerCase();
}
export const kw = (name) => brandOf(name).replace(/[^0-9A-Za-z가-힣]/g, '').toUpperCase();

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dir = resolve(webRoot, 'review/seoul-night');
const G = 'G10';
const read = (p, d) => (existsSync(resolve(dir, p)) ? JSON.parse(readFileSync(resolve(dir, p), 'utf8')) : d);
const write = (p, v) => writeFileSync(resolve(dir, p), JSON.stringify(v, null, 1) + '\n');
const km = (a, b) => {
  const r = Math.PI / 180;
  return 6371 * Math.hypot((b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r), (b.lat - a.lat) * r);
};

// 2절
/** R2 받는 카테고리: 술집(실내포장마차·오뎅바 빼고)과 나이트,클럽. 유흥주점·단란주점은 어디서든 뺀다. */
export const okCategory = (c) => {
  const s = String(c);
  if (/유흥주점|단란주점/.test(s)) return false;
  if (/^가정,생활 > 유흥시설 > 나이트,클럽( |$)/.test(s)) return true;
  return /^음식점 > 술집( |$)/.test(s) && !/^음식점 > 술집 > (실내포장마차|오뎅바)( |$)/.test(s);
};
/** R3 룸·접객·호스트·헌팅·감성주점·부킹 — 이름만(기준 02: 카테고리 「유흥시설 > 나이트,클럽」의 「유흥」이 클럽을 지웠다) */
export const ADULT = /헌팅|감성주점|토킹|룸살롱|룸술집|룸바|룸식|가라오케|노래|단란|유흥|호빠|호스트|하이퍼블릭|퍼블릭|텐카페|쩜오|셔츠|풀싸롱|레깅스|성인나이트|부킹|콜라텍|캬바레|카바레/i;
/** R4 대형 술집 체인(고정 목록) */
export const MASS = ['생활맥주', '역전할머니맥주', '한신포차', '투다리', '봉구비어', '칠성포차', '용용선생', '크라운호프', '금별맥주', '간이역', '호맥', '설맥', '우후죽순', '오내혼술집', '펀비어킹', '인생술집', '청담이상'].map((s) => s.toLowerCase());
const MASS_OK = /본점|1호점|플래그십|flagship/i;
/** R4 카카오가 카테고리 끝에 브랜드를 붙인 곳(「술집 > 칵테일바 > 오내혼술집」): 넷째 칸이 있으면 프랜차이즈 */
export const branded = (c) => String(c).split(' > ').length >= 4;
export const isMass = (name, category = '') => (MASS.some((m) => brandOf(name).startsWith(m)) || branded(category)) && !MASS_OK.test(name);
/** R6(기준 03): LP·재즈 바(G4·G7 갈래)와 이미 즐길 거리에 있는 곳은 판정 전에 뺀다 — 이름·카테고리 */
export const LP_JAZZ = /LP|엘피|재즈|jazz|바이닐|vinyl|레코드|record|라이브카페|라이브바|라이브클럽/i;
export const r6Out = (p, fun) => LP_JAZZ.test(p.name) || LP_JAZZ.test(p.category) || fun.has(p.id);
// 5절
export const CUT = { volume: 500, volumeNullBlog: 500, blog: 200, since: '20260808', max: 900, per: 60 };
// 8절
export const SEED = 20261112;
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
  const drop = { outside: rows.length - seoul.length, category: 0, adult: 0, mass: 0, dup: 0 };
  const out = new Map();
  for (const p of seoul) {
    if (out.has(p.id)) {
      const o = out.get(p.id);
      if (!o.words.includes(p.word)) o.words.push(p.word);
      drop.dup++;
      continue;
    }
    if (!okCategory(p.category)) { drop.category++; continue; }
    if (ADULT.test(p.name)) { drop.adult++; continue; }
    if (isMass(p.name, p.category)) { drop.mass++; continue; }
    const n = brandIds.get(brandOf(p.name)).size;
    const chain = n >= 3 ? n : null;
    out.set(p.id, { id: `kk-${p.id}`, name: p.name, category: p.category.replace(/^(음식점|가정,생활) > /, ''), address: p.address, lat: p.lat, lng: p.lng, url: p.url, words: [p.word], ...(chain ? { chain } : {}) });
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
      const b = res?.status === 200 ? await res.json().catch(() => null) : null;
      if (Array.isArray(b?.items)) body = b; // 200 without items (seen once): counts as a failed try (4절)
      else {
        await res?.body?.cancel().catch(() => {});
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
  const fun = new Set(JSON.parse(readFileSync(resolve(webRoot, 'data/seoul/fun-seoul.json'), 'utf8')).places.map((p) => p.id));
  const all = read('candidates-01.json').places;
  const r6 = all.filter((p) => r6Out(p, fun));
  const cand = all.filter((p) => !r6Out(p, fun));
  const pass = cand.filter((p) => passes(volOf(p, vol), ev[p.id]));
  pass.sort((a, b) => (volOf(b, vol) ?? 0) - (volOf(a, vol) ?? 0) || ev[b.id].total - ev[a.id].total || (a.id < b.id ? -1 : 1));
  const chosen = pass.slice(0, CUT.max).sort((a, b) => (a.id < b.id ? -1 : 1));
  const items = chosen.map((p) => ({ id: p.id, name: p.name, category: p.category, address: p.address, words: p.words, ...(p.chain ? { chain: p.chain } : {}), volume: volOf(p, vol), blog: { total: ev[p.id].total, posts: ev[p.id].posts } }));
  write('judge-input-03.json', { criteria: 'criteria-03.md', r6: r6.length, evidenced: Object.keys(ev).length, failed: Object.values(ev).filter((e) => e.failed).length, passed: pass.length, n: items.length, places: items });
  mkdirSync(resolve(dir, 'input-03'), { recursive: true });
  const files = [];
  for (let i = 0; i * CUT.per < items.length; i++) {
    const nn = String(i + 1).padStart(2, '0');
    write(`input-03/batch-${nn}.json`, { batch: nn, items: items.slice(i * CUT.per, (i + 1) * CUT.per) });
    files.push(nn);
  }
  console.log(JSON.stringify({ r6: r6.length, candidates: cand.length, evidenced: Object.keys(ev).length, passed: pass.length, judged: items.length, batches: files.length }));
}

function verdicts() {
  const inputs = new Map();
  for (const f of readdirSync(resolve(dir, 'input-03')).filter((f) => /^batch-\d+\.json$/.test(f)).sort()) for (const x of read(`input-03/${f}`).items) inputs.set(x.id, x);
  const v = readdirSync(resolve(dir, 'out-03')).filter((f) => /^batch-\d+\.json$/.test(f)).sort().flatMap((f) => read(`out-03/${f}`).items);
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
  write('audit-03-input.json', { seed: SEED, per: PER, n: ids.length, criteria: 'criteria-03.md', items: [...ids].sort().map((id) => inputs.get(id)) });
  const counts = Object.fromEntries(LABELS.map((l) => [l, v.filter((x) => x.label === l).length]));
  write('audit-03-key.json', { seed: SEED, per: PER, counts, items: ids.map((id) => byId.get(id)) });
  console.log(`판정 ${v.length}곳 ${JSON.stringify(counts)} → 감사 표본 ${ids.length}곳`);
}
function result() {
  const key = read('audit-03-key.json');
  const audit = new Map(read('audit-03-out.json').items.map((x) => [x.id, x.label]));
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
  write('audit-03-result.json', { counts: key.counts, by, rate, pass, mismatch });
  console.log(JSON.stringify({ by, pass }));
}

/** 10절 종류(카드 줄 앞말·보통 시간): 위에서부터 처음 맞는 것 */
export const KINDS = ['클럽', '루프탑바', '하이볼바', '와인바', '음악바', '칵테일바', '바'];
export function kindOf(category, name, words) {
  const c = String(category);
  const n = String(name);
  const only = (re) => words.length > 0 && words.every((w) => re.test(w));
  if (/나이트,클럽/.test(c)) return '클럽';
  if (/루프탑|rooftop/i.test(n)) return '루프탑바';
  if (/하이볼|highball/i.test(n)) return '하이볼바';
  if (/와인바/.test(c) || /와인|wine/i.test(n)) return '와인바';
  if (/재즈|jazz|LP|엘피|바이닐|vinyl|DJ|디제이|힙합|hiphop|음악|뮤직|music/i.test(n)) return '음악바';
  if (/클럽|club/i.test(n) && words.some((w) => /클럽/.test(w))) return '클럽';
  if (/칵테일바/.test(c)) return '칵테일바';
  if (only(/하이볼/)) return '하이볼바';
  if (only(/루프탑/)) return '루프탑바';
  if (only(/DJ|음악|바이닐/)) return '음악바';
  if (only(/와인/)) return '와인바';
  if (only(/칵테일|스피크이지|위스키/)) return '칵테일바';
  return '바';
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
export const OWNER_DROP = {
  // ADR-0122 Amendment 1 (배포 전 리뷰 m2, 주인 위임): 「지금 영업」(B)을 근거 글로 확인하지 못한 곳 — 상호가 흔한 낱말이라 블로그 최신 10개가 무관한 글
  'kk-25401003': '케이크샵 — 근거 글이 일기·브라이덜샤워 등 무관, 지금 영업을 확인 못 함(판정은 D1 지식만)',
  'kk-1816476703': '플러스82 — 근거 글이 병원 개원·주식·아파트 등 무관, 지금 영업을 확인 못 함(판정은 D1 지식만)',
  'kk-27302182': '신도시 — 근거 글이 동탄 신도시·유학원 등 무관, 지금 영업을 확인 못 함(판정은 D1 지식만)',
  'kk-1370707722': '파우스트 — 근거 글이 혼술바·클래식 공연 등 무관, 지금 영업을 확인 못 함(판정은 D1 지식만)',
  'kk-1748286862': '멜트 — 근거 제목 다수가 「한강뷰 레스토랑」「야경 디너」, 식사가 주인 레스토랑(기준 A) 경계',
};
function ship() {
  const res = read('audit-03-result.json');
  if (!res?.pass) throw new Error('감사 게이트 미통과 — 싣지 않는다 (criteria-03.md 8절)');
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
    const word = kindOf(p.category, p.name, inputs.get(id).words);
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
  write('ship-03.json', { shipped: add.length, clash, owner, sameName: out, byWord, byWhere });
  console.log(JSON.stringify({ shipped: add.length, clash, owner, sameName: out, byWord, byWhere }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = { cut, sample, result, ship }[process.argv[2]];
  if (!run) {
    console.error('cut | sample | result | ship');
    process.exit(1);
  }
  await run();
}
