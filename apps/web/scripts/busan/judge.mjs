/**
 * 부산 판정 S3 (plans/busan.md S3, specs/busan.md 3.3, 사전등록 review/busan/criteria.md).
 *
 *   npx tsx scripts/busan/judge.mjs prep     raw/ + scope.json → review/busan/judge-01/input-NN.json (50곳씩)
 *   npx tsx scripts/busan/judge.mjs check [NN] out-NN.json 기계 검사(누락·값·근거 조각 원문 대조·이유 문장 규칙) → check.json
 *   npx tsx scripts/busan/judge.mjs sample   keep 120곳 표본(씨앗 20261019) → review/busan/audit-01-sample.json
 *   npx tsx scripts/busan/judge.mjs score    판정·다시 판정·사실 확인 → review/busan/audit-01.json(일치율·통과)
 *
 * 판정 자체는 이 스크립트가 하지 않는다(모델 판정, criteria.md 4절). 원문은 내부용이고 출하 파일에 옮기지 않는다.
 * tsx로 돌린다(REASON_BANNED가 check-slop.ts에 있다).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REASON_BANNED } from '../check-slop.ts';
import { reasonPunctuationProblem, shipReason } from '../reason.mjs';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const busan = resolve(webRoot, 'review/busan');
const judgeDir = resolve(busan, 'judge-01');

export const BATCH_SIZE = 50;
export const SEED = 20261019;
export const SAMPLE_N = 120;
export const THRESHOLDS = { keepMood: 0.9, indoor: 0.95, factErrorsMax: 3 };
export const REJECT_CODES = new Set(['NOT_DESTINATION', 'INSUFFICIENT_INFO', 'CHAIN_GENERIC', 'CLOSED_OR_TEMP', 'OUT_OF_SCOPE', 'INAPPROPRIATE']);
const MOODS = new Set(['rest', 'walk', 'new', 'food']);
const TYPE_NAME = { 12: '관광지', 14: '문화시설', 28: '레포츠', 38: '쇼핑(전통시장)', 39: '음식점' };
// build-spots.mjs BANNED_REASON_PATTERN과 같은 식(가격·운영시간·요일·평점)
const PRACTICAL = /\d[\d,]*\s*(원|천원)|입장료|요금|무료|영업|휴무|\d{1,2}:\d{2}|오전\s*\d|오후\s*\d|\d+시(부터|까지)|오픈|평점|별점|월요일|화요일|수요일|목요일|금요일|토요일|일요일|매주|정기휴무/;
const PUNCT = /[!?！？—–]/;
const len = (s) => [...s].length;
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const cleanName = (s) => String(s).replace(/\s+/g, ' ').trim();
const two = (n) => String(n).padStart(2, '0');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const writeJson = (p, v) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(v, null, 1) + '\n');
};

export function inputFiles() {
  return readdirSync(judgeDir).filter((f) => /^input-\d{2}\.json$/.test(f)).sort();
}

export function loadInputs() {
  return inputFiles().flatMap((f) => readJson(resolve(judgeDir, f)));
}

export function loadVerdicts() {
  const out = new Map();
  for (const f of readdirSync(judgeDir).filter((f) => /^out-\d{2}\.json$/.test(f)).sort()) {
    for (const v of readJson(resolve(judgeDir, f))) out.set(v.id, v);
  }
  return out;
}

function prep() {
  const scope = readJson(resolve(busan, 'scope.json'));
  const items = scope.items.map((it) => {
    const d = readJson(resolve(busan, 'raw/detail', `${it.contentid}.json`)).body.response.body.items.item[0];
    return {
      id: it.id,
      name: cleanName(it.title),
      type: TYPE_NAME[it.contenttypeid],
      contenttypeid: it.contenttypeid,
      cat3: it.cat3,
      lclsSystm3: it.lclsSystm3,
      addr: it.addr1,
      overview: norm(d.overview),
    };
  });
  items.sort((a, b) => a.contenttypeid - b.contenttypeid || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (let i = 0; i * BATCH_SIZE < items.length; i++) {
    writeJson(resolve(judgeDir, `input-${two(i + 1)}.json`), items.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE));
  }
  console.log(`${items.length}곳 → ${Math.ceil(items.length / BATCH_SIZE)}묶음`);
}

/** 한 곳의 기계 검사 문제 목록(criteria.md 5절). */
export function problems(item, v) {
  const p = [];
  if (!v) return ['판정 없음'];
  if (v.name !== item.name) p.push('name이 입력과 다름');
  if (typeof v.keep !== 'boolean') p.push('keep 없음');
  if (!['high', 'low'].includes(v.confidence)) p.push('confidence 값');
  if (!Array.isArray(v.basis)) p.push('basis 배열 아님');
  const src = norm(item.overview);
  for (const b of v.basis ?? []) {
    if (len(b) > 40) p.push(`근거 조각 40자 넘음: ${b}`);
    if (!src.includes(norm(b)) && !item.name.includes(norm(b))) p.push(`근거 조각이 원문에 없음: ${b}`);
  }
  if (v.keep === false) {
    if (!REJECT_CODES.has(v.reject)) p.push(`reject 코드: ${v.reject}`);
    return p;
  }
  if (!MOODS.has(v.mood)) p.push(`mood: ${v.mood}`);
  if (typeof v.indoor !== 'boolean') p.push('indoor 없음');
  if (item.contenttypeid === 39 && v.mood !== 'food') p.push('음식점인데 food 아님');
  if (item.contenttypeid === 38 && !(v.mood === 'new' && v.sub === 'sight')) p.push('시장은 new·sight');
  if (v.mood === 'food' && !['meal', 'cafe'].includes(v.sub)) p.push(`food sub: ${v.sub}`);
  if (v.mood === 'new' && !['sight', 'do'].includes(v.sub)) p.push(`new sub: ${v.sub}`);
  if ((v.mood === 'rest' || v.mood === 'walk') && v.sub !== undefined) p.push('rest·walk에 sub');
  if ((v.basis ?? []).length < 1 || (v.basis ?? []).length > 3) p.push('keep은 근거 조각 1~3개');
  const r = String(v.reason ?? '');
  if (shipReason(r) !== r) p.push('이유 문장 공백·끝 마침표·돈까스');
  if (len(r) < 15 || len(r) > 70) p.push(`이유 문장 길이 ${len(r)}`);
  const punct = reasonPunctuationProblem(r);
  if (punct) p.push(punct);
  const banned = r.match(REASON_BANNED) ?? r.match(PRACTICAL) ?? r.match(PUNCT);
  if (banned) p.push(`금지 표현: ${banned[0]}`);
  return p;
}

