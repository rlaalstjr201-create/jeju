/**
 * 자동 지역 규칙 N2 (plans/nationwide.md, 사전등록 review/nation/rules-criteria.md).
 *
 *   node scripts/nation/rules.mjs apply    scope-*.json → review/nation/rules-01.json(곳마다 keep·기분·실내)
 *   node scripts/nation/rules.mjs sample   keep 200곳 + 뺀 곳 60곳 → review/nation/audit-01-input.json(코드·규칙 결과 없음)
 *   node scripts/nation/rules.mjs score    audit-01-out.json → review/nation/audit-01.json(일치율·통과)
 *
 * v2 (ADR-0105, 사전등록 review/nation/rules-criteria-02.md): 쉬기·계곡 놀거리·예약 없이 가는지
 *   node scripts/nation/rules.mjs apply2   → review/nation/rules-02.json
 *   node scripts/nation/rules.mjs sample2  keep 200 + 뺀 곳 60(씨앗 20261103) → audit-02-input.json
 *   node scripts/nation/rules.mjs score2   audit-02-out.json → audit-02.json
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { walkinByRule } from '../walkin.mjs';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dir = resolve(webRoot, 'review/nation');

export const SEED = 20261030;
export const PER_SIDO = 14;
export const EXTRA = 4;
export const REJECT_SAMPLE = 60;
export const THRESHOLDS = { mood: 0.85, indoor: 0.9 };

export const CHAINS = ['스타벅스', '이디야', '투썸', '메가커피', '메가MGC', '빽다방', '컴포즈', '할리스', '커피빈', '엔제리너스', '파스쿠찌', '폴바셋', '맥도날드', '롯데리아', '버거킹', '맘스터치', 'KFC', '서브웨이', '파리바게뜨', '뚜레쥬르', '배스킨라빈스', '던킨', '본죽', '김밥천국', '교촌치킨', 'BBQ', 'bhc'];

// 'LS020100'~'LS020400' 같은 범위를 코드 목록으로 (뒤 여섯 자리가 100씩 는다)
const span = (a, b) => {
  const head = a.slice(0, 2);
  const out = [];
  for (let n = Number(a.slice(2)); n <= Number(b.slice(2)); n += 100) out.push(head + String(n).padStart(6, '0'));
  return out;
};

const row = (mood, sub, indoor, codes) => codes.map((c) => [c, { mood, sub, indoor }]);

/** 3절 표. 머리(FD01 등)로 끝나는 항목은 prefix 규칙으로 따로 둔다. */
export const TABLE = new Map([
  ...row('food', 'meal', true, span('FD030200', 'FD030600')),
  ...row('food', 'cafe', true, ['FD030100']),
  ...row('walk', '', false, ['NA010100', 'NA010200', 'NA010300', 'NA010400', 'NA020100', 'NA020200', 'NA020400', 'NA020500', 'NA020700', 'NA020800', 'NA020900', 'NA030200', 'NA030300', 'NA030400', 'NA030500', ...span('NA040100', 'NA040400'), 'NA040500', 'NA040600', 'NA040700', 'NA050100', 'VE010200', 'VE010300', 'VE010400', 'VE010700', 'VE010800', 'VE030100', 'VE030200', 'VE030400', 'VE030500', 'VE040100', 'VE040300', 'HS010200']),
  ...row('new', 'sight', false, ['HS010100', 'HS010300', 'HS010400', 'HS010500', 'HS010600', 'HS010700', 'HS010800', 'HS011000', 'HS011100', 'HS011200', 'HS020300', 'HS030100', 'HS030200', 'HS030400', ...span('HS040100', 'HS040400'), 'NA030100', 'VE010100', 'VE010900', 'VE020100', 'VE020200', 'VE020300', 'VE040200', 'VE050100', 'SH060100', 'SH060200']),
  ...row('new', 'sight', true, ['VE020400', 'VE020500', 'VE060100', 'VE070100', 'VE070200', 'VE070300', 'VE070500', 'VE070600', 'VE090400', 'VE120100', 'VE120300']),
  ...row('new', 'do', false, ['EX010100', 'EX030100', 'EX030200', 'EX030300', 'EX030400', 'EX040100', 'EX040200', ...span('EX060100', 'EX061000').filter((c) => c !== 'EX060800'), 'EX070100', 'EX070200', 'LS010100', 'LS010200', 'LS010300', 'LS010700', 'LS010800', 'LS011000', 'LS011300', 'LS011500', 'LS011600', 'LS011800', 'LS011900', ...span('LS020100', 'LS020400'), 'LS020600', 'LS020800', 'LS021100', 'LS021300', 'LS021400', ...span('LS030100', 'LS030600'), 'LS040100']),
  ...row('new', 'do', true, [...span('EX020100', 'EX020400'), ...span('EX050100', 'EX050600'), 'EX060800', 'LS010900', 'LS011200', 'LS020700']),
]);

