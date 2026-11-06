/**
 * 부산 세부 지역 12곳 중심 (plans/busan.md S5, 사전등록 review/busan/areas-criteria.md). 결과 생성 실행 — 한 번 돌린다.
 *
 *   npx tsx scripts/busan/areas.mjs     public/spots-busan.json + review/busan/scope.json → review/busan/areas-01.json
 *
 * 곳마다 구·군이 고를 수 있는 동네 가운데 대표 지명이 가장 가까운 동네에 넣고, 중심 = 든 곳의 위도·경도 중앙값. 그다음
 * 사전등록한 점검(slug, 대표 지명, 구포·대항·일광, B7, D1)을 한 번 돌려 결과를 함께 적는다. 점검을 못 넘어도 중심은 그대로 적는다.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AREAS } from '../../src/region/areas.ts';
import { CARD_COUNT, distanceKm, driveMinutes, listed, pickCards, pool, withinReach } from '../../src/pick/pick.ts';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const INPUT_SHA = 'eee2cb7054300f2a79822e575d6dda53818f6c2dd68d034fd973b10a6995a198';
/** 고침 2 (주인 승인): the centre is the 대표 지명 point itself; areas-01.json was the median run. */
export const METHOD = 'landmark';
export const OUT = resolve(webRoot, 'review/busan/areas-02.json');

/** West → east (specs/busan.md 2절). `at`: the 대표 지명 record. */
export const PLAN = [
  { name: '다대포', slug: 'dadaepo', landmark: '다대포해수욕장', at: 'bs-126079' },
  { name: '송도·감천', slug: 'gamcheon', landmark: '감천문화마을', at: 'bs-1997221' },
  { name: '원도심', slug: 'nampo', landmark: '자갈치시장', at: 'bs-132190' },
  { name: '영도', slug: 'yeongdo', landmark: '흰여울마을', at: 'bs-2684712' },
  { name: '부산역·초량', slug: 'choryang', landmark: '이바구길', at: 'bs-2605916' },
  { name: '서면', slug: 'seomyeon', landmark: '서면', at: 'bs-2763900' },
  { name: '동래·금정', slug: 'dongnae', landmark: '범어사', at: 'bs-126148' },
  { name: '오륙도·용호', slug: 'yongho', landmark: '오륙도', at: 'bs-126088' },
  { name: '광안리', slug: 'gwangalli', landmark: '광안대교', at: 'bs-128164' },
  { name: '센텀', slug: 'centum', landmark: '센텀시티', at: 'bs-702551' },
  { name: '해운대', slug: 'haeundae', landmark: '해운대해수욕장', at: 'bs-126081' },
  { name: '송정·기장', slug: 'songjeong', landmark: '해동용궁사', at: 'bs-126848' },
];
/** 구·군 → the areas a place there may go to (areas-criteria.md 방법 2). */
export const DISTRICT = {
  강서구: ['다대포'],
  사하구: ['다대포', '송도·감천'],
  서구: ['송도·감천', '원도심'],
  중구: ['원도심'],
  영도구: ['영도'],
  동구: ['부산역·초량'],
  부산진구: ['서면'],
  연제구: ['서면', '동래·금정'],
  동래구: ['동래·금정'],
  금정구: ['동래·금정'],
  북구: ['동래·금정'],
  사상구: ['동래·금정'],
  남구: ['오륙도·용호'],
  수영구: ['광안리'],
  해운대구: ['센텀', '해운대', '송정·기장'],
  기장군: ['송정·기장'],
};
/** The 구·군 of an address: the word after the city's name, or (고침 1) the table's name that word starts with
 * (TourAPI `부산광역시 해운대구광역시 …`). */
