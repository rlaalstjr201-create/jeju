/**
 * Merge review/input/batch-NNN.json + review/out/batch-NNN.json (verdicts) + review/out/adj-NNN.json
 * (adjudications, override by id) + review/copy/* (S9-3 reason rewrite layer) + review/score/* (만족도 점수,
 * ADR-0060) into public/spots.json (ADR-0028, plan "전 항목 검수" / "전체 QA·디자인 개편", spec S1'/S9-3).
 *
 * Read-only over review/*; does not call any model. Run once per merge; re-run is safe (idempotent —
 * always rebuilds spots.json from the same inputs).
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { applyCorrections, loadCorrections } from './apply-corrections.mjs';
import { dropDuplicates, unresolvedTwins } from './duplicates.mjs';
import { applyBooking, loadBookingCalls, loadBookRoutes } from './booking.mjs';
import { applyIndoor, loadIndoorCalls } from './indoor.mjs';
import { applyMarketDays, loadMarketDays, loadMarketVerdicts } from './markets.mjs';
import { applySeason, loadSeasonCalls } from './season.mjs';
import { applySunset, basisProblems, loadSunsetCalls } from './sunset.mjs';
import { applyNight, basisProblems as nightBasisProblems, loadNightCalls } from './night.mjs';
import { loadNewSubCalls, newSub } from './new-sub.mjs';
import { positionProblems } from './positions.mjs';
import { reasonPunctuationProblem, shipReason } from './reason.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const inputDir = resolve(root, 'review/input');
const outDir = resolve(root, 'review/out');
const foodSplitDir = resolve(root, 'review/food-split');
const copyDir = resolve(root, 'review/copy');
const outPath = resolve(root, 'public/spots.json');

// S1': 이유 문장 15~70자, 가격·운영시간·요일·평점 표현 0건.
const BANNED_REASON_PATTERN =
  /\d[\d,]*\s*(원|천원)|입장료|요금|무료|영업|휴무|\d{1,2}:\d{2}|오전\s*\d|오후\s*\d|\d+시(부터|까지)|오픈|평점|별점|월요일|화요일|수요일|목요일|금요일|토요일|일요일|매주|정기휴무/;

// Faithfulness-audit flagged ids (adj-* re-check found the reason unsupported by the input text).
const FAITHFULNESS_DROP = new Set([
  '441cd149-a579-40bf-b83c-49701ee287a4',
  '0d356242-13ce-4c6c-9b9b-3a69888a4cf5',
]);

// S9-3 copy-rewrite ids to revert to their pre-rewrite oldReason (review/copy/input-NN.json) — e.g. a
// faithfulness or QA pass flagged the rewrite for these, so the rewrite layer is skipped for them.
const COPY_REVERT = new Set([
  '3cd8d81f-5ddb-40d8-8903-0d4b8ef3531a', 'b9d075fc-787f-4f76-9d7d-81d52c1dc4f7', '82ccb521-d4c1-44a1-afbb-435204a62008',
  'b4555cb3-f99d-432e-91f4-73348fafb9e4', '29d97282-fd0a-44a6-bb67-f0fea13dd44f', 'ba1c84ea-cd72-48d4-92a5-5a4b77e580a7',
  '6755ce67-899b-49d7-a062-820777e47484', '4213aa2a-f4ee-4ad9-8321-f22294689412', '34f29828-a6e2-4c2b-9fce-ba1992ecf2ab',
  'c73fa444-cc7a-45bb-bab4-7b06b68361de', 'f2f31626-f2f9-4c89-bf09-159a787c2e49', '18844c4a-5bc7-4d91-b3bc-0ff0a23eb81a',
  '3f3e2428-7da6-40ec-9158-193ffed03765', '7c9601d6-8673-4ce0-961d-cc7c04ddf75f', '3de6f3b4-de29-4d84-bd6f-42b6039e9561',
  '701b4e19-fe8a-4405-b78f-9d80f72c9d98', 'b4def6fa-49bc-48e9-82f0-93ffc45362e0', 'e1521dd0-3156-40a9-abcc-c7823fa0472b',
  '5119e879-c567-4b0b-8ef9-0b80e88aa85b', '875a3b5f-4896-46ee-8600-b56b17617118', 'b9e2fe67-1aa0-49b7-9eb2-b24409752de3',
  'e7864a2a-d3d9-4b8d-a000-caff867433dd', '80df2cf7-8245-41fb-8a0a-3261b2c0f2da', 'dd4b5dd7-bfd7-4f70-b912-5242dc2acf1e',
  'c0517ffc-78d1-455d-a6ed-200a1d25009b', 'e1525ebd-982d-4f16-89f5-52d081d89cf5', '8c911b98-2576-41fe-b13c-a7de5fb272e6',
  'c76a9ab3-9f64-4902-8a87-022bd3d7f6e2', '59a924fe-be02-45ed-bb78-2d82fa697c34', '4abf61c4-4699-43ab-bad2-fd48fbbe8b6f',
  '83367eec-365a-4160-90ed-b44341be82b9', 'bfa8d161-9159-4d53-99c9-672fd6550fcf', '629c73c8-e21d-4155-8dd4-7c099bca01e2',
  'a0f73abd-19c5-428d-995a-b8f0d24ec51d', 'd20e41a9-44fa-49a9-9a24-97ab1e86bc0d', '8260cceb-726b-4818-af6a-ea9043660eaf',
  '494fc353-2e9e-4772-9bbe-bd20b1de67e2', '9ce5b284-caf4-488a-b700-59b57f3b7ee4', 'e67f7ff7-d33f-4073-82c9-f19db171f7d3',
  '7500f298-1c11-490a-88ce-b33be0ca7e04', 'e2a8e942-d081-42d2-93ef-21bdc9de70a8', 'cd187752-6955-483f-b92e-053f37b83174',
  'd6d1224f-6a8c-4224-bcf9-93cd55860c32', '34d9a5d1-13ad-4dd3-857a-35c0dbfd27e3', 'ae02eeb8-d79f-4a6c-ac15-e93b92434297',
  'abfe42db-b8ab-4c43-a321-6cd7619e6718', '2b624d92-5014-4a5b-b4c0-7a4f2e1f46b6', '4791fe61-7f1f-4b4a-ac69-ed17e42f05fe',
  'fbb53458-c40a-45e4-8e19-1361580461c8', '15d6d827-b91b-43f2-bf42-018bb8eacca1', 'c78f89bc-adf1-4830-bcb1-9a2a0987863f',
  '8743f795-55b8-4280-b44c-05a91af3b8d9', '21f10963-f4f8-400d-aaac-adb70e679f7d', '4c9c7b60-f058-4cd2-a4e8-bac001cb51d9',
  'c39d7ece-6b95-4711-bb63-a27cee0467a3', '5972a401-5be2-46fc-b1c8-e0e7106d0165', 'f5e1cb32-7339-4831-8187-9f09868f1aff',
  '66e012fd-c3a8-4daa-8b6d-3afaa7b1e1c2', '86cf2c31-c109-48b0-b283-fb9a86fea41f', '8389843a-0034-44fb-8087-c5441813cd2b',
  '9fa762e3-a833-4ce9-ae70-ee989fe65ffa', '78328f33-d678-44dc-91c1-c93a48ce7fee', 'd58cf782-7318-4c03-995b-e3c7284a34a7',
  '950a4249-a270-4049-a13c-07ab701292ba', '9ca7b04a-bd65-430c-afd6-1f55f2f0ce05', '1295b501-a4bb-4fd3-9ec2-183273ab2bef',
  'd529b581-59b3-4987-93b1-d1a762961654', '887da8d4-62fe-4528-a3fa-89c454dfbe20', 'dac29181-a332-4d73-83aa-58a9f52f6e03',
  '00605111-b68f-4d9d-8367-e87a1dfdd867', '003dcc79-e196-4944-a623-2194ac4700cc', 'b564e035-9ac8-4178-ad77-a46b14e21708',
  'c54bd18c-93d5-4fa9-8e35-41d31cf2c66f', 'fb2be61b-cd63-45b8-bfc5-5e52cea9fd42', 'f693b5a8-0fae-49ea-aaa2-9a4702a59ce9',
  'ee59dbaf-66f6-4289-a3d3-64422acd582c', '846b22d1-2f45-41f9-bc44-1efbcb753170', '71f2aa65-6918-4537-b3e3-b648671b2810',
  '039b92fd-f73b-4112-8341-ff81cd325176', '548c2ddd-901f-435d-8799-f69ba925ef25', '22d7785a-d579-4da6-a329-5fa992b30184',
  'ed9eb435-2269-4312-bf20-b50fe9cf4e74', 'c5028947-2389-4290-bfa9-5276407489c2', '1b52d3aa-d2b4-4aae-b7a2-dbfb4bbd433e',
  'ed056c8a-112d-4aa3-af44-871a69825262', '8746fa69-abe2-4619-9e4b-395884d5aced', '2cefac39-c147-4b2b-bb4e-2a253e943153',
  '099a2bd8-5a57-416c-911b-a77ee5c4ab32', 'dfb52d62-655a-471b-b5a4-a1f8a10a53e0', '957c3858-b5da-4890-843c-b217b6624d0c',
  '4fa86a01-1092-4177-aad4-3f3ddd5b0df1', '6a36a2b9-07a9-49f3-a5bd-09eecb33b0bf', 'aba1295d-2e66-4abb-9ad3-b1796dc3563e',
  'ac22993c-c278-4110-9b00-e627e336b870', '030fc478-6994-441e-8b24-8ee694fe7deb', 'c773ebfb-1e55-4d9f-a5ef-d6c27c80b4c5',
  '2b945c4b-ff7e-42f6-a4f4-777667077136', '0517f0f6-38fb-49e9-9e6c-d36da5eeab6a', '38b8e236-f5d1-44d2-8238-5dee33734058',
  '44a5ea57-6cf2-40e2-b846-9db0fa3e9cb2', 'cab674cc-fa36-4dff-9367-e66aa6b3fed3', 'c7a6da6b-a780-4395-af68-e791be69988b',
  'f93a6095-1734-4ba8-b5e5-226da1fc34bd', '34ae43bc-18f8-440c-bca7-c87aa45e56ea', '68654c3c-0aa4-458e-a1f6-26a7f6268307',
  '4fa96e95-1d21-4ad9-9128-25ceee2f93b3', '4f7bbac9-2004-4157-9f2a-0eed94042946', '362284cb-b2c7-461c-9853-fb02b3f7d424',
  'ca2ca4ec-6677-4c54-af6d-7dbde2e75af4', '8d117dbf-70a2-41ac-9b97-b85e255a3c5b',
]);

const MOODS = new Set(['rest', 'walk', 'new', 'food']);
const len = (s) => [...s].length;
// Some source names carry leading/trailing spaces, tabs or U+3000 — they end up in map/booking search
// URLs (S32). Collapse any whitespace run and trim; src/data.ts applies the same rule at load time.
const cleanName = (s) => String(s).replace(/\s+/g, ' ').trim();
// Reason as shipped (design/SPEC.md §10·§12.4, 3판): whitespace cleaned, 돈까스 → 돈가스, no final full
// stop whatever the ending (scripts/reason.mjs).
const bareReason = shipReason;

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
// 오일장 (ADR-0066): review/input/batch-900.json's verdicts are committed in review/market/verdicts.json.
for (const v of loadMarketVerdicts()) verdictById.set(v.id, v);

// --- load food sub-type verdicts (meal|cafe), out-NN.json arrays of {id, sub} ---
const SUBS = new Set(['meal', 'cafe']);
const subById = new Map();
for (const f of readdirSync(foodSplitDir).filter((f) => /^out-\d{2}\.json$/.test(f)).sort()) {
  for (const v of readJson(resolve(foodSplitDir, f))) subById.set(v.id, v.sub);
}

// --- load 새로운 거 sub calls for cafe·restaurant (ADR-0064, review/copy/new-sub.json); the rest follow category ---
const newSubCalls = loadNewSubCalls(resolve(copyDir, 'new-sub.json'));

// --- load S9-3 copy layer: rewritten reasons, out-NN.json (pass 1) then div1-NN.json / div2-NN.json
// (diversify-ending passes, later overrides earlier) — arrays of {id, reason}. Plus the pre-rewrite
// oldReason snapshot from input-NN.json, used as the fallback when a rewrite fails validation or an id
// is in COPY_REVERT. Missing div2-* files are fine — the layer is applied by whichever passes exist.
const copyReasonById = new Map();
for (const f of readdirSync(copyDir).filter((f) => /^out-\d{2}\.json$/.test(f)).sort()) {
  for (const v of readJson(resolve(copyDir, f))) copyReasonById.set(v.id, v.reason);
}
for (const f of readdirSync(copyDir).filter((f) => /^div1-\d{2}\.json$/.test(f)).sort()) {
  for (const v of readJson(resolve(copyDir, f))) copyReasonById.set(v.id, v.reason);
}
for (const f of readdirSync(copyDir).filter((f) => /^div2-\d{2}\.json$/.test(f)).sort()) {
  for (const v of readJson(resolve(copyDir, f))) copyReasonById.set(v.id, v.reason);
}
const copyOldReasonById = new Map();
for (const f of readdirSync(copyDir).filter((f) => /^input-\d{2}\.json$/.test(f)).sort()) {
  for (const v of readJson(resolve(copyDir, f))) copyOldReasonById.set(v.id, v.oldReason);
}
for (const id of COPY_REVERT) {
  if (copyOldReasonById.has(id)) copyReasonById.set(id, copyOldReasonById.get(id));
}
// fix-02.json (SPEC 3판 §10): rewrites of the sentences carrying the 3판 banned forms (겉바속촉, 아름다운,
// 여유를 누려요, 공간이에요) and of the two two-sentence reasons, each from that spot's review/input text.
// fix-03.json (S9-3 faithfulness audit, review/audit/s9-3-faithfulness.md): the 5 borderline reasons plus
// the same "갓 잡은" overreach at 제주할망밥상 차귀도점·애월점, rewritten back to what review/input supports.
// Sorted glob → applied after fix-02.
// fix-NN.json (QA 2026-09-30): hand edits that take the design/SPEC.md §10 banned forms ("~하기 좋아요",
// 인생샷, 힐링, 다양한 …) out of a sentence without adding anything the old sentence did not say. Applied
// last, so it also covers ids reverted above.
for (const f of readdirSync(copyDir).filter((f) => /^fix-\d{2}\.json$/.test(f)).sort()) {
  for (const v of readJson(resolve(copyDir, f))) copyReasonById.set(v.id, v.reason);
}

// --- load the geocode fixes (review/geo, scripts/regeocode.ts): spots whose source point was a geocoder
// fallback (the city hall) or a centroid shared by 3+ unrelated places. regeocode.json first, then the
// hand-checked manual.json overrides by id. matched → the Kakao point (and place id, when one is given);
// unresolved → left out ("확인 실패": the place may exist, its position is not known).
const geoDir = resolve(root, 'review/geo');
const geoById = new Map();
for (const f of ['regeocode.json', 'manual.json']) {
  for (const v of readJson(resolve(geoDir, f))) geoById.set(v.id, v);
}

// --- load the 만족도 점수 (ADR-0060, specs/ranking.md): score-NN.json arrays of {id, score, basis}, later files
// override earlier by id. Every shipped spot must have an integer 1–5; the score orders the cards and is never
// shown. ---
const scoreDir = resolve(root, 'review/score');
const scoreById = new Map();
for (const f of readdirSync(scoreDir).filter((f) => /^score-\d{2}\.json$/.test(f)).sort()) {
  for (const v of readJson(resolve(scoreDir, f))) scoreById.set(v.id, v.score);
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
  copyApplied: 0,
  copyFallbackToOld: 0,
  positionFixed: 0,
  droppedByUnknownPosition: 0,
  duplicatePlaceIdCleared: 0,
  droppedAsDuplicate: 0,
};

let kept = [];
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
  let reason = bareReason(v.reason ?? '');
  // S9-3 copy layer: prefer the rewritten reason when one exists for this id. A rewrite that fails the
  // length/banned-pattern rule falls back to its pre-rewrite oldReason rather than dropping the spot
  // (the copy layer must not change which spots ship — only reason text).
  if (copyReasonById.has(item.id)) {
    const rewritten = bareReason(copyReasonById.get(item.id));
    const rewrittenLen = len(rewritten);
    if (rewrittenLen >= 15 && rewrittenLen <= 70 && !BANNED_REASON_PATTERN.test(rewritten)) {
      reason = rewritten;
      counts.copyApplied++;
    } else if (copyOldReasonById.has(item.id)) {
      reason = bareReason(copyOldReasonById.get(item.id));
      counts.copyFallbackToOld++;
    }
  }
  const reasonLen = len(reason);
  if (reasonLen < 15 || reasonLen > 70 || BANNED_REASON_PATTERN.test(reason)) {
    counts.droppedByReasonRule++;
    continue;
  }
  if (!MOODS.has(v.mood)) {
    counts.droppedByBadMood++;
    continue;
  }
  const geo = geoById.get(item.id);
  if (geo && geo.status !== 'matched') {
    counts.droppedByUnknownPosition++;
    continue;
  }
  const spot = {
    id: item.id,
    name: cleanName(item.name),
    lat: geo ? geo.lat : item.lat,
    lng: geo ? geo.lng : item.lng,
    mood: v.mood,
    reason,
    image: item.image,
    // a fix names the place it found (placeId) or says the source id is wrong (null); otherwise keep it
    kakaoPlaceId: geo && geo.placeId !== undefined ? geo.placeId : item.kakaoPlaceId ?? null,
    bookable: item.category === 'experience',
  };
  if (geo) counts.positionFixed++;
  if (v.mood === 'food') {
    const sub = subById.get(item.id);
    if (!SUBS.has(sub)) {
      throw new Error(`food spot ${item.id} has no sub (meal|cafe) in review/food-split/out-NN.json`);
    }
    spot.sub = sub;
  }
  if (v.mood === 'new') spot.sub = newSub(item.id, item.category, newSubCalls);
  kept.push(spot);
  counts.kept++;
  counts.perMood[v.mood]++;
}

// The same place listed twice in the source (scripts/duplicates.mjs): only the record kept for it ships.
// A typo twin (one-character name difference, ≤ TYPO_RADIUS_M apart) with no DUPLICATES entry stops the build.
const twins = unresolvedTwins(kept);
if (twins.length) {
  throw new Error(`spots.json duplicates: ${twins.length} unresolved typo twin(s)\n  ` +
    twins.map(([a, b]) => `${a.id} ${a.name} / ${b.id} ${b.name}`).join('\n  ') +
    '\nAdd a DUPLICATES entry in scripts/duplicates.mjs naming the record to keep.');
}
const merged = dropDuplicates(kept);
for (const s of kept) {
  if (merged.includes(s)) continue;
  counts.droppedAsDuplicate++;
  counts.kept--;
  counts.perMood[s.mood]--;
}
kept = merged;

// 만족도 점수 last (after the duplicates are gone: only shipped spots are scored). A missing one stops the build.
const unscored = kept.filter((s) => {
  const score = scoreById.get(s.id);
  return !Number.isInteger(score) || score < 1 || score > 5;
});
if (unscored.length) {
  throw new Error(`spots.json scores: ${unscored.length} spot(s) without an integer 1–5 in review/score/score-NN.json\n  ` +
    unscored.slice(0, 10).map((s) => `${s.id} ${s.name}`).join('\n  '));
}
for (const s of kept) s.score = scoreById.get(s.id);

// Fact-check corrections (ADR-0063 item 5, review/copy/corrections-NN.json): applied after the fixes and scores,
// so a removal or a set name/score/kakaoPlaceId/lat/lng wins over every layer above.
const corrected = applyCorrections(kept, loadCorrections(copyDir));
counts.removedByCorrection = kept.length - corrected.length;
counts.kept = corrected.length;
for (const s of kept) if (!corrected.some((c) => c.id === s.id)) counts.perMood[s.mood]--;
kept = corrected;

// A fix may name a Kakao place another spot already carries (the same building, or a wrong source id):
// the map link would open someone else's page, so the fixed spot falls back to a name search.
const placeOwner = new Map();
for (const s of kept) if (s.kakaoPlaceId && !geoById.has(s.id)) placeOwner.set(s.kakaoPlaceId, s.id);
for (const s of kept) {
  if (!s.kakaoPlaceId || !geoById.has(s.id)) continue;
  if (placeOwner.has(s.kakaoPlaceId)) {
    s.kakaoPlaceId = null;
    counts.duplicatePlaceIdCleared++;
  } else placeOwner.set(s.kakaoPlaceId, s.id);
}

// Guard: a geocoder fallback must never ship again. The app turns positions into "여기서 걸어서 약 5분",
// so a place parked on the city hall reads as next door to anyone standing there (QA 2026-09-30).
const problems = positionProblems(kept, new Set([...geoById.keys()]));
if (problems.length) {
  throw new Error(`spots.json positions: ${problems.length} problem(s)\n  ${problems.slice(0, 10).join('\n  ')}\n` +
    'Run scripts/regeocode.ts (and review review/geo) before building.');
}

// Guard: one sentence per caption, no full stop (§10, §14 #19). A second sentence needs a rewrite in
// review/copy/fix-NN.json, not a machine edit.
const stops = kept.flatMap((s) => {
  const p = reasonPunctuationProblem(s.reason);
  return p ? [`${s.id} ${p}: ${s.reason}`] : [];
});
if (stops.length) {
  throw new Error(`spots.json reasons: ${stops.length} punctuation problem(s)\n  ${stops.slice(0, 10).join('\n  ')}\n` +
    'Rewrite them in review/copy/fix-NN.json.');
}

// 실내 (ADR-0065, review/copy/indoor.json): last, on the spots that ship. A place with no call stops the build.
kept = applyIndoor(kept, new Map(inputItems.map((i) => [i.id, i.category])), loadIndoorCalls(resolve(copyDir, 'indoor.json')));

// 장날 (ADR-0066, review/copy/market-days.json): last, on the markets that ship. A market with no rule stops the build.
kept = applyMarketDays(kept, loadMarketDays(resolve(copyDir, 'market-days.json')), new Map(inputItems.map((i) => [i.id, i.category])));

// 철 (ADR-0080, review/season/): after the market days (never on a market). A judgment for a place that does not ship stops the build.
kept = applySeason(kept, loadSeasonCalls(resolve(root, 'review/season')));

// 노을 볼 곳 (ADR-0083, review/sunset/ + data/coast/): after 철, before the booking fields. Only when the round's blind
// re-judging passed; a judgment for a place that does not ship stops the build. Same as `node scripts/sunset.mjs`.
const sunsetCalls = loadSunsetCalls(resolve(root, 'review/sunset'));
const sunsetBad = basisProblems(sunsetCalls.calls, new Map(inputItems.map((i) => [i.id, i])));
if (sunsetBad.length) throw new Error(`sunset basis problems (review/sunset):\n${sunsetBad.join('\n')}`);
kept = applySunset(kept, sunsetCalls);

// 밤 산길 (ADR-0091, review/night/): after 노을, before the booking fields. Only when the round's blind re-judging
// passed; a judgment for a place that does not ship stops the build. Same as `node scripts/night.mjs`.
const nightCalls = loadNightCalls(resolve(root, 'review/night'));
const nightBad = nightBasisProblems(nightCalls.calls, new Map(inputItems.map((i) => [i.id, i])));
if (nightBad.length) throw new Error(`night basis problems (review/night):\n${nightBad.join('\n')}`);
kept = applyNight(kept, nightCalls);

// 체험 예약 경로 (ADR-0074, review/booking/routes.json + review/copy/booking.json): last, on the 체험 that ship.
// A 체험 with neither a verified route nor a recorded call stops the build.
kept = applyBooking(kept, loadBookRoutes(resolve(root, 'review/booking/routes.json')), loadBookingCalls(resolve(copyDir, 'booking.json')));

writeFileSync(outPath, JSON.stringify(kept));

console.log(JSON.stringify(counts, null, 2));
if (counts.unreviewed > 0) {
  console.warn(
    `WARNING: ${counts.unreviewed} prefilter-passing items have no verdict (batch or adj) — ` +
      `excluded from spots.json, not counted as dropped. S1' completeness (100% reviewed) is NOT met. ` +
      `Re-run review for the missing ids before calling this final.`,
  );
}