function check(batch) {
  if (batch) {
    // 묶음 하나만(판정 에이전트가 제 묶음을 볼 때). check.json은 쓰지 않는다.
    const inputs = readJson(resolve(judgeDir, `input-${batch}.json`));
    const out = resolve(judgeDir, `out-${batch}.json`);
    const verdicts = new Map(existsSync(out) ? readJson(out).map((v) => [v.id, v]) : []);
    const bad = inputs.map((i) => ({ i, p: problems(i, verdicts.get(i.id)) })).filter((r) => r.p.length);
    for (const { i, p } of bad) console.log(i.id, i.name, p.join(' / '));
    console.log(`묶음 ${batch}: ${inputs.length}곳, 문제 ${bad.length}곳, 남는 id ${[...verdicts.keys()].filter((id) => !inputs.some((i) => i.id === id)).length}`);
    if (bad.length) process.exitCode = 1;
    return;
  }
  const inputs = loadInputs();
  const verdicts = loadVerdicts();
  const ids = new Set(inputs.map((i) => i.id));
  const rows = [];
  for (const item of inputs) {
    const p = problems(item, verdicts.get(item.id));
    if (p.length) rows.push({ id: item.id, name: item.name, problems: p });
  }
  const extra = [...verdicts.keys()].filter((id) => !ids.has(id));
  const kept = [...verdicts.values()].filter((v) => v.keep && ids.has(v.id));
  const canEnd = kept.filter((v) => /수 있어요$/.test(v.reason ?? '')).length;
  const summary = {
    inputs: inputs.length,
    verdicts: verdicts.size,
    extra,
    problemPlaces: rows.length,
    keep: kept.length,
    reject: [...verdicts.values()].filter((v) => v.keep === false && ids.has(v.id)).length,
    canEndShare: kept.length ? +(canEnd / kept.length).toFixed(4) : 0,
    canEndOk: kept.length ? canEnd / kept.length <= 0.2 : true,
  };
  writeJson(resolve(judgeDir, 'check.json'), { ...summary, rows });
  console.log(JSON.stringify(summary));
  for (const r of rows.slice(0, 40)) console.log(r.id, r.name, r.problems.join(' / '));
  if (rows.length || extra.length || !summary.canEndOk) process.exitCode = 1;
}