export function districtOf(addr) {
  const word = /^(?:부산광역시|부산광역|부산)\s+(\S+)/.exec(String(addr ?? '').trim())?.[1] ?? '';
  return Object.keys(DISTRICT).find((d) => word === d) ?? Object.keys(DISTRICT).find((d) => word.startsWith(d)) ?? null;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round4 = (v) => Math.round(v * 1e4) / 1e4;

/** The centres (areas-criteria.md 방법 1~3). Throws on a district the table does not know. */
export function centres(spots, addrById, method = METHOD) {
  const byId = new Map(spots.map((s) => [s.id, s]));
  const seed = new Map(PLAN.map((a) => [a.name, byId.get(a.at)]));
  for (const a of PLAN) if (!seed.get(a.name)) throw new Error(`areas: 대표 지명 ${a.at} is not shipped`);
  const members = new Map(PLAN.map((a) => [a.name, []]));
  for (const s of spots.filter(listed)) {
    const d = districtOf(addrById.get(s.id));
    const can = d && DISTRICT[d];
    if (!can) throw new Error(`areas: ${s.id} district ${d} (${addrById.get(s.id)}) not in the table`);
    let best = can[0];
    for (const n of can) if (distanceKm(seed.get(n), s) < distanceKm(seed.get(best), s)) best = n;
    members.get(best).push(s);
  }
  return PLAN.map((a) => {
    const m = members.get(a.name);
    const at = seed.get(a.name);
    const c = method === 'landmark' ? { lat: round4(at.lat), lng: round4(at.lng) } : { lat: round4(median(m.map((s) => s.lat))), lng: round4(median(m.map((s) => s.lng))) };
    return { name: a.name, slug: a.slug, label: a.name, landmark: a.landmark, ...c, places: m.length, landmarkKm: Math.round(distanceKm(c, seed.get(a.name)) * 100) / 100 };
  });
}

const nearest = (areas, p) => areas.reduce((b, a) => (distanceKm(p, a) < distanceKm(p, b) ? a : b));
const DAY = '2026-10-20';

/** The pre-registered checks (areas-criteria.md 점검 1~5): each a list of what failed ([] = passed). */
export function checks(areas, spots) {
  const byId = new Map(spots.map((s) => [s.id, s]));
  const out = {};
  const slugs = areas.map((a) => a.slug);
  out.slug = [...slugs.filter((s, i) => slugs.indexOf(s) !== i), ...slugs.filter((s) => AREAS.some((j) => j.slug === s))];
  out.landmark = PLAN.filter((a) => nearest(areas, byId.get(a.at)).name !== a.name).map((a) => `${a.landmark} → ${nearest(areas, byId.get(a.at)).name}`);
  out.outskirts = [
    ['bs-1250885', '동래·금정'],
    ['bs-2785960', '다대포'],
    ['bs-126098', '송정·기장'],
  ]
    .filter(([id, want]) => nearest(areas, byId.get(id)).name !== want)
    .map(([id, want]) => `${byId.get(id).name} → ${nearest(areas, byId.get(id)).name} (want ${want})`);
  const visible = (sub) => spots.filter((s) => listed(s) && s.mood === 'new' && s.sub === sub).length >= CARD_COUNT;
  const combos = [
    ['rest'],
    ['walk'],
    ['famous'],
    ['any'],
    ['food', 'meal'],
    ['food', 'cafe'],
    ['new', 'mix'],
    ...['sight', 'do'].filter(visible).map((t) => ['new', t]),
  ];
  out.b7 = [];
  for (const a of areas)
    for (const reach of ['walk', 'drive30', 'drive60'])
      for (const [button, tab] of combos)
        for (const indoor of [false, true]) {
          const n = pickCards(spots, a, button, {}, tab, reach, indoor, DAY, false).cards.length;
          if (n !== CARD_COUNT) out.b7.push(`${a.name} ${reach} ${button}${tab ? `:${tab}` : ''}${indoor ? ' 실내' : ''} → ${n}`);
        }
  out.d1 = areas
    .map((a) => ({ a, n: pool(spots, a, 'famous', undefined, 'drive30', false, DAY, false).filter((c) => withinReach('drive30', a, c.spot)).length }))
    .filter(({ n }) => n < CARD_COUNT)
    .map(({ a, n }) => `${a.name}: 범위 안 유명한 곳 ${n}`);
  out.tabs = combos.map((c) => c.join(':'));
  return out;
}

/** m9 기록만: 부산 10쌍의 앱 이동 시간(직선 × 1.3 ÷ 40km/h). */
export const PAIRS = [
  ['bs-126081', 'bs-126848'],
  ['bs-126081', 'bs-128164'],
  ['bs-132190', 'bs-1997221'],
  ['bs-132190', 'bs-2684712'],
  ['bs-2763900', 'bs-126148'],
  ['bs-2763900', 'bs-126081'],
  ['bs-126079', 'bs-1997221'],
  ['bs-2605916', 'bs-126088'],
  ['bs-1250885', 'bs-126148'],
  ['bs-2785960', 'bs-126079'],
];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = readFileSync(resolve(webRoot, 'public/spots-busan.json'));
  const sha = createHash('sha256').update(text).digest('hex');
  if (sha !== INPUT_SHA) throw new Error(`areas: spots-busan.json sha256 ${sha} ≠ the registered ${INPUT_SHA}`);
  const spots = JSON.parse(text.toString('utf8'));
  const addrById = new Map(JSON.parse(readFileSync(resolve(webRoot, 'review/busan/scope.json'), 'utf8')).items.map((i) => [i.id, i.addr1]));
  const areas = centres(spots, addrById);
  const result = checks(areas, spots);
  const byId = new Map(spots.map((s) => [s.id, s]));
  const pairs = PAIRS.map(([a, b]) => {
    const km = distanceKm(byId.get(a), byId.get(b));
    return { from: byId.get(a).name, to: byId.get(b).name, km: Math.round(km * 10) / 10, appMinutes: driveMinutes(km), mapMinutes: null };
  });
  const passed = ['slug', 'landmark', 'outskirts', 'b7', 'd1'].every((k) => result[k].length === 0);
  writeFileSync(OUT, `${JSON.stringify({ criteria: 'review/busan/areas-criteria.md (고침 2)', method: METHOD, input: { file: 'public/spots-busan.json', sha256: sha }, passed, areas, checks: result, pairs }, null, 2)}\n`);
  console.log(`areas-02.json: ${passed ? 'PASSED' : 'FAILED'}`);
  for (const a of areas) console.log(`  ${a.name.padEnd(6)} ${a.lat}, ${a.lng}  places ${a.places}  ↔ ${a.landmark} ${a.landmarkKm} km`);
  for (const [k, v] of Object.entries(result)) if (k !== 'tabs') console.log(`  ${k}: ${v.length ? v.join(' | ') : 'ok'}`);
  console.log(`  tabs: ${result.tabs.join(', ')}`);
}
