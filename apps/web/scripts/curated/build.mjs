/**
 * 큐레이팅 도시 출하 파일 (부산 scripts/busan/build.mjs의 도시 인자판, 규칙 review/<dest>/pop-criteria.md 6~8절).
 *
 *   node scripts/curated/build.mjs gangwon 강릉[,속초,…]    review/gangwon/* → data/gangwon/spots-gangwon.json
 *
 * 입력은 파일뿐이다(scope.json, judge-<도시>-01/out-*.json(+fixes-01.json이 있으면), kakao-<도시>-01.json, pop-<도시>-01.json). 모델·API를
 * 부르지 않고 같은 입력이면 같은 파일을 쓴다(멱등). 판정·검색수가 없는 곳, 규칙을 어기는 이유 문장은 빼지 않고 멈춘다. 카카오 `closed`와
 * 도시 상자 밖 좌표는 뺀다(목록을 돌려준다). 원문(overview)·근거 조각은 싣지 않는다. 부산 build.mjs·public/은 건드리지 않는다.
 * 체험 예약(book/hide)·밤 산길·장날은 이 회차에 입력이 없어 싣지 않는다. `area`는 도시 이름(동네 나누기는 앱 연결 때).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { popScores } from '../famous.mjs';
import { shipReason } from '../reason.mjs';
import { haversine } from '../busan/kakao.mjs';
import { CAFE_WORDS, FAMOUS_TYPE, LEPORTS_TYPE, famousCandidate, famousIds, kakaoIds, quintileScores, reasonProblem } from '../busan/build.mjs';
import { judgeRound } from './rounds.mjs';
import { applyRemap, loadRemap } from '../remap.mjs';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export { CAFE_WORDS, FAMOUS_TYPE, LEPORTS_TYPE, famousCandidate, famousIds, kakaoIds, quintileScores, reasonProblem };

/** pop-criteria.md 7절: 부산은 keep 995곳에 60곳이었다. 같은 비율. */
export const BUSAN_KEEP = 995;
export const BUSAN_FAMOUS = 60;
export const famousCount = (keep) => Math.round((BUSAN_FAMOUS * keep) / BUSAN_KEEP);

/** pop-criteria.md 8절: 도시 상자(TourAPI 좌표 오류를 거르는 네모). */
export const BOXES = {
  강릉: { lat: [37.4, 38.0], lng: [128.4, 129.1] },
  속초: { lat: [38.1, 38.3], lng: [128.4, 128.7] },
  춘천: { lat: [37.6, 38.2], lng: [127.4, 128.1] },
  양양: { lat: [37.85, 38.2], lng: [128.35, 128.85] },
  평창: { lat: [37.2, 37.9], lng: [128.2, 128.9] },
};
export const inBox = (city, p) => {
  const b = BOXES[city];
  return Boolean(b) && p.lat >= b.lat[0] && p.lat <= b.lat[1] && p.lng >= b.lng[0] && p.lng <= b.lng[1];
};

const MOODS = new Set(['rest', 'walk', 'new', 'food']);
const SUBS = { food: new Set(['meal', 'cafe']), new: new Set(['sight', 'do']) };
const cleanName = (s) => String(s).replace(/\s+/g, ' ').trim();
/** 카드 이름: 이름 끝의 「(도시)」 표시만 뗀다(부산 displayName과 같은 뜻). */
export const displayName = (title, city) => cleanName(title).replace(new RegExp(`\\s*\\(${city}\\)$`), '');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

export const OUT = (dest) => resolve(webRoot, `data/${dest}/spots-${dest}.json`);

