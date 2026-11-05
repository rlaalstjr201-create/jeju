/**
 * 서울 장소 영업 유형 S1.5 (사전등록 review/seoul-hours/criteria-01.md).
 *
 *   node scripts/seoul-hours/hours.mjs prep     data/seoul/spots-seoul.json → review/seoul-hours/input/batch-NN.json (먹기 뺀 곳, 묶음 20개)
 *   node scripts/seoul-hours/hours.mjs sample   review/seoul-hours/out/batch-NN.json → audit-01-input.json(라벨 없음) + audit-01-key.json
 *   node scripts/seoul-hours/hours.mjs apply    review/seoul-hours/out/batch-NN.json → data/seoul/spots-seoul.json 각 곳의 `opening`
 *                                               (§8, ADR-0117 Amendment 7 — 서울 목록을 다시 만들면 다시 돌린다)
 *   node scripts/seoul-hours/hours.mjs trail    data/seoul/spots-seoul.json의 야외 산행지 → review/seoul-hours/trail-01.json + 각 곳의 `trail`
 *                                               (ADR-0117 Amendment 9 — 이름 규칙, 서울 목록을 다시 만들면 다시 돌린다)
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dir = resolve(web, 'review/seoul-hours');
const SRC = resolve(web, 'data/seoul/spots-seoul.json');
export const BATCHES = 20;
export const SEED = 20261106;
export const PER_LABEL = 20;
export const LABELS = ['day-viewing', 'palace', 'always', 'evening', 'unknown'];

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const writeJson = (p, v) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
};

/** 판정자에게 주는 칸: 데이터에 있는 것만(주소 칸은 없다 — 구와 좌표가 대신). */
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
    writeJson(resolve(dir, `input/batch-${nn}.json`), { batch: nn, criteria: 'review/seoul-hours/criteria-01.md', n: items.length, items });
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

/** mulberry32 — 씨앗 고정 의사난수(scripts/busan/judge.mjs와 같은 식). */
export function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 라벨마다 id 순으로 정렬한 뒤 씨앗 하나로 섞어 앞 PER_LABEL곳(적으면 전부). 라벨 순서는 LABELS 고정. */
export function drawSample(verdicts, seed = SEED, per = PER_LABEL) {
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
  // 감사자 입력은 라벨·시간·이유 없이 판정 입력과 같은 칸만, 라벨이 드러나지 않게 id 순.
  const blind = [...ids].sort().map((id) => inputs.get(id));
  writeJson(resolve(dir, 'audit-01-input.json'), { seed: SEED, perLabel: PER_LABEL, n: ids.length, criteria: 'review/seoul-hours/criteria-01.md', items: blind });
  const counts = Object.fromEntries(LABELS.map((l) => [l, verdicts.filter((v) => v.label === l).length]));
  writeJson(resolve(dir, 'audit-01-key.json'), { seed: SEED, perLabel: PER_LABEL, counts, items: ids.map((id) => byId.get(id)) });
  console.log(`판정 ${verdicts.length}곳 ${JSON.stringify(counts)} → 감사 표본 ${ids.length}곳`);
}

/** `HH:MM` → 분. */
const minutes = (t) => {
  const m = /^(\d{2}):(\d{2})$/.exec(t ?? '');
  if (!m) throw new Error(`시각을 읽지 못함: ${t}`);
  return +m[1] * 60 + +m[2];
};

/** 감사를 통과한 라벨(audit-01-result.md: 네 라벨 모두)을 장소에 싣는다: day-viewing·palace·always는 그 이름, evening은
 * [여는 분, 닫는 분](닫는 시각이 여는 시각보다 이르면 자정 넘김, +1440). unknown은 싣지 않는다(앱은 이름 규칙). 다른 칸·순서·
 * 직렬화는 그대로다. */
function apply() {
  const verdicts = readdirSync(resolve(dir, 'out'))
    .filter((f) => /^batch-\d+\.json$/.test(f))
    .sort()
    .flatMap((f) => readJson(resolve(dir, 'out', f)).items);
  const byId = new Map(verdicts.map((v) => [v.id, v]));
  const all = JSON.parse(readFileSync(SRC, 'utf8'));
  let n = 0;
  for (const x of all) {
    delete x.opening;
    const v = byId.get(x.id);
    if (!v || v.label === 'unknown') continue;
    if (v.label === 'evening') {
      const open = minutes(v.open);
      let close = minutes(v.close);
      if (close <= open) close += 1440;
      x.opening = [open, close];
    } else x.opening = v.label;
    n++;
  }
  const missing = verdicts.filter((v) => !all.some((x) => x.id === v.id)).length;
  if (missing) {
    console.error(`판정한 곳 ${missing}곳이 서울 목록에 없음`);
    process.exit(1);
  }
  writeFileSync(SRC, JSON.stringify(all));
  console.log(`서울 ${all.length}곳 중 ${n}곳에 영업 유형`);
}