const PREFIX = [
  ['FD040', null],
  ['FD01', { mood: 'food', sub: 'meal', indoor: true }],
  ['FD02', { mood: 'food', sub: 'meal', indoor: true }],
  ['FD05', { mood: 'food', sub: 'cafe', indoor: true }],
];

export const isChain = (title) => {
  const t = String(title).replace(/\s+/g, '');
  return CHAINS.some((c) => t.toLowerCase().includes(c.toLowerCase()));
};

/** 한 곳의 규칙 결과. */
export function judge(item) {
  if (isChain(item.title)) return { id: item.id, keep: false, reject: 'CHAIN' };
  const code = String(item.lclsSystm3 || '');
  if (Number(item.contenttypeid) === 39) {
    if (code.startsWith('FD040')) return { id: item.id, keep: false, reject: 'EXCLUDED' };
    const cafe = code.startsWith('FD05') || code === 'FD030100';
    return { id: item.id, keep: true, mood: 'food', sub: cafe ? 'cafe' : 'meal', indoor: true, rule: code || '39' };
  }
  let hit = TABLE.get(code);
  if (!hit) {
    for (const [p, v] of PREFIX) {
      if (code.startsWith(p)) {
        hit = v;
        break;
      }
    }
    if (hit === null) return { id: item.id, keep: false, reject: 'EXCLUDED' };
  }
  if (!hit) return { id: item.id, keep: false, reject: code && isExcluded(code) ? 'EXCLUDED' : 'UNMAPPED' };
  return { id: item.id, keep: true, mood: hit.mood, sub: hit.sub, indoor: hit.indoor, rule: code };
}

/** v2 2절: 쉬기(실내 아님) */
export const REST_CODES = new Set(['NA010300', 'NA020100', 'NA020200', 'NA020400', 'NA020500', 'NA020700', 'NA020800', 'NA020900', 'NA030300', 'VE010200', 'VE010800', 'VE030100', 'VE030200', 'VE030400', 'VE030500']);
/** v2 2절: 쉬기(실내) — 온천·사우나·스파, 찜질방 */
export const REST_INDOOR_CODES = new Set(['EX050100', 'EX050200']);
export const SEED2 = 20261103;
export const THRESHOLDS2 = { mood: 0.85, indoor: 0.9, walkin: 0.85 };

/** v2 한 곳의 규칙 결과: v1 위에 2절(쉬기·계곡)과 3절(예약)을 얹는다. */
export function judge2(item) {
  const r = judge(item);
  if (!r.keep) return r;
  if (REST_CODES.has(r.rule)) return { ...r, mood: 'rest', sub: '', indoor: false };
  if (REST_INDOOR_CODES.has(r.rule)) return { ...r, mood: 'rest', sub: '', indoor: true };
  if (r.rule === 'NA010400') return { ...r, mood: 'new', sub: 'do', indoor: false, walkin: true };
  if (r.mood === 'new' && r.sub === 'do') {
    if (walkinByRule(r.rule, item.title) === false) return { id: item.id, keep: false, reject: 'BOOKING' };
    return { ...r, walkin: true };
  }
  return r;
}