/** Everything the build reads for `cities` of `dest`. */
export function loadInputs(dest = 'gangwon', cities = ['강릉'], dir = resolve(webRoot, 'review', dest)) {
  const verdicts = new Map();
  const fixes = [];
  const kakao = [];
  const pop = [];
  for (const city of cities) {
    const judgeDir = resolve(dir, `judge-${city}-${judgeRound(city)}`);
    for (const f of readdirSync(judgeDir).filter((f) => /^out-\d{2}\.json$/.test(f)).sort()) for (const v of readJson(resolve(judgeDir, f))) verdicts.set(v.id, v);
    if (existsSync(resolve(judgeDir, 'fixes-01.json'))) fixes.push(...readJson(resolve(judgeDir, 'fixes-01.json')));
    kakao.push(...readJson(resolve(dir, `kakao-${city}-01.json`)).rows);
    pop.push(...readJson(resolve(dir, `pop-${city}-01.json`)).rows);
    // 판정 회차가 바뀌어 새로 잰 곳(measure.mjs --add)은 뒤에 붙여 같은 id의 앞 값을 덮는다
    if (existsSync(resolve(dir, `pop-${city}-01-add.json`))) pop.push(...readJson(resolve(dir, `pop-${city}-01-add.json`)).rows);
  }
  // 주인 결정(review/<dest>/owner-overrides.json): 판정 파일은 그대로 두고 기분만 덮는다. 도시 목록에 든 곳만 쓴다
  const overrides = existsSync(resolve(dir, 'owner-overrides.json')) ? readJson(resolve(dir, 'owner-overrides.json')) : [];
  const items = readJson(resolve(dir, 'scope.json')).items.filter((it) => cities.includes(it.city));
  // 기분 다시 나누기 v5(ADR-0105, criteria-05): 주인 덮어쓰기 다음에 덮는 기분·sub·walkin(review/remap/<dest>.json)
  const remap = loadRemap(dest);
  return { dest, cities, items, verdicts, fixes, overrides, remap, kakao, pop };
}

/** pop-criteria.md 8절(같은 이름): 이름이 같은 곳이 둘 이상이면 (a) 같은 기분이고 주소가 같거나 100m 안이면 같은 곳이라 id가 작은 하나만
 * 싣고, (b) 그 밖에는 다른 곳이라 이름 뒤에 읍·면·동을 붙여 가른다(같은 읍·면·동이면 멈춘다). */
export function dedupe(kept) {
  const byName = new Map();
  for (const k of kept) {
    const name = displayName(k.item.title, k.item.city);
    byName.set(name, [...(byName.get(name) ?? []), k]);
  }
  const drop = new Set();
  const merged = [];
  const renamed = new Map();
  for (const [name, group] of byName) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => (a.item.id < b.item.id ? -1 : 1));
    const live = [];
    for (const k of sorted) {
      const twin = live.find((x) => x.v.mood === k.v.mood && (x.item.addr1 === k.item.addr1 || haversine(x.item.lat, x.item.lng, k.item.lat, k.item.lng) <= 100));
      if (twin) {
        drop.add(k.item.id);
        merged.push({ name, kept: twin.item.id, dropped: k.item.id });
      } else live.push(k);
    }
    if (live.length > 1) {
      const tags = live.map((k) => townOf(k.item));
      if (new Set(tags).size !== tags.length) throw new Error(`same name ${name}: places in the same town cannot be told apart`);
      live.forEach((k, i) => renamed.set(k.item.id, `${name} (${tags[i]})`));
    }
  }
  // 8절 (a) 이름 꼴(2026-10-31, 배포 전 리뷰 4 m-3): 띄어쓰기를 빼고 같거나, 한 이름이 다른 이름(4자 이상)으로 끝나면(「알펜시아리조트」
  // 같은 앞붙이) 같은 이름으로 본다. 같은 곳 조건((a))이 맞을 때 빼기만 하고, 이름을 바꾸지는 않는다
  const bare = (k) => displayName(k.item.title, k.item.city).replace(/\s+/g, '');
  const alike = (a, b) => a === b || (b.length >= 4 && a.endsWith(b)) || (a.length >= 4 && b.endsWith(a));
  const live = [];
  for (const k of [...kept].sort((a, b) => (a.item.id < b.item.id ? -1 : 1))) {
    if (drop.has(k.item.id)) continue;
    const twin = live.find((x) => x.v.mood === k.v.mood && alike(bare(x), bare(k)) && (x.item.addr1 === k.item.addr1 || haversine(x.item.lat, x.item.lng, k.item.lat, k.item.lng) <= 100));
    if (twin) {
      drop.add(k.item.id);
      merged.push({ name: displayName(k.item.title, k.item.city), kept: twin.item.id, dropped: k.item.id });
    } else live.push(k);
  }
  return { rest: kept.filter((k) => !drop.has(k.item.id)), merged, renamed };
}

