/**
 * Merge review/input/batch-NNN.json + review/out/batch-NNN.json (verdicts) + review/out/adj-NNN.json
 * (adjudications, override by id) into public/spots.json (ADR-0028, plan "전 항목 검수", spec S1').
 *
 * Read-only over review/*; does not call any model. Run once per merge; re-run is safe (idempotent —
 * always rebuilds spots.json from the same inputs).
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const inputDir = resolve(root, 'review/input');
const outDir = resolve(root, 'review/out');
const foodSplitDir = resolve(root, 'review/food-split');
const outPath = resolve(root, 'public/spots.json');

// S1': 이유 문장 15~70자, 가격·운영시간·요일·평점 표현 0건.
const BANNED_REASON_PATTERN =
  /\d[\d,]*\s*(원|천원)|입장료|요금|무료|영업|휴무|\d{1,2}:\d{2}|오전\s*\d|오후\s*\d|\d+시(부터|까지)|오픈|평점|별점|월요일|화요일|수요일|목요일|금요일|토요일|일요일|매주|정기휴무/;

// Faithfulness-audit flagged ids (adj-* re-check found the reason unsupported by the input text).
const FAITHFULNESS_DROP = new Set([
  '441cd149-a579-40bf-b83c-49701ee287a4',
  '0d356242-13ce-4c6c-9b9b-3a69888a4cf5',
]);

const MOODS = new Set(['rest', 'walk', 'new', 'food']);
const len = (s) => [...s].length;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function batchFiles(dir) {
  return readdirSync(dir)
    .filter((f) => /^batch-\d{3}\.json$/.test(f))
    .sort();
}

// --- load inputs ---
const inputItems = [];
for (const f of batchFiles(inputDir)) {
  inputItems.push(...readJson(resolve(inputDir, f)));
}

// --- load verdicts (batch first, then adj overrides by id) ---
const verdictById = new Map();
for (const f of batchFiles(outDir)) {
  for (const v of readJson(resolve(outDir, f))) verdictById.set(v.id, v);
}
for (const f of readdirSync(outDir).filter((f) => /^adj-\d{3}\.json$/.test(f)).sort()) {
  for (const v of readJson(resolve(outDir, f))) verdictById.set(v.id, v);
}

// --- load food sub-type verdicts (meal|cafe), out-NN.json arrays of {id, sub} ---
const SUBS = new Set(['meal', 'cafe']);
const subById = new Map();
for (const f of readdirSync(foodSplitDir).filter((f) => /^out-\d{2}\.json$/.test(f)).sort()) {
  for (const v of readJson(resolve(foodSplitDir, f))) subById.set(v.id, v.sub);
}

// --- merge ---
const counts = {
  input: inputItems.length,
  unreviewed: 0,
  droppedByVerdict: 0,
  droppedByReasonRule: 0,
  droppedByFaithfulnessAudit: 0,
  droppedByBadMood: 0,
  kept: 0,
  perMood: { rest: 0, walk: 0, new: 0, food: 0 },
};

const kept = [];
for (const item of inputItems) {
  const v = verdictById.get(item.id);
  if (!v) {
    counts.unreviewed++;
    continue; // no verdict exists yet — do not fabricate one (data-integrity: incomplete stays "확인 실패", never silently kept or dropped-as-final)
  }
  if (!v.keep) {
    counts.droppedByVerdict++;
    continue;
  }
  if (FAITHFULNESS_DROP.has(item.id)) {
    counts.droppedByFaithfulnessAudit++;
    continue;
  }
  const reason = (v.reason ?? '').trim();
  const reasonLen = len(reason);
  if (reasonLen < 15 || reasonLen > 70 || BANNED_REASON_PATTERN.test(reason)) {
    counts.droppedByReasonRule++;
    continue;
  }
  if (!MOODS.has(v.mood)) {
    counts.droppedByBadMood++;
    continue;
  }
  const spot = {
    id: item.id,
    name: item.name,
    lat: item.lat,
    lng: item.lng,
    mood: v.mood,
    reason,
    image: item.image,
    kakaoPlaceId: item.kakaoPlaceId ?? null,
    bookable: item.category === 'experience',
  };
  if (v.mood === 'food') {
    const sub = subById.get(item.id);
    if (!SUBS.has(sub)) {
      throw new Error(`food spot ${item.id} has no sub (meal|cafe) in review/food-split/out-NN.json`);
    }
    spot.sub = sub;
  }
  kept.push(spot);
  counts.kept++;
  counts.perMood[v.mood]++;
}

writeFileSync(outPath, JSON.stringify(kept));

console.log(JSON.stringify(counts, null, 2));
if (counts.unreviewed > 0) {
  console.warn(
    `WARNING: ${counts.unreviewed} prefilter-passing items have no verdict (batch or adj) — ` +
      `excluded from spots.json, not counted as dropped. S1' completeness (100% reviewed) is NOT met. ` +
      `Re-run review for the missing ids before calling this final.`,
  );
}