/** v2 4절: v1 지표 + 예약 일치(규칙 do = true, BOOKING = false; 판정자가 walkin을 적은 곳) */
export function score2(results, out) {
  const s = score(results, out);
  const rule = new Map(results.map((r) => [r.id, r]));
  let wN = 0;
  let wSame = 0;
  let restN = 0;
  let restSame = 0;
  const misses = [...s.misses];
  for (const o of out) {
    const r = rule.get(o.id);
    if (!r) continue;
    const mine = r.keep && r.mood === 'new' && r.sub === 'do' ? true : r.reject === 'BOOKING' ? false : null;
    if (mine !== null && typeof o.walkin === 'boolean' && !o.unsure) {
      wN++;
      if (o.walkin === mine) wSame++;
      else misses.push({ id: o.id, what: 'walkin', rule: mine, judge: o.walkin, code: r.rule });
    }
    if (r.keep && r.mood === 'rest' && o.keep && !o.unsure) {
      restN++;
      if (o.mood === 'rest') restSame++;
    }
  }
  const rate = (a, b) => (b ? a / b : 0);
  return {
    ...s,
    mood: { ...s.mood, pass: s.mood.rate >= THRESHOLDS2.mood },
    indoor: { ...s.indoor, pass: s.indoor.rate >= THRESHOLDS2.indoor },
    walkin: { same: wSame, of: wN, rate: rate(wSame, wN), pass: rate(wSame, wN) >= THRESHOLDS2.walkin },
    rest: { same: restSame, of: restN, rate: rate(restSame, restN) },
    misses,
  };
}

/** v3 2절(rules-criteria-03.md): v2가 예약 없이 가는 놀거리로 둔 곳 가운데 예약해야만 하는 무리. 순서가 규칙이다. */
const SCHOOLS = /대학교|초등학교|중학교|고등학교/g;
const BREW = /양조|주조|도가|공장|브루어리|체험장|체험관|체험촌/;
const FARM_OPEN = /정원|가든|테마파크|생태나라|단지|동물농장|아기동물|곤충|허브팜/;
export const V3_GROUPS = ['N', 'Y', 'R', 'H', 'W', 'B', 'F'];
/** 한 곳이 드는 v3 무리(없으면 null)와 그 무리의 결과(true: 예약해야만 함). */
export function group3(code, title) {
  const t = String(title ?? '').replace(/\s+/g, '');
  if (/학교|아카데미|투어|체험마을/.test(t.replace(SCHOOLS, ''))) return { g: 'N', booking: true };
  const byCode = { LS020300: 'Y', LS020800: 'R', LS010700: 'H', LS020100: 'W' }[code];
  if (byCode) return { g: byCode, booking: true };
  if (code === 'EX060800') return { g: 'B', booking: BREW.test(t) };
  if (code === 'EX030300') return { g: 'F', booking: !FARM_OPEN.test(t) };
  return null;
}
/** 감사(audit-03)를 넘어 싣는 무리. 결과를 보고 rules-criteria-03.md 5절대로 정한다. */
export const V3_SHIPPED = ['N', 'Y', 'B', 'F'];
export const SEED3 = 20261105;

/** v3 한 곳의 규칙 결과: v2 위에 `groups`의 줄을 얹는다(계곡은 v2 그대로). */
export function judge3(item, groups = V3_SHIPPED) {
  const r = judge2(item);
  if (!r.keep || r.mood !== 'new' || r.sub !== 'do' || r.rule === 'NA010400') return r;
  const hit = group3(r.rule, item.title);
  if (hit?.booking && groups.includes(hit.g)) return { id: item.id, keep: false, reject: 'BOOKING' };
  return r;
}

