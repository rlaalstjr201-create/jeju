/**
 * 큐레이팅 목적지 판정 도구 (plans/nationwide.md C2). 부산 scripts/busan/judge.mjs와 같은 준비·검사·표본·점수를
 * 목적지·도시로 나눈 것. 판정 자체는 이 스크립트가 하지 않는다(모델 판정, review/<dest>/criteria.md).
 *
 *   npx tsx scripts/curated/judge.mjs prep   gangwon 강릉        → review/gangwon/judge-강릉-01/input-NN.json (50곳씩)
 *   npx tsx scripts/curated/judge.mjs check  gangwon 강릉 [NN]   기계 검사 → judge-강릉-01/check.json (NN이면 그 묶음만)
 *   npx tsx scripts/curated/judge.mjs sample gangwon 강릉        keep 120곳 표본(씨앗 20261030) → audit-강릉-01-sample.json
 *   npx tsx scripts/curated/judge.mjs score  gangwon 강릉        → audit-강릉-01.json
 *   npx tsx scripts/curated/judge.mjs r2     seoul 110          표본의 원문과 이유 문장만 → audit-110-06-r2-input.json (사실 확인 R2 입력)
 *
 * 회차(judge-<도시>-NN)·씨앗·표본에서 뺄 앞 회차 표본은 rounds.mjs.
 * 부산 judge.mjs는 import 때 argv로 명령을 실행해서 가져오지 않고 같은 규칙을 다시 적었다(부산 파일은 건드리지 않는다).
 * tsx로 돌린다(REASON_BANNED가 check-slop.ts에 있다).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REASON_BANNED } from '../check-slop.ts';
import { reasonPunctuationProblem, shipReason } from '../reason.mjs';
import { CRITERIA, SAMPLE_EXCLUDE, SEEDS, WALKIN_ROUNDS, judgeRound } from './rounds.mjs';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export const BATCH_SIZE = 50;
export const SEED = 20261030;
export const SAMPLE_N = 120;
export const THRESHOLDS = { keepMood: 0.9, indoor: 0.95, factErrorsMax: 3, walkin: 0.9 };
/** criteria-06.md 5.2: walkin 일치를 기준으로 재는 최소 쌍 수(그보다 적으면 기록만). */
export const WALKIN_MIN_PAIRS = 10;
export const REJECT_CODES = new Set(['NOT_DESTINATION', 'INSUFFICIENT_INFO', 'CHAIN_GENERIC', 'CLOSED_OR_TEMP', 'OUT_OF_SCOPE', 'INAPPROPRIATE']);
const MOODS = new Set(['rest', 'walk', 'new', 'food']);
const TYPE_NAME = { 12: '관광지', 14: '문화시설', 28: '레포츠', 38: '쇼핑(전통시장)', 39: '음식점' };
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

/** 경로 모음. root는 review 폴더의 부모(테스트에서 바꾼다). */
export function paths(dest, city, root = webRoot, round = judgeRound(city)) {
  const base = resolve(root, 'review', dest);
  return {
    base,
    round,
    seed: SEEDS[round],
    scope: resolve(base, 'scope.json'),
    detail: (contentid) => resolve(base, 'raw', 'detail', `${contentid}.json`),
    judgeDir: resolve(base, `judge-${city}-${round}`),
    sample: resolve(base, `audit-${city}-${round}-sample.json`),
    judgments: resolve(base, `audit-${city}-${round}-judgments.json`),
    facts: resolve(base, `audit-${city}-${round}-facts.json`),
    audit: resolve(base, `audit-${city}-${round}.json`),
    r2: resolve(base, `audit-${city}-${round}-r2-input.json`),
    criteria: CRITERIA[round].replace('<dest>', dest),
    excludeSamples: (SAMPLE_EXCLUDE[city] ?? []).map((r) => resolve(base, `audit-${city}-${r}-sample.json`)),
  };
}

/** 그 도시의 상세가 저장된 곳을 입력 모양으로(종류·id 순). */
export function buildItems(P, city) {
  const scope = readJson(P.scope);
  const items = [];
  for (const it of scope.items) {
    if (it.city !== city) continue;
    const f = P.detail(String(it.id).replace(/^nt-/, ''));
    if (!existsSync(f)) continue;
    const d = readJson(f).body.response.body.items.item[0];
    items.push({
      id: it.id,
      name: cleanName(it.title),
      type: TYPE_NAME[it.contenttypeid],
      contenttypeid: it.contenttypeid,
      cat3: it.cat3 ?? d.cat3 ?? '',
      lclsSystm3: it.lclsSystm3,
      addr: it.addr1,
      overview: norm(d.overview),
    });
  }
  items.sort((a, b) => a.contenttypeid - b.contenttypeid || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return items;
}

export function batchesOf(items) {
  const out = [];
  for (let i = 0; i * BATCH_SIZE < items.length; i++) out.push(items.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE));
  return out;
}

