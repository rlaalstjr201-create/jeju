/**
 * 부산 출하 파일 S4 (plans/busan.md S4, ADR-0095, 규칙 docs/research/busan-popularity/criteria-01.md 6~8절).
 *
 *   node scripts/busan/build.mjs     review/busan/* → public/spots-busan.json
 *
 * 입력은 파일뿐이다(scope.json, judge-01/out-*.json + fixes-01.json, kakao-01.json, pop-01.json, booking/routes.json). 모델·API를 부르지
 * 않고, 같은 입력이면 같은 파일을 쓴다(멱등). 판정·검색수가 없는 곳, S1' 규칙을 어기는 이유 문장은 빼지 않고 멈춘다.
 * 원문(overview)·근거 조각은 싣지 않는다. 제주 build-spots.mjs·public/spots.json은 건드리지 않는다.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { popScores } from '../famous.mjs';
import { reasonPunctuationProblem, shipReason } from '../reason.mjs';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const busanDir = resolve(webRoot, 'review/busan');
export const OUT = resolve(webRoot, 'public/spots-busan.json');

export const FAMOUS_N = 60;
export const FAMOUS_TYPE = 12;
export const CAFE_WORDS = /카페|커피|빵|베이커리|디저트/;
export const LEPORTS_TYPE = 28;
/** 주인 지정 유명한 곳(ADR-0094 Amendment 2, 2026-10-19 주인 「광안대교 넣어줘」): 검색수 규칙과 상관없이 id로 넣는다
 * (제주 scripts/famous.mjs OWNER_INCLUDE와 같은 방식). 광안대교는 키워드 도구가 `< 10`으로 답한 측정 이상이라 다시 재지
 * 않는다. `pop`은 규칙 60곳의 마지막(60번째) 곳 값을 쓴다: 60곳 값은 그대로 두고, 측정값으로 60곳 아래 맨 끝에
 * 혼자 처지지 않게. 먹기거나 출하되지 않거나 hide인 곳이면 멈춘다. */
export const OWNER_FAMOUS = ['bs-128164'];
/** 체험 예약 경로(ADR-0074, review/busan/booking/criteria.md): routes.json의 best 종류. */
export const BOOK_KINDS = ['naver', 'homepage', 'phone'];
/** A TourAPI point outside this box is no Busan position (bs-2907087 반송공원 sits in the South China Sea): the place is
 * left out as 확인 실패 — it may exist, its position is not known (as Jeju's build-spots.mjs does with unresolved points).
 * The same box as tests/spot-record.ts BUSAN_RECORD_BOX. */
export const inBusanBox = (p) => p.lat >= 34.85 && p.lat <= 35.45 && p.lng >= 128.75 && p.lng <= 129.35;
const MOODS = new Set(['rest', 'walk', 'new', 'food']);
const SUBS = { food: new Set(['meal', 'cafe']), new: new Set(['sight', 'do']) };
// build-spots.mjs BANNED_REASON_PATTERN과 같은 식(가격·운영시간·요일·평점)
const PRACTICAL = /\d[\d,]*\s*(원|천원)|입장료|요금|무료|영업|휴무|\d{1,2}:\d{2}|오전\s*\d|오후\s*\d|\d+시(부터|까지)|오픈|평점|별점|월요일|화요일|수요일|목요일|금요일|토요일|일요일|매주|정기휴무/;
const cleanName = (s) => String(s).replace(/\s+/g, ' ').trim();
/** The name on a card (plans/busan.md S5): TourAPI's title without the 「(부산)」 it carries to tell a Busan place from a
 * namesake elsewhere — measurement and matching used the title as it was; on screen every place is in Busan already.
 * Only that exact last part goes («(부산 국가지질공원)» stays). */
export const displayName = (title) => cleanName(title).replace(/\s*\(부산\)$/, '');
const len = (s) => [...s].length;
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** Everything the build reads, from `dir` (review/busan). */
export function loadInputs(dir = busanDir) {
  const judgeDir = resolve(dir, 'judge-01');
  const verdicts = new Map();
  for (const f of readdirSync(judgeDir).filter((f) => /^out-\d{2}\.json$/.test(f)).sort()) for (const v of readJson(resolve(judgeDir, f))) verdicts.set(v.id, v);
  const fixes = readJson(resolve(judgeDir, 'fixes-01.json'));
  return {
    items: readJson(resolve(dir, 'scope.json')).items,
    verdicts,
    fixes,
    kakao: readJson(resolve(dir, 'kakao-01.json')).rows,
    pop: readJson(resolve(dir, 'pop-01.json')).rows,
    booking: readJson(resolve(dir, 'booking/routes.json')).spots,
    placeType: Object.keys(readJson(resolve(dir, 'booking/place-type.json')).spots),
  };
}