const EXCLUDED = ['AC', 'FD040', 'HS010900', 'HS020100', 'HS020200', 'HS020400', 'NA010500', 'NA020300', 'NA020600', 'VE010500', 'VE010600', 'VE030300', 'VE050200', 'VE060200', 'VE070400', 'VE090100', 'VE090200', 'VE090300', 'VE090600', 'VE100', 'VE110', 'VE120200', 'LS010400', 'LS010500', 'LS010600', 'LS020500', 'EX050700', 'EX050800'];
export const isExcluded = (code) => EXCLUDED.some((p) => code.startsWith(p));

/** 결정적 섞기(mulberry32). */
export function shuffle(list, seed = SEED) {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const TYPE_NAME = { 12: '관광지', 14: '문화시설', 28: '레포츠', 38: '쇼핑', 39: '음식점' };
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const writeJson = (p, v) => writeFileSync(p, JSON.stringify(v, null, 1) + '\n');

export function loadScopes(root = dir) {
  return readdirSync(root)
    .filter((f) => /^scope-\d+\.json$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
    .map((f) => readJson(resolve(root, f)));
}

/** 표본: keep에서 시도마다 PER_SIDO곳 + 남은 keep에서 EXTRA곳, 뺀 곳에서 REJECT_SAMPLE곳. */
export function sample(scopes, results, seed = SEED) {
  const byId = new Map(results.map((r) => [r.id, r]));
  const picked = [];
  const left = [];
  for (const s of scopes) {
    const kept = shuffle(s.items.filter((i) => byId.get(i.id)?.keep), seed);
    picked.push(...kept.slice(0, PER_SIDO));
    left.push(...kept.slice(PER_SIDO));
  }
  picked.push(...shuffle(left, seed).slice(0, EXTRA));
  const rejected = shuffle(scopes.flatMap((s) => s.items.filter((i) => !byId.get(i.id)?.keep)), seed).slice(0, REJECT_SAMPLE);
  const strip = (i) => ({ id: i.id, title: i.title, addr1: i.addr1, type: TYPE_NAME[i.contenttypeid] ?? String(i.contenttypeid) });
  // 판정자가 keep/뺌 묶음을 알지 못하게 한 줄로 섞는다
  return shuffle([...picked, ...rejected], seed + 1).map(strip);
}

/** 일치율. out: 판정자 출력 배열. */
export function score(results, out) {
  const rule = new Map(results.map((r) => [r.id, r]));
  let keepSame = 0;
  let n = 0;
  let moodN = 0;
  let moodSame = 0;
  let indoorSame = 0;
  let ruleIndoor = 0;
  let wetMiss = 0;
  const misses = [];
  for (const o of out) {
    const r = rule.get(o.id);
    if (!r) continue;
    n++;
    if (Boolean(o.keep) === r.keep) keepSame++;
    if (!r.keep || !o.keep || o.unsure) continue;
    moodN++;
    if (o.mood === r.mood) moodSame++;
    else misses.push({ id: o.id, what: 'mood', rule: r.mood, judge: o.mood, code: r.rule });
    if (Boolean(o.indoor) === r.indoor) indoorSame++;
    else misses.push({ id: o.id, what: 'indoor', rule: r.indoor, judge: Boolean(o.indoor), code: r.rule });
    if (r.indoor) {
      ruleIndoor++;
      if (!o.indoor) wetMiss++;
    }
  }
  const mood = moodN ? moodSame / moodN : 0;
  const indoor = moodN ? indoorSame / moodN : 0;
  return {
    n,
    compared: moodN,
    mood: { same: moodSame, of: moodN, rate: mood, pass: mood >= THRESHOLDS.mood },
    indoor: { same: indoorSame, of: moodN, rate: indoor, pass: indoor >= THRESHOLDS.indoor },
    wetMiss: { count: wetMiss, of: ruleIndoor, rate: ruleIndoor ? wetMiss / ruleIndoor : 0 },
    keep: { same: keepSame, of: n, rate: n ? keepSame / n : 0 },
    misses,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2];
  const scopes = loadScopes();
  if (cmd === 'apply') {
    const results = scopes.flatMap((s) => s.items.map(judge));
    const count = (f) => results.filter(f).length;
    const summary = {
      criteria: 'review/nation/rules-criteria.md',
      total: results.length,
      keep: count((r) => r.keep),
      byMood: Object.fromEntries(['food', 'walk', 'new'].map((m) => [m, count((r) => r.keep && r.mood === m)])),
      indoor: count((r) => r.keep && r.indoor),
      reject: Object.fromEntries(['CHAIN', 'EXCLUDED', 'UNMAPPED'].map((k) => [k, count((r) => r.reject === k)])),
    };
    writeJson(resolve(dir, 'rules-01.json'), { ...summary, results });
    console.log(JSON.stringify(summary, null, 1));
  } else if (cmd === 'sample') {
    const { results } = readJson(resolve(dir, 'rules-01.json'));
    const input = sample(scopes, results);
    writeJson(resolve(dir, 'audit-01-input.json'), input);
    console.log(`표본 ${input.length}곳`);
  } else if (cmd === 'score') {
    const { results } = readJson(resolve(dir, 'rules-01.json'));
    const outPath = resolve(dir, 'audit-01-out.json');
    if (!existsSync(outPath)) throw new Error('audit-01-out.json 없음');
    const s = score(results, readJson(outPath));
    writeJson(resolve(dir, 'audit-01.json'), s);
    const { misses, ...head } = s;
    console.log(JSON.stringify(head, null, 1), `\n틀린 곳 ${misses.length}`);
  } else if (cmd === 'apply2') {
    const results = scopes.flatMap((s) => s.items.map(judge2));
    const count = (f) => results.filter(f).length;
    const summary = {
      criteria: 'review/nation/rules-criteria-02.md',
      total: results.length,
      keep: count((r) => r.keep),
      byMood: Object.fromEntries(['food', 'rest', 'walk', 'new'].map((m) => [m, count((r) => r.keep && r.mood === m)])),
      newDo: count((r) => r.keep && r.mood === 'new' && r.sub === 'do'),
      indoor: count((r) => r.keep && r.indoor),
      reject: Object.fromEntries(['CHAIN', 'EXCLUDED', 'UNMAPPED', 'BOOKING'].map((k) => [k, count((r) => r.reject === k)])),
    };
    writeJson(resolve(dir, 'rules-02.json'), { ...summary, results });
    console.log(JSON.stringify(summary, null, 1));
  } else if (cmd === 'sample2') {
    const out = resolve(dir, 'audit-02-input.json');
    if (existsSync(out)) throw new Error('audit-02-input.json이 이미 있다 — 표본은 한 번만 뽑는다');
    const { results } = readJson(resolve(dir, 'rules-02.json'));
    const input = sample(scopes, results, SEED2);
    writeJson(out, input);
    console.log(`표본 ${input.length}곳`);
  } else if (cmd === 'score2') {
    const { results } = readJson(resolve(dir, 'rules-02.json'));
    const s = score2(results, readJson(resolve(dir, 'audit-02-out.json')));
    writeJson(resolve(dir, 'audit-02.json'), s);
    const { misses, ...head } = s;
    console.log(JSON.stringify(head, null, 1), `\n틀린 곳 ${misses.length}`);
  } else if (cmd === 'sample3') {
    const out = resolve(dir, 'audit-03-input.json');
    if (existsSync(out)) throw new Error('audit-03-input.json이 이미 있다 — 표본은 한 번만 뽑는다');
    const v2 = new Map(readJson(resolve(dir, 'rules-02.json')).results.map((r) => [r.id, r]));
    const kinds = readJson(resolve(dir, 'categories.json')).lclsSystm3;
    const byGroup = Object.fromEntries(V3_GROUPS.map((g) => [g, []]));
    for (const i of scopes.flatMap((s) => s.items)) {
      const r = v2.get(i.id);
      if (!r?.keep || r.mood !== 'new' || r.sub !== 'do' || r.rule === 'NA010400') continue;
      const hit = group3(r.rule, i.title);
      if (hit) byGroup[hit.g].push(i);
    }
    const picked = [];
    const counts = {};
    for (const g of V3_GROUPS) {
      const list = [...byGroup[g]].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const take = shuffle(list, SEED3).slice(0, g === 'F' ? 40 : 25);
      counts[g] = { population: list.length, sample: take.length };
      picked.push(...take);
    }
    const strip = (i) => ({ id: i.id, title: i.title, addr1: i.addr1, type: TYPE_NAME[i.contenttypeid] ?? String(i.contenttypeid), kind: kinds[i.lclsSystm3]?.name ?? '' });
    const input = shuffle(picked, SEED3 + 1).map(strip);
    writeJson(out, input);
    console.log(`표본 ${input.length}곳`, JSON.stringify(counts));
  } else if (cmd === 'score3') {
    const v2 = new Map(readJson(resolve(dir, 'rules-02.json')).results.map((r) => [r.id, r]));
    const items = new Map(scopes.flatMap((s) => s.items).map((i) => [i.id, i]));
    const groups = Object.fromEntries(V3_GROUPS.map((g) => [g, { n: 0, v3: 0, v2: 0, unsure: 0 }]));
    const misses = [];
    for (const o of readJson(resolve(dir, 'audit-03-out.json'))) {
      const i = items.get(o.id);
      const hit = group3(v2.get(o.id).rule, i.title);
      const s = groups[hit.g];
      if (o.unsure || typeof o.walkin !== 'boolean') {
        s.unsure++;
        continue;
      }
      s.n++;
      const v3Walkin = !hit.booking;
      if (o.walkin === v3Walkin) s.v3++;
      else misses.push({ id: o.id, title: i.title, group: hit.g, rule: v3Walkin, judge: o.walkin });
      if (o.walkin === true) s.v2++;
    }
    const rate = (a, b) => (b ? a / b : 0);
    for (const s of Object.values(groups)) {
      s.v3Rate = rate(s.v3, s.n);
      s.v2Rate = rate(s.v2, s.n);
      s.pass = s.n >= 10 && s.v3Rate >= 0.85 && s.v3Rate > s.v2Rate;
    }
    const all = Object.values(groups).reduce((a, s) => ({ n: a.n + s.n, v3: a.v3 + s.v3, v2: a.v2 + s.v2 }), { n: 0, v3: 0, v2: 0 });
    const result = { criteria: 'review/nation/rules-criteria-03.md', groups, all: { ...all, v3Rate: rate(all.v3, all.n), v2Rate: rate(all.v2, all.n) }, misses };
    writeJson(resolve(dir, 'audit-03.json'), result);
    const { misses: m, ...head } = result;
    console.log(JSON.stringify(head, null, 1), `\n틀린 곳 ${m.length}`);
  } else if (cmd === 'apply3') {
    const results = scopes.flatMap((s) => s.items.map((i) => judge3(i)));
    const count = (f) => results.filter(f).length;
    const summary = {
      criteria: 'review/nation/rules-criteria-03.md',
      groups: V3_SHIPPED,
      total: results.length,
      keep: count((r) => r.keep),
      byMood: Object.fromEntries(['food', 'rest', 'walk', 'new'].map((m) => [m, count((r) => r.keep && r.mood === m)])),
      newDo: count((r) => r.keep && r.mood === 'new' && r.sub === 'do'),
      indoor: count((r) => r.keep && r.indoor),
      reject: Object.fromEntries(['CHAIN', 'EXCLUDED', 'UNMAPPED', 'BOOKING'].map((k) => [k, count((r) => r.reject === k)])),
    };
    writeJson(resolve(dir, 'rules-03.json'), { ...summary, results });
    console.log(JSON.stringify(summary, null, 1));
  } else {
    console.log('apply | sample | score | apply2 | sample2 | score2 | sample3 | score3 | apply3');
  }
}