/** 주소의 읍·면(없으면 괄호 안 동, 없으면 시 다음 낱말). */
export function townOf(item) {
  const words = String(item.addr1).split(/\s+/);
  const after = words.slice(words.findIndex((w, i) => i > 0 && /[시군구]$/.test(w)) + 1);
  const eupmyeon = after.find((w) => /[읍면]$/.test(w));
  if (eupmyeon) return eupmyeon;
  const dong = /\(([^)]*동)\)/.exec(item.addr1)?.[1];
  return dong ?? after[0] ?? item.city;
}

/** The shipped records (scope.json order) and the ids left out: { spots, closed, unknownPosition }. Throws on anything
 * missing or out of rule. Scores and 유명한 곳 are counted over the shipped places only. */
export function build(inputs = loadInputs()) {
  const { items, verdicts: judged, fixes, overrides = [], remap = [], kakao, pop } = inputs;
  // 주인 덮어쓰기: before가 판정과 다르면 멈춘다. 걷기·그 밖은 sub가 없다(SUBS) — 덮은 뒤 sub는 쓰지 않는다
  const verdicts = new Map(judged);
  const itemIds = new Set(items.map((it) => it.id));
  for (const o of overrides.filter((o) => o.type !== 'drop' && itemIds.has(o.id))) {
    const v = judged.get(o.id);
    if (!v || o.field !== 'mood' || v.mood !== o.before) throw new Error(`owner override ${o.id}: mood ${v?.mood} ≠ before ${o.before}`);
    verdicts.set(o.id, { ...v, mood: o.after });
  }
  // ADR-0105: 주인 덮어쓰기 다음에 덮는다(before는 덮은 뒤의 기분). 도시 목록에 든 곳만
  const remapped = applyRemap(verdicts, remap, itemIds);
  for (const [id, v] of remapped.verdicts) verdicts.set(id, v);
  const walkin = remapped.walkin;
  const fixed = new Map(fixes.filter((f) => f.field === 'reason').map((f) => [f.id, f]));
  const volumeById = new Map(pop.map((r) => [r.id, r.volume]));
  const kakaoRow = new Map(kakao.map((r) => [r.id, r]));
  const problems = [];
  const kept = [];
  const closed = [];
  const unknownPosition = [];
  let keepTotal = 0;
  const keepByCity = new Map();
  for (const item of items) {
    const v = verdicts.get(item.id);
    if (!v) {
      problems.push(`${item.id}: no verdict`);
      continue;
    }
    if (!v.keep) continue;
    keepTotal += 1;
    keepByCity.set(item.city, (keepByCity.get(item.city) ?? 0) + 1);
    const k = kakaoRow.get(item.id);
    if (!k) problems.push(`${item.id}: no kakao row (확인 실패)`);
    if (k?.status === 'closed') {
      closed.push(item.id);
      continue;
    }
    if (!inBox(item.city, item)) {
      unknownPosition.push(item.id);
      continue;
    }
    const f = fixed.get(item.id);
    if (f && f.before !== v.reason) problems.push(`${item.id}: fixes before ≠ verdict reason`);
    const reason = shipReason(f ? f.after : v.reason);
    const why = reasonProblem(reason);
    if (why) problems.push(`${item.id}: reason ${why}: ${reason}`);
    if (!MOODS.has(v.mood)) problems.push(`${item.id}: mood ${v.mood}`);
    if (SUBS[v.mood] && !SUBS[v.mood].has(v.sub)) problems.push(`${item.id}: ${v.mood} sub ${v.sub}`);
    if (typeof v.indoor !== 'boolean') problems.push(`${item.id}: indoor ${v.indoor}`);
    if (!Number.isInteger(volumeById.get(item.id))) problems.push(`${item.id}: no search volume (확인 실패) in pop file`);
    if (item.image && !item.image.startsWith('https://')) problems.push(`${item.id}: image not https`);
    kept.push({ item, v, reason });
  }
  if (problems.length) throw new Error(`spots-${inputs.dest}.json: ${problems.length} problem(s)\n  ${problems.slice(0, 20).join('\n  ')}`);

  const { rest, merged, renamed } = dedupe(kept);
  // 주인 결정 「drop」(id·keep·reason): 규칙 밖 중복 쌍에서 한쪽을 뺀다. 남는 쪽(keep)이 출하에 없으면 멈춘다
  const restIds = new Set(rest.map((k) => k.item.id));
  const owned = overrides.filter((o) => o.type === 'drop' && restIds.has(o.id));
  for (const o of owned) {
    if (!o.keep || !o.reason || o.keep === o.id || !restIds.has(o.keep)) throw new Error(`owner drop ${o.id}: keep ${o.keep} is not a shipped place`);
    const it = items.find((x) => x.id === o.id);
    merged.push({ name: displayName(it.title, it.city), kept: o.keep, dropped: o.id, owner: true });
  }
  const ownerDrop = new Set(owned.map((o) => o.id));
  kept.length = 0;
  kept.push(...rest.filter((k) => !ownerDrop.has(k.item.id)));
  const ids = new Set(kept.map((k) => k.item.id));
  const kakaoById = kakaoIds(kakao, ids);
  // pop-criteria.md 10절: 만족도·유명한 곳(개수·pop)은 도시마다 따로 센다(도시 하나면 예전과 같다)
  const scoreById = new Map();
  const pops = new Map();
  for (const city of keepByCity.keys()) {
    const inCity = kept.filter((k) => k.item.city === city);
    const group = (food) => new Map(inCity.filter((k) => (k.v.mood === 'food') === food).map((k) => [k.item.id, volumeById.get(k.item.id)]));
    for (const food of [true, false]) for (const [id, s] of quintileScores(group(food))) scoreById.set(id, s);
    const famous = famousIds(
      inCity.filter((k) => famousCandidate(k.item, { mood: k.v.mood, name: cleanName(k.item.title) })).map((k) => k.item.id),
      volumeById,
      famousCount(keepByCity.get(city)),
    );
    for (const [id, p] of popScores(volumeById, famous)) pops.set(id, p);
  }

  const nameOf = (item) => renamed.get(item.id) ?? displayName(item.title, item.city);
  const names = kept.map(({ item }) => nameOf(item));
  const twice = names.filter((n, i) => names.indexOf(n) !== i);
  if (twice.length) throw new Error(`spots-${inputs.dest}.json: display names shared by two places: ${[...new Set(twice)].join(', ')}`);

  const spots = kept.map(({ item, v, reason }) => ({
    id: item.id,
    name: nameOf(item),
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
    area: item.city,
    // ADR-0074 Amendment 1: 예약 없이 가는 체험(강원에는 예약 경로 자료가 없다)
    ...(walkin.has(item.id) && v.mood === 'new' && v.sub === 'do' ? { walkin: true } : {}),
  }));
  return { spots, closed, unknownPosition, keepTotal, merged, renamed: [...renamed] };
}