/** 야외 산행지 (ADR-0117 Amendment 9): 먹기 아닌 곳 가운데 이름에 산·봉우리·봉수대·계곡이 있거나 산을 지나는 둘레길 코스인 곳.
 * 공원·정원·폭포·성지·캠핑장·전시관, 도심 산책로인 남산(목멱산)·낙산·○○동산, 강·공원을 지나는 서울둘레길 코스(8·14·15)는 아니다.
 * 국립공원·자연공원은 「공원」 제외보다 먼저 산행지다(재검토 2 A9-1). 이름 규칙으로 안 잡히는 곳은 INCLUDE, 밤에도 갈 수 있는
 * 곳은 NIGHT_OK(A9-2)로 사람이 정한다 — 둘 다 이름이 맞는지 돌릴 때 확인한다. */
export const TRAIL = /[가-힣]+산(?:$|[\s(]|성|코스)|봉$|봉수대|백운대|계곡|서울둘레길|북한산 둘레길|북악하늘길|산림형코스/;
export const NOT_TRAIL = /공원|정원$|폭포|성지|캠핑장|전시관|^남산|목멱산|낙산|동산|장지·탄천코스|안양천 하류코스|노을·하늘공원코스/;
export const PARK_TRAIL = /국립공원$|자연공원/;
export const INCLUDE = [
  { id: 'nt-2993160', name: '백악마루', why: '북악산 정상, 한양도성 백악구간(개방 시간 있음)' },
  { id: 'nt-2723499', name: '서울한양도성 백악구간', why: '북악산 성곽 탐방로(개방 시간 있음)' },
  { id: 'nt-1101088', name: '서울 한양도성 순성길', why: '백악·인왕·낙산·남산을 넘는 성곽길, 산 구간 포함' },
  { id: 'nt-2774283', name: '선바위(선암)', why: '인왕산 중턱 바위' },
  { id: 'nt-3076460', name: '대모산숲속야생화원', why: '대모산 숲속' },
  { id: 'nt-827642', name: '헌인릉 생태경관보전지역(오리나무림)', why: '대모산 기슭 숲' },
  { id: 'nt-2757831', name: '우면산자연생태공원', why: '우면산 기슭 숲·습지' },
  { id: 'nt-2773297', name: '워커힐숲길', why: '아차산으로 이어지는 숲길' },
  { id: 'nt-3544787', name: '연희숲속쉼터', why: '안산 자락 숲속' },
];
export const NIGHT_OK = [
  { id: 'nt-2661502', name: '서대문 안산(안산자락길)', why: '조명 있는 무장애 데크길, 밤 산책 명소' },
  { id: 'nt-1037031', name: '하늘한마당~하늘마루 (북악하늘길 스카이웨이)', why: '북악스카이웨이 팔각정 쪽, 차로 가는 야경 명소' },
  { id: 'nt-1874105', name: '응봉산', why: '한강 야경 명소인 낮은 산' },
];
const ids = (list) => new Set(list.map((x) => x.id));
export function isTrail(x) {
  if (x.mood === 'food' || ids(NIGHT_OK).has(x.id)) return false;
  return ids(INCLUDE).has(x.id) || PARK_TRAIL.test(x.name) || (TRAIL.test(x.name) && !NOT_TRAIL.test(x.name));
}

function trail() {
  const all = JSON.parse(readFileSync(SRC, 'utf8'));
  const wrong = [...INCLUDE, ...NIGHT_OK].filter((m) => all.find((x) => x.id === m.id)?.name !== m.name);
  if (wrong.length) {
    console.error(`목록의 이름이 서울 목록과 다름: ${wrong.map((m) => m.id).join(', ')}`);
    process.exit(1);
  }
  const items = [];
  for (const x of all) {
    delete x.trail;
    if (!isTrail(x)) continue;
    x.trail = true;
    items.push({ id: x.id, name: x.name, area: x.area, mood: x.mood });
  }
  writeJson(resolve(dir, 'trail-01.json'), {
    adr: 'docs/adr/0117-seoul-home-shelves.md Amendment 9',
    rule: { trail: TRAIL.source, notTrail: NOT_TRAIL.source, parkFirst: PARK_TRAIL.source, food: 'never' },
    include: INCLUDE,
    nightOk: NIGHT_OK,
    n: items.length,
    items,
  });
  writeFileSync(SRC, JSON.stringify(all));
  console.log(`서울 ${all.length}곳 중 야외 산행지 ${items.length}곳`);
}

const cmd = process.argv[2];
if (cmd === 'prep') prep();
else if (cmd === 'sample') sample();
else if (cmd === 'apply') apply();
else if (cmd === 'trail') trail();
else {
  console.error('prep | sample | apply | trail');
  process.exit(1);
}