/** mulberry32 — 씨앗 고정 의사난수. */
export function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** keep id를 문자열 오름차순으로 놓고 Fisher–Yates로 섞어 앞 n개. */
export function drawSample(keepIds, seed = SEED, n = SAMPLE_N) {
  const a = [...keepIds].sort();
  const rnd = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

function sample() {
  const out = resolve(busan, 'audit-01-sample.json');
  if (existsSync(out)) throw new Error('audit-01-sample.json이 이미 있다 — 표본은 한 번만 뽑는다');
  const keepIds = [...loadVerdicts().values()].filter((v) => v.keep).map((v) => v.id);
  const byId = new Map(loadInputs().map((i) => [i.id, i]));
  const ids = drawSample(keepIds);
  // 다시 판정하는 쪽이 보는 것: 입력 원문뿐(판정·이유 문장 없음)
  writeJson(out, { seed: SEED, n: ids.length, from: keepIds.length, items: ids.map((id) => byId.get(id)) });
  console.log(`keep ${keepIds.length}곳에서 ${ids.length}곳`);
}

function score() {
  const sampleFile = readJson(resolve(busan, 'audit-01-sample.json'));
  const verdicts = loadVerdicts();
  const judged = new Map(readJson(resolve(busan, 'audit-01-judgments.json')).map((v) => [v.id, v]));
  const facts = new Map(readJson(resolve(busan, 'audit-01-facts.json')).map((v) => [v.id, v]));
  const rows = sampleFile.items.map((item) => {
    const a = verdicts.get(item.id);
    const b = judged.get(item.id);
    const f = facts.get(item.id);
    if (!b || !f) throw new Error(`다시 판정·사실 확인 없음: ${item.id}`);
    return {
      id: item.id,
      name: item.name,
      first: { keep: a.keep, mood: a.mood, sub: a.sub, indoor: a.indoor, reason: a.reason },
      audit: { keep: b.keep, reject: b.reject, mood: b.mood, sub: b.sub, indoor: b.indoor },
      keepMoodAgree: b.keep === true && b.mood === a.mood,
      subAgree: b.keep === true && b.mood === a.mood ? b.sub === a.sub : null,
      indoorAgree: b.indoor === a.indoor,
      factError: f.factError === true,
      factNote: f.note ?? '',
    };
  });
  const n = rows.length;
  const keepMood = rows.filter((r) => r.keepMoodAgree).length;
  const keepOnly = rows.filter((r) => r.audit.keep === true).length;
  const indoor = rows.filter((r) => r.indoorAgree).length;
  const factErrors = rows.filter((r) => r.factError).length;
  const subRows = rows.filter((r) => r.subAgree !== null && r.first.sub !== undefined);
  const metrics = {
    n,
    keepMood: { agree: keepMood, rate: +(keepMood / n).toFixed(4), threshold: THRESHOLDS.keepMood, pass: keepMood / n >= THRESHOLDS.keepMood },
    keepOnly: { agree: keepOnly, rate: +(keepOnly / n).toFixed(4), note: '기록만' },
    indoor: { agree: indoor, rate: +(indoor / n).toFixed(4), threshold: THRESHOLDS.indoor, pass: indoor / n >= THRESHOLDS.indoor },
    factErrors: { count: factErrors, max: THRESHOLDS.factErrorsMax, pass: factErrors <= THRESHOLDS.factErrorsMax },
    sub: { agree: subRows.filter((r) => r.subAgree).length, of: subRows.length, note: '기록만' },
  };
  const pass = metrics.keepMood.pass && metrics.indoor.pass && metrics.factErrors.pass;
  writeJson(resolve(busan, 'audit-01.json'), {
    round: '01',
    criteria: 'review/busan/criteria.md',
    sample: `audit-01-sample.json (seed ${SEED})`,
    judgments: 'audit-01-judgments.json',
    facts: 'audit-01-facts.json',
    metrics,
    pass,
    rows,
  });
  console.log(JSON.stringify({ ...metrics, pass }));
}

const cmd = process.argv[2];
if (cmd === 'prep') prep();
else if (cmd === 'check') check(process.argv[3]);
else if (cmd === 'sample') sample();
else if (cmd === 'score') score();
else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.error('쓰는 법: judge.mjs prep|check|sample|score');
  process.exitCode = 2;
}