export const buildSpots = (inputs = loadInputs()) => build(inputs).spots;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dest, cityArg] = process.argv.slice(2);
  if (!dest || !cityArg) throw new Error('usage: node scripts/curated/build.mjs <dest> <city[,city…]>');
  const { spots, closed, unknownPosition, keepTotal, merged, renamed } = build(loadInputs(dest, cityArg.split(',')));
  const text = JSON.stringify(spots);
  const out = OUT(dest);
  let before = '';
  try {
    before = readFileSync(out, 'utf8');
  } catch {
    /* first build */
  }
  mkdirSync(dirname(out), { recursive: true });
  if (text !== before) writeFileSync(out, text);
  const count = (f) => spots.filter(f).length;
  console.log(
    `spots-${dest}.json ${text === before ? 'unchanged' : 'written'}: ${spots.length}/${keepTotal} places, ${Buffer.byteLength(text)} B, famous ${count((s) => s.famous)}, ` +
      `kakaoPlaceId ${count((s) => s.kakaoPlaceId)}, no photo ${count((s) => !s.image)}, closed ${closed.join(' ') || 0}, left out for an unknown position ${unknownPosition.join(' ') || 0}, merged ${JSON.stringify(merged)}, renamed ${JSON.stringify(renamed)}`,
  );
}