export function inputFiles(P) {
  return readdirSync(P.judgeDir).filter((f) => /^input-\d{2}\.json$/.test(f)).sort();
}
export function loadInputs(P) {
  return inputFiles(P).flatMap((f) => readJson(resolve(P.judgeDir, f)));
}
export function loadVerdicts(P) {
  const out = new Map();
  if (!existsSync(P.judgeDir)) return out;
  for (const f of readdirSync(P.judgeDir).filter((f) => /^out-\d{2}\.json$/.test(f)).sort()) {
    for (const v of readJson(resolve(P.judgeDir, f))) out.set(v.id, v);
  }
  return out;
}

export function prep(P, city) {
  const items = buildItems(P, city);
  const batches = batchesOf(items);
  batches.forEach((b, i) => writeJson(resolve(P.judgeDir, `input-${two(i + 1)}.json`), b));
  console.log(`${city} ${items.length}곳 → ${batches.length}묶음`);
  return batches.length;
}

/** 한 곳의 기계 검사 문제 목록(criteria.md 4절). `walkin` 회차(rounds.mjs WALKIN_ROUNDS)는 `new`·`do`에 참·거짓이 있어야 하고 그 밖에는 없어야 한다. */
export function problems(item, v, round) {
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
  if (WALKIN_ROUNDS.has(round)) {
    if (v.mood === 'new' && v.sub === 'do' && typeof v.walkin !== 'boolean') p.push('new·do에 walkin 없음');
    if (!(v.mood === 'new' && v.sub === 'do') && v.walkin !== undefined) p.push('new·do 아닌 곳에 walkin');
  }
  const r = String(v.reason ?? '');
  if (shipReason(r) !== r) p.push('이유 문장 공백·끝 마침표·돈까스');
  if (len(r) < 15 || len(r) > 70) p.push(`이유 문장 길이 ${len(r)}`);
  const punct = reasonPunctuationProblem(r);
  if (punct) p.push(punct);
  const banned = r.match(REASON_BANNED) ?? r.match(PRACTICAL) ?? r.match(PUNCT);
  if (banned) p.push(`금지 표현: ${banned[0]}`);
  return p;
}

