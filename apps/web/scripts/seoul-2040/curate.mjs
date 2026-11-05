/**
 * 서울 2040 큐레이팅 (ADR-0119, 사전등록 review/seoul-2040/criteria-01.md).
 *
 *   node scripts/seoul-2040/curate.mjs prep     data/seoul/spots-seoul.json → review/seoul-2040/input/batch-NN.json (먹기 뺀 곳, 묶음 20개)
 *   node scripts/seoul-2040/curate.mjs sample   review/seoul-2040/out/batch-NN.json → audit-01-input.json(라벨 없음) + audit-01-key.json
 *
 * 입력 칸·묶음 나누기·씨앗 섞기는 scripts/seoul-hours/hours.mjs를 복사했다(그 파일은 불러오면 CLI가 돌아 import하지 않는다).
 * 앱 반영(apply)은 감사 뒤 ADR-0119 Amendment로 따로 한다.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dir = resolve(web, 'review/seoul-2040');
const SRC = resolve(web, 'data/seoul/spots-seoul.json');
const CRITERIA = 'review/seoul-2040/criteria-01.md';
export const BATCHES = 20;
export const SEED = 20261107;
export const PER_LABEL = { keep: 30, drop: 30, unsure: 20 };
export const LABELS = ['keep', 'drop', 'unsure'];

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const writeJson = (p, v) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
};

/** 판정자에게 주는 칸: 데이터에 있는 것만. 영업 유형(`opening`)·산행지(`trail`)는 이 질문과 상관없어 주지 않는다. */
function item(x) {
  const o = { id: x.id, name: x.name, area: x.area, lat: +x.lat.toFixed(5), lng: +x.lng.toFixed(5), mood: x.mood };
  if (x.sub) o.sub = x.sub;
  o.indoor = x.indoor;
  o.reason = x.reason;
  if (x.famous) o.famous = true;
  if (x.walkin) o.walkin = true;
  return o;
}

function prep() {
  const raw = readFileSync(SRC);
  const all = JSON.parse(raw);
  const scope = all.filter((x) => x.mood !== 'food');
  const size = Math.ceil(scope.length / BATCHES);
  const files = [];
  for (let b = 0; b < BATCHES; b++) {
    const items = scope.slice(b * size, (b + 1) * size).map(item);
    if (!items.length) break;
    const nn = String(b + 1).padStart(2, '0');
    writeJson(resolve(dir, `input/batch-${nn}.json`), { batch: nn, criteria: CRITERIA, n: items.length, items });
    files.push({ batch: nn, n: items.length });
  }
  const moods = Object.fromEntries(['new', 'rest', 'walk'].map((m) => [m, scope.filter((x) => x.mood === m).length]));
  writeJson(resolve(dir, 'input/index.json'), {
    source: 'data/seoul/spots-seoul.json',
    sha256: createHash('sha256').update(raw).digest('hex'),
    all: all.length,
    excluded: { food: all.length - scope.length },
    scope: scope.length,
    moods,
    batches: files,
  });
  console.log(`서울 ${all.length}곳 중 대상 ${scope.length}곳, 묶음 ${files.length}개 (${files.map((f) => f.n).join('·')})`);
}

/** mulberry32 — 씨앗 고정 의사난수(scripts/seoul-hours/hours.mjs와 같은 식). */
export function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 라벨마다 id 순으로 정렬한 뒤 씨앗 하나로 섞어 앞 PER_LABEL[label]곳(적으면 전부). 라벨 순서는 LABELS 고정. */
export function drawSample(verdicts, seed = SEED, per = PER_LABEL) {
  const rnd = mulberry32(seed);
  const out = [];
  for (const label of LABELS) {
    const a = verdicts.filter((v) => v.label === label).map((v) => v.id).sort();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    out.push(...a.slice(0, per[label]));
  }
  return out;
}

function sample() {
  const inputs = new Map();
  for (const f of readdirSync(resolve(dir, 'input')).filter((f) => /^batch-\d+\.json$/.test(f)).sort())
    for (const x of readJson(resolve(dir, 'input', f)).items) inputs.set(x.id, x);
  const outDir = resolve(dir, 'out');
  const verdicts = readdirSync(outDir)
    .filter((f) => /^batch-\d+\.json$/.test(f))
    .sort()
    .flatMap((f) => readJson(resolve(outDir, f)).items);
  const seen = new Set(verdicts.map((v) => v.id));
  const bad = verdicts.filter((v) => !inputs.has(v.id) || !LABELS.includes(v.label));
  const missing = [...inputs.keys()].filter((id) => !seen.has(id));
  if (bad.length || missing.length || verdicts.length !== inputs.size) {
    console.error(`판정 출력이 입력과 맞지 않음: 잘못 ${bad.length}, 빠짐 ${missing.length}, 판정 ${verdicts.length}/${inputs.size}`);
    process.exit(1);
  }
  const ids = drawSample(verdicts);
  const byId = new Map(verdicts.map((v) => [v.id, v]));
  // 감사자 입력은 라벨·이유 없이 판정 입력과 같은 칸만, 라벨이 드러나지 않게 id 순.
  const blind = [...ids].sort().map((id) => inputs.get(id));
  writeJson(resolve(dir, 'audit-01-input.json'), { seed: SEED, perLabel: PER_LABEL, n: ids.length, criteria: CRITERIA, items: blind });
  const counts = Object.fromEntries(LABELS.map((l) => [l, verdicts.filter((v) => v.label === l).length]));
  writeJson(resolve(dir, 'audit-01-key.json'), { seed: SEED, perLabel: PER_LABEL, counts, items: ids.map((id) => byId.get(id)) });
  console.log(`판정 ${verdicts.length}곳 ${JSON.stringify(counts)} → 감사 표본 ${ids.length}곳`);
}

const cmd = process.argv[2];
if (cmd === 'prep') prep();
else if (cmd === 'sample') sample();
else {
  console.error('prep | sample');
  process.exit(1);
}