/** criteria-01 §6: id → score 1~5 within one group (food, or the rest). Ties share the higher score. */
export function quintileScores(volumes) {
  const list = [...volumes];
  const n = list.length;
  return new Map(list.map(([id, v]) => [id, 5 - Math.floor((5 * list.filter(([, w]) => w > v).length) / n)]));
}

/** criteria-01 §7: whether a place is a 유명한 곳 candidate. */
export const famousCandidate = (item, spot) => item.contenttypeid === FAMOUS_TYPE && spot.mood !== 'food' && !CAFE_WORDS.test(spot.name);

/** criteria-01 §7: the FAMOUS_N candidates with the largest values (ties by id). */
export function famousIds(candidates, volumeById, n = FAMOUS_N) {
  return [...candidates]
    .sort((a, b) => volumeById.get(b) - volumeById.get(a) || (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, n);
}

/** criteria-01 §8: id → kakaoPlaceId; an ID two places share stays only with the one `exact` match (if just one is). */
export function kakaoIds(rows, shipped) {
  const matched = rows.filter((r) => shipped.has(r.id) && r.status === 'matched' && r.kakaoPlaceId);
  const byPlace = new Map();
  for (const r of matched) byPlace.set(r.kakaoPlaceId, [...(byPlace.get(r.kakaoPlaceId) ?? []), r]);
  const out = new Map();
  for (const group of byPlace.values()) {
    const exact = group.filter((r) => r.rule === 'exact');
    for (const r of group) out.set(r.id, group.length === 1 || (exact.length === 1 && exact[0] === r) ? r.kakaoPlaceId : null);
  }
  return out;
}

/** ADR-0074 2: a 체험's booking fields from routes.json: `{ book }`, `{ hide: 'closed' }`, `{}` (noroute), or a problem. */
export function bookingOf(id, r) {
  if (!r) return { problem: `${id}: 체험 without a booking call in booking/routes.json` };
  if (r.call === 'closed') return { fields: { hide: 'closed' } };
  if (r.call === 'noroute' && !r.best) return { fields: {} };
  const route = r.routes?.find((x) => x.kind === r.best && x.verdict === 'accepted');
  if (!BOOK_KINDS.includes(r.best) || !route) return { problem: `${id}: booking best ${r.best} has no accepted route` };
  const ok = r.best === 'phone' ? /^tel:\d{8,12}$/.test(route.url) : /^https?:\/\//.test(route.url);
  if (!ok) return { problem: `${id}: bad ${r.best} url ${route.url}` };
  return { fields: { book: { k: r.best, u: route.url } } };
}

/** Why a reason cannot ship (S1'), or null. */
export function reasonProblem(reason) {
  const n = len(reason);
  if (n < 15 || n > 70) return `length ${n}`;
  if (PRACTICAL.test(reason)) return 'price/hours/weekday/rating wording';
  return reasonPunctuationProblem(reason);
}

/** The shipped Busan records, in scope.json order, and the keep ids left out for an unknown position. Throws on anything
 * missing or out of rule. Scores and 유명한 곳 are counted over the shipped places only. */
export function build(inputs = loadInputs()) {
  const { items, verdicts, fixes, kakao, pop, booking } = inputs;
  // 「장소형」 체험 (booking/place-type.json, ADR-0074 2): 구경, no booking link
  const placeType = new Set(inputs.placeType ?? []);
  const fixed = new Map(fixes.filter((f) => f.field === 'reason').map((f) => [f.id, f]));
  const volumeById = new Map(pop.map((r) => [r.id, r.volume]));
  const problems = [];
  const kept = [];
  const unknownPosition = [];
  for (const item of items) {
    const v = verdicts.get(item.id);
    if (!v) problems.push(`${item.id}: no verdict`);
    if (!v?.keep) continue;
    if (!inBusanBox(item)) {
      unknownPosition.push(item.id);
      continue;
    }
    const f = fixed.get(item.id);
    if (f && f.before !== v.reason) problems.push(`${item.id}: fixes-01 before ≠ verdict reason`);
    const reason = shipReason(f ? f.after : v.reason);
    const why = reasonProblem(reason);
    if (why) problems.push(`${item.id}: reason ${why}: ${reason}`);
    if (!MOODS.has(v.mood)) problems.push(`${item.id}: mood ${v.mood}`);
    if (SUBS[v.mood] && !SUBS[v.mood].has(v.sub)) problems.push(`${item.id}: ${v.mood} sub ${v.sub}`);
    if (typeof v.indoor !== 'boolean') problems.push(`${item.id}: indoor ${v.indoor}`);
    if (!Number.isInteger(volumeById.get(item.id))) problems.push(`${item.id}: no search volume (확인 실패) in pop-01.json`);
    if (item.image && !item.image.startsWith('https://')) problems.push(`${item.id}: image not https`);
    if (placeType.has(item.id) && !(v.mood === 'new' && v.sub === 'do')) problems.push(`${item.id}: place-type.json names a place that is no 체험`);
    const place = placeType.has(item.id);
    const bk = v.mood === 'new' && v.sub === 'do' && !place ? bookingOf(item.id, booking[item.id]) : { fields: {} };
    if (bk.problem) problems.push(bk.problem);
    kept.push({ item, v: place ? { ...v, sub: 'sight' } : v, reason, bookFields: bk.fields ?? {} });
  }
  for (const id of placeType) if (!kept.some((k) => k.item.id === id)) problems.push(`${id}: place-type.json names a place not shipped`);
  for (const id of OWNER_FAMOUS) {
    const k = kept.find((x) => x.item.id === id);
    if (!k || k.v.mood === 'food' || k.bookFields.hide) problems.push(`${id}: owner 유명한 곳 not shipped, or 먹기·hide`);
  }
  if (problems.length) throw new Error(`spots-busan.json: ${problems.length} problem(s)\n  ${problems.slice(0, 20).join('\n  ')}`);

  const ids = new Set(kept.map((k) => k.item.id));
  const kakaoById = kakaoIds(kakao, ids);
  const group = (food) => new Map(kept.filter((k) => (k.v.mood === 'food') === food).map((k) => [k.item.id, volumeById.get(k.item.id)]));
  const scoreById = new Map([...quintileScores(group(true)), ...quintileScores(group(false))]);
  const famous = famousIds(
    kept.filter((k) => famousCandidate(k.item, { mood: k.v.mood, name: cleanName(k.item.title) })).map((k) => k.item.id),
    volumeById,
  );
  const pops = popScores(volumeById, famous);
  for (const id of OWNER_FAMOUS) if (!pops.has(id)) pops.set(id, pops.get(famous[famous.length - 1]));

  const names = kept.map(({ item }) => displayName(item.title));
  const twice = names.filter((n, i) => names.indexOf(n) !== i);
  if (twice.length) throw new Error(`spots-busan.json: display names shared by two places: ${[...new Set(twice)].join(', ')}`);

  const spots = kept.map(({ item, v, reason, bookFields }) => ({
    id: item.id,
    name: displayName(item.title),
    lat: item.lat,
    lng: item.lng,
    mood: v.mood,
    reason,
    image: item.image || '',
    kakaoPlaceId: kakaoById.get(item.id) ?? null,
    bookable: item.contenttypeid === LEPORTS_TYPE,
    indoor: v.indoor,
    ...(SUBS[v.mood] ? { sub: v.sub } : {}),
    score: scoreById.get(item.id),
    ...(pops.has(item.id) ? { famous: true, pop: pops.get(item.id) } : {}),
    ...bookFields,
  }));
  return { spots, unknownPosition };
}

export const buildSpots = (inputs = loadInputs()) => build(inputs).spots;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { spots, unknownPosition } = build();
  const text = JSON.stringify(spots);
  let before = '';
  try {
    before = readFileSync(OUT, 'utf8');
  } catch {
    /* first build */
  }
  if (text !== before) writeFileSync(OUT, text);
  const count = (f) => spots.filter(f).length;
  console.log(
    `spots-busan.json ${text === before ? 'unchanged' : 'written'}: ${spots.length} places, ${Buffer.byteLength(text)} B, famous ${count((s) => s.famous)}, ` +
      `kakaoPlaceId ${count((s) => s.kakaoPlaceId)}, 체험 book ${count((s) => s.book)} hide ${count((s) => s.hide)}, no photo ${count((s) => !s.image)}, left out for an unknown position ${unknownPosition.join(' ') || 0}`,
  );
}