function check(P, batch) {
  if (batch) {
    const inputs = readJson(resolve(P.judgeDir, `input-${batch}.json`));
    const out = resolve(P.judgeDir, `out-${batch}.json`);
    const verdicts = new Map(existsSync(out) ? readJson(out).map((v) => [v.id, v]) : []);
    const bad = inputs.map((i) => ({ i, p: problems(i, verdicts.get(i.id), P.round) })).filter((r) => r.p.length);
    for (const { i, p } of bad) console.log(i.id, i.name, p.join(' / '));
    console.log(`묶음 ${batch}: ${inputs.length}곳, 문제 ${bad.length}곳, 남는 id ${[...verdicts.keys()].filter((id) => !inputs.some((i) => i.id === id)).length}`);
    if (bad.length) process.exitCode = 1;
    return;
  }
  const inputs = loadInputs(P);
  const verdicts = loadVerdicts(P);
  const ids = new Set(inputs.map((i) => i.id));
  const rows = [];
  for (const item of inputs) {
    const p = problems(item, verdicts.get(item.id), P.round);
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
  writeJson(resolve(P.judgeDir, 'check.json'), { ...summary, rows });
  console.log(JSON.stringify(summary));
  for (const r of rows.slice(0, 40)) console.log(r.id, r.name, r.problems.join(' / '));
  if (rows.length || extra.length || !summary.canEndOk) process.exitCode = 1;
}

export function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** keep id를 문자열 오름차순으로 놓고 Fisher–Yates로 섞어 앞 n개(keep이 n보다 적으면 전부). */
export function drawSample(keepIds, seed = SEED, n = SAMPLE_N) {
  const a = [...keepIds].sort();
  const rnd = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

function sample(P) {
  if (existsSync(P.sample)) throw new Error(`${P.sample}이 이미 있다 — 표본은 한 번만 뽑는다`);
  const excluded = new Set((P.excludeSamples ?? []).flatMap((f) => readJson(f).items.map((i) => i.id)));
  const allKeep = [...loadVerdicts(P).values()].filter((v) => v.keep).map((v) => v.id);
  const keepIds = allKeep.filter((id) => !excluded.has(id));
  const byId = new Map(loadInputs(P).map((i) => [i.id, i]));
  const ids = drawSample(keepIds, P.seed);
  const head = excluded.size ? { keepAll: allKeep.length, excludedPriorSamples: allKeep.length - keepIds.length } : {};
  writeJson(P.sample, { seed: P.seed, n: ids.length, from: keepIds.length, ...head, items: ids.map((id) => byId.get(id)) });
  console.log(`keep ${allKeep.length}곳 − 앞 표본 ${allKeep.length - keepIds.length}곳 = ${keepIds.length}곳에서 ${ids.length}곳`);
}

/** 사실 확인(R2) 입력: 표본 곳마다 원문(name·type·cat3·lclsSystm3·addr·overview)과 이유 문장만. keep·기분·실내·근거 조각은 싣지 않는다. */
function r2(P) {
  if (existsSync(P.r2)) throw new Error(`${P.r2}이 이미 있다`);
  const verdicts = loadVerdicts(P);
  const items = readJson(P.sample).items.map(({ id, name, type, cat3, lclsSystm3, addr, overview }) => ({ id, name, type, cat3, lclsSystm3, addr, overview, reason: verdicts.get(id).reason }));
  writeJson(P.r2, items);
  console.log(`${items.length}곳 → ${P.r2}`);
}

/** 임계값은 표본 크기가 120보다 작아도 비율로 잰다(사실 오류만 개수 기준). */
function score(P, city) {
  const sampleFile = readJson(P.sample);
  const verdicts = loadVerdicts(P);
  const judged = new Map(readJson(P.judgments).map((v) => [v.id, v]));
  const facts = new Map(readJson(P.facts).map((v) => [v.id, v]));
  const rows = sampleFile.items.map((item) => {
    const a = verdicts.get(item.id);
    const b = judged.get(item.id);
    const f = facts.get(item.id);
    if (!b || !f) throw new Error(`다시 판정·사실 확인 없음: ${item.id}`);
    return {
      id: item.id,
      name: item.name,
      first: { keep: a.keep, mood: a.mood, sub: a.sub, indoor: a.indoor, reason: a.reason, ...(a.walkin !== undefined ? { walkin: a.walkin } : {}) },
      audit: { keep: b.keep, reject: b.reject, mood: b.mood, sub: b.sub, indoor: b.indoor, ...(b.walkin !== undefined ? { walkin: b.walkin } : {}) },
      keepMoodAgree: b.keep === true && b.mood === a.mood,
      subAgree: b.keep === true && b.mood === a.mood ? b.sub === a.sub : null,
      indoorAgree: b.indoor === a.indoor,
      walkinAgree: b.keep === true && a.mood === 'new' && a.sub === 'do' && b.mood === 'new' && b.sub === 'do' ? b.walkin === a.walkin : null,
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
  // walkin 회차(criteria-06.md 5.2): 둘 다 new·do인 곳에서 walkin 일치 ≥ 90%. 그런 곳이 WALKIN_MIN_PAIRS 미만이면 기록만(약한 증거)
  if (WALKIN_ROUNDS.has(P.round)) {
    const pairs = rows.filter((r) => r.walkinAgree !== null);
    const agree = pairs.filter((r) => r.walkinAgree).length;
    const gated = pairs.length >= WALKIN_MIN_PAIRS;
    metrics.walkin = { agree, of: pairs.length, rate: pairs.length ? +(agree / pairs.length).toFixed(4) : null, threshold: THRESHOLDS.walkin, minPairs: WALKIN_MIN_PAIRS, gated, pass: gated ? agree / pairs.length >= THRESHOLDS.walkin : true };
  }
  const pass = metrics.keepMood.pass && metrics.indoor.pass && metrics.factErrors.pass && (metrics.walkin?.pass ?? true);
  writeJson(P.audit, {
    round: P.round,
    city,
    criteria: P.criteria,
    sample: `audit-${city}-${P.round}-sample.json (seed ${P.seed})`,
    judgments: `audit-${city}-${P.round}-judgments.json`,
    facts: `audit-${city}-${P.round}-facts.json`,
    metrics,
    pass,
    rows,
  });
  console.log(JSON.stringify({ ...metrics, pass }));
}

function main() {
  const [cmd, dest, city, arg] = process.argv.slice(2);
  if (!['prep', 'check', 'sample', 'score', 'r2'].includes(cmd) || !dest || !city) {
    console.error('쓰는 법: judge.mjs prep|check|sample|score|r2 <dest> <도시> [NN]');
    process.exitCode = 2;
    return;
  }
  const P = paths(dest, city);
  if (cmd === 'prep') prep(P, city);
  else if (cmd === 'check') check(P, arg);
  else if (cmd === 'sample') sample(P);
  else if (cmd === 'r2') r2(P);
  else score(P, city);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
