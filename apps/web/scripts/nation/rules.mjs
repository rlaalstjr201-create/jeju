/**
 * 자동 지역 규칙 N2 (plans/nationwide.md, 사전등록 review/nation/rules-criteria.md).
 *
 *   node scripts/nation/rules.mjs apply    scope-*.json → review/nation/rules-01.json(곳마다 keep·기분·실내)
 *   node scripts/nation/rules.mjs sample   keep 200곳 + 뺀 곳 60곳 → review/nation/audit-01-input.json(코드·규칙 결과 없음)
 *   node scripts/nation/rules.mjs score    audit-01-out.json → review/nation/audit-01.json(일치율·통과)
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  } else {
    console.log('apply | sample | score');
  }
}
