// S2 선택 로직 (plans/tomorrow-picker.md) — coverage tests use the real public/spots.json.
import { describe, expect, it } from 'vitest';
import { AREAS } from '../src/region/areas';
import { DEFAULT_REACH, REACHES, distanceKm, driveMinutes, formatMinutes, islandOf, listed, nearBand, pickCards, travel, travelText, walkMinutes, withinReach, type Button, type Histories, type Point, type NewSub, type Reach, type Spot, type Tab } from '../src/pick/pick';
import { BUTTONS, ORIGINS, SUBS, realSpots } from './fixtures';

/** specs/ranking.md 정렬 키 (ADR-0108): 거리 칸 오름차순 → 점수 내림차순 → 실제 거리 오름차순 → id. */
const byRank = (origin: Point) => (a: { spot: Spot }, b: { spot: Spot }) =>
  nearBand(distanceKm(origin, a.spot)) - nearBand(distanceKm(origin, b.spot)) ||
  b.spot.score - a.spot.score ||
  distanceKm(origin, a.spot) - distanceKm(origin, b.spot) ||
  a.spot.id.localeCompare(b.spot.id);

const combos = Object.entries(ORIGINS).flatMap(([name, origin]) => BUTTONS.map((button) => ({ name, origin, button })));

// Changed on purpose (ADR-0092): 6 buttons (유명한 데 가 보고 싶어 = the outdoor 유명한 곳, whatever their mood)
describe('S2 real data: 4 origins × 6 buttons', () => {
  it('uses the real file (sanity)', () => {
    expect(realSpots.length).toBeGreaterThan(0);
    expect(combos).toHaveLength(24);
  });

  it.each(combos)('$name / $button → exactly 3 distinct spots', ({ origin, button }) => {
    const { cards } = pickCards(realSpots, origin, button);
    expect(cards).toHaveLength(3);
    expect(new Set(cards.map((c) => c.spot.id)).size).toBe(3);
  });

  // Changed on purpose (ADR-0060): the default range is 차로 30분, no longer an hour.
  it.each(combos)('$name / $button → every card ≤ 30분 (default 차로 30분)', ({ origin, button }) => {
    expect(DEFAULT_REACH).toBe('drive30');
    const { cards } = pickCards(realSpots, origin, button);
    for (const c of cards) {
      expect(c.minutes).toBe(driveMinutes(distanceKm(origin, c.spot)));
      expect(c.minutes).toBeLessThanOrEqual(30);
    }
  });

  it.each(Object.entries(ORIGINS))('%s / any → one each of rest, walk, new — never food', (_, origin) => {
    const { cards } = pickCards(realSpots, origin, 'any');
    expect(cards.map((c) => c.spot.mood).sort()).toEqual(['new', 'rest', 'walk']);
  });

  it.each(Object.entries(ORIGINS))('%s / food never mixes into rest, walk, new; food button is food only', (_, origin) => {
    for (const b of ['rest', 'walk', 'new'] as const) {
      expect(pickCards(realSpots, origin, b).cards.every((c) => c.spot.mood === b)).toBe(true);
    }
    expect(pickCards(realSpots, origin, 'food').cards.every((c) => c.spot.mood === 'food')).toBe(true);
  });

  it.each(combos)('$name / $button → re-tap shows no card from the previous 3', ({ origin, button }) => {
    const first = pickCards(realSpots, origin, button);
    const second = pickCards(realSpots, origin, button, first.histories);
    const before = new Set(first.cards.map((c) => c.spot.id));
    expect(second.cards).toHaveLength(3);
    expect(second.cards.filter((c) => before.has(c.spot.id))).toEqual([]);
  });

  // Changed on purpose (ADR-0108): nearest 거리 칸 first; score only within a 칸, then the trip, then id.
  it.each(combos)('$name / $button → the nearest-band spots in range, nearest first', ({ origin, button }) => {
    const { cards } = pickCards(realSpots, origin, button);
    // 유명한 데 (ADR-0092 Amendment 2): its own order, tested in famous-pick.test.ts
    if (button === 'famous') return;
    expect(cards.map((c) => c.spot.id)).toEqual([...cards].sort(byRank(origin)).map((c) => c.spot.id));
    if (button === 'any') return;
    // 'food' with no sub given defaults to 'meal' (S2/S3 toggle default).
    const best = realSpots
      .filter((s) => listed(s) && s.mood === button && (button !== 'food' || s.sub === 'meal') && withinReach(DEFAULT_REACH, origin, s))
      .map((spot) => ({ spot }))
      .sort(byRank(origin))
      .slice(0, 3)
      .map((c) => c.spot.id);
    expect(cards.map((c) => c.spot.id)).toEqual(best);
  });
});

const subCombos = Object.entries(ORIGINS).flatMap(([name, origin]) => SUBS.map((sub) => ({ name, origin, sub })));

describe('food sub-type split (식사 | 카페·디저트)', () => {
  it.each(subCombos)('$name / food·$sub → exactly 3 distinct spots, all mood=food & sub=$sub', ({ origin, sub }) => {
    const { cards } = pickCards(realSpots, origin, 'food', {}, sub);
    expect(cards).toHaveLength(3);
    expect(new Set(cards.map((c) => c.spot.id)).size).toBe(3);
    for (const c of cards) {
      expect(c.spot.mood).toBe('food');
      expect(c.spot.sub).toBe(sub);
    }
  });

  it.each(subCombos)('$name / food·$sub → every card ≤ 60분', ({ origin, sub }) => {
    const { cards } = pickCards(realSpots, origin, 'food', {}, sub);
    for (const c of cards) expect(c.minutes).toBeLessThanOrEqual(60);
  });

  it('no sub given defaults to meal', () => {
    for (const origin of Object.values(ORIGINS)) {
      const withDefault = pickCards(realSpots, origin, 'food');
      const withMeal = pickCards(realSpots, origin, 'food', {}, 'meal');
      expect(withDefault.cards.map((c) => c.spot.id)).toEqual(withMeal.cards.map((c) => c.spot.id));
      for (const c of withDefault.cards) expect(c.spot.sub).toBe('meal');
    }
  });

  it('meal and cafe rotation histories are kept separately: a cafe tap in between does not advance the meal pool', () => {
    // synthetic: exactly 3 meal + 3 cafe candidates → without history the same 3 always come back.
    const mk = (i: number, sub: 'meal' | 'cafe'): Spot => ({
      id: `${sub}${i}`, name: `${sub}${i}`, lat: 33.5, lng: 126.5 + i * 0.001, mood: 'food', sub,
      reason: '테스트용 이유 문장입니다 열여덟 글자 이상', image: 'https://example.com/x.jpg', kakaoPlaceId: String(2000 + i), bookable: false, score: 3,
    });
    const spots = [0, 1, 2].flatMap((i) => [mk(i, 'meal'), mk(i, 'cafe')]);
    const origin = { lat: 33.5, lng: 126.5 };
    let h: Histories = {};
    const meal1 = pickCards(spots, origin, 'food', h, 'meal');
    h = meal1.histories;
    pickCards(spots, origin, 'food', h, 'cafe'); // cafe tap must not touch the meal history
    const meal2 = pickCards(spots, origin, 'food', h, 'meal');
    expect(meal2.cards.map((c) => c.spot.id).sort()).toEqual(meal1.cards.map((c) => c.spot.id).sort());
  });
});

describe('새로운 거 섞어서 · 구경 · 체험 (ADR-0064, specs/new-sub.md)', () => {
  const TABS: NewSub[] = ['mix', 'sight', 'do'];

  it('N2 15 areas × 3 ranges × 3 tabs → 3 distinct cards (빈손 0); 구경 = sight only, 체험 = do only, 섞어서 = any kind', () => {
    let checked = 0;
    for (const area of AREAS) {
      for (const reach of REACHES) {
        for (const tab of TABS) {
          const why = `${area.name} / ${reach} / ${tab}`;
          const { cards } = pickCards(realSpots, area, 'new', {}, tab, reach);
          expect(cards, why).toHaveLength(3);
          expect(new Set(cards.map((c) => c.spot.id)).size, why).toBe(3);
          for (const c of cards) {
            expect(c.spot.mood, why).toBe('new');
            if (tab !== 'mix') expect(c.spot.sub, why).toBe(tab);
          }
          checked++;
        }
      }
    }
    expect(checked).toBe(15 * 3 * 3);
  });

  it('N3 섞어서 is the default and the same as before the tabs: no tab = mix, and the pool is every new spot', () => {
    for (const area of AREAS) {
      for (const reach of REACHES) {
        const ids = (tab?: NewSub) => pickCards(realSpots, area, 'new', {}, tab, reach).cards.map((c) => c.spot.id);
        expect(ids(), `${area.name} / ${reach}`).toEqual(ids('mix'));
      }
    }
    // the food sub never filters 새로운 거, and the 새로운 거 tab never filters food
    const o = AREAS[0];
    expect(pickCards(realSpots, o, 'new', {}, 'cafe').cards).toEqual(pickCards(realSpots, o, 'new', {}, 'mix').cards);
    expect(pickCards(realSpots, o, 'food', {}, 'sight').cards).toEqual(pickCards(realSpots, o, 'food', {}, 'meal').cards);
  });

  it('아무거나 takes its 새로운 거 card from the mixed pool whatever tab was last used', () => {
    const o = AREAS[3];
    const a = pickCards(realSpots, o, 'any', {}, 'sight');
    const b = pickCards(realSpots, o, 'any', {}, 'do');
    const c = pickCards(realSpots, o, 'any');
    expect(a.cards).toEqual(c.cards);
    expect(b.cards).toEqual(c.cards);
    expect(Object.keys(c.histories)).toEqual(['any']);
  });

  it('history keys new:mix / new:sight / new:do; each tab rotates on its own', () => {
    const mk = (i: number, sub: 'sight' | 'do'): Spot => ({
      id: `${sub}${i}`, name: `${sub}${i}`, lat: 33.5, lng: 126.5 + i * 0.001, mood: 'new', sub,
      reason: '테스트용 이유 문장입니다 열여덟 글자 이상', image: 'https://example.com/x.jpg', kakaoPlaceId: String(3000 + i), bookable: false, score: 3,
    });
    // exactly 3 sight + 3 do → without history each tab always brings back the same 3
    const spots = [0, 1, 2].flatMap((i) => [mk(i, 'sight'), mk(i, 'do')]);
    const origin = { lat: 33.5, lng: 126.5 };
    const sight1 = pickCards(spots, origin, 'new', {}, 'sight');
    expect(Object.keys(sight1.histories)).toEqual(['new:sight']);
    const mix = pickCards(spots, origin, 'new', sight1.histories, 'mix');
    const doo = pickCards(spots, origin, 'new', mix.histories, 'do');
    expect(Object.keys(doo.histories).sort()).toEqual(['new:do', 'new:mix', 'new:sight']);
    expect(doo.cards.every((c) => c.spot.sub === 'do')).toBe(true);
    // 섞어서 and 체험 taps in between do not advance 구경
    const sight2 = pickCards(spots, origin, 'new', doo.histories, 'sight');
    expect(sight2.cards.map((c) => c.spot.id).sort()).toEqual(sight1.cards.map((c) => c.spot.id).sort());
    expect(sight2.wrapped).toBe(true);
  });
});

describe('S2 rotation on a synthetic set', () => {
  const at = (i: number, mood: Spot['mood'] = 'walk', score = 3): Spot => ({
    id: `s${i}`, name: `스팟${i}`, lat: 33.5, lng: 126.5 + i * 0.001, mood,
    reason: '테스트용 이유 문장입니다 열여덟 글자 이상', image: 'https://example.com/x.jpg', kakaoPlaceId: String(1000 + i), bookable: false, score,
  });
  const origin = { lat: 33.5, lng: 126.5 };

  it('with exactly 6 candidates, taps alternate between two disjoint sets of 3', () => {
    const spots = Array.from({ length: 6 }, (_, i) => at(i));
    let h: Histories = {};
    let prev: string[] = [];
    for (let tap = 0; tap < 8; tap++) {
      const r = pickCards(spots, origin, 'walk', h);
      const ids = r.cards.map((c) => c.spot.id);
      expect(ids).toHaveLength(3);
      expect(ids.filter((id) => prev.includes(id))).toEqual([]);
      prev = ids;
      h = r.histories;
    }
  });

  it('never repeats the previous 3 over many taps with 7+ candidates', () => {
    const spots = Array.from({ length: 11 }, (_, i) => at(i));
    let h: Histories = {};
    let prev: string[] = [];
    for (let tap = 0; tap < 20; tap++) {
      const r = pickCards(spots, origin, 'walk', h);
      const ids = r.cards.map((c) => c.spot.id);
      expect(new Set(ids).size).toBe(3);
      expect(ids.filter((id) => prev.includes(id))).toEqual([]);
      prev = ids;
      h = r.histories;
    }
  });

  // Changed on purpose (ADR-0108): the nearer 거리 칸 comes first, score only within a 칸; the rotation then
  // moves down the same ranking.
  it('first tap shows the nearest band first, best-scored within it; second tap moves to the next in rank', () => {
    // s0..s5 lie ~90m apart: s0..s4 are the 걸어서 5분 칸, s5 (~460m) the 10분 칸 — so s5, the best score, comes last.
    const spots = [at(5, 'walk', 5), at(1, 'walk', 3), at(4, 'walk', 2), at(0, 'walk', 3), at(3, 'walk', 4), at(2, 'walk', 3)];
    const a = pickCards(spots, origin, 'walk');
    expect(a.cards.map((c) => c.spot.id)).toEqual(['s3', 's0', 's1']);
    const b = pickCards(spots, origin, 'walk', a.histories);
    expect(b.cards.map((c) => c.spot.id)).toEqual(['s2', 's4', 's5']);
  });

  it('any: re-tap changes all three and keeps 3 different moods', () => {
    const spots = [0, 1, 2].flatMap((i) => [at(i, 'rest'), at(i + 10, 'walk'), at(i + 20, 'new'), at(i + 30, 'food')]);
    const a = pickCards(spots, origin, 'any');
    const b = pickCards(spots, origin, 'any', a.histories);
    expect(b.cards.map((c) => c.spot.mood).sort()).toEqual(['new', 'rest', 'walk']);
    const before = new Set(a.cards.map((c) => c.spot.id));
    expect(b.cards.filter((c) => before.has(c.spot.id))).toEqual([]);
  });

  it('widens beyond 60분 rather than showing fewer than 3 (빈손 없음)', () => {
    const far = [0, 1, 2].map((i) => ({ ...at(i), lng: 126.95 + i * 0.01 }));
    const { cards } = pickCards(far, { lat: 33.5, lng: 126.2 }, 'walk', {}, undefined, 'drive60');
    expect(cards).toHaveLength(3);
    expect(Math.min(...cards.map((c) => c.minutes))).toBeGreaterThan(60);
  });
});

describe('S2 이동시간 공식: 직선거리 × 1.3 ÷ 40km/h × 60, 5분 단위 반올림, 최소 5분', () => {
  it.each([
    [0, 5],
    [0.5, 5], // 0.975분 → 0 → 최소 5
    [2, 5], // 3.9분 → 5
    [3.2, 5], // 6.24분 → 5
    [4, 10], // 7.8분 → 10
    [10, 20], // 19.5분 → 20
    [15, 30], // 29.25분 → 30
    [30, 60], // 58.5분 → 60
    [31, 60], // 60.45분 → 60
    [32, 60], // 62.4분 → 60
    [33, 65], // 64.35분 → 65
  ])('%s km → %s분', (km, min) => {
    expect(driveMinutes(km)).toBe(min);
  });

  it('haversine distance matches a known pair (제주시청 ↔ 서귀포시청 ≈ 27 km)', () => {
    const d = distanceKm(ORIGINS.제주시, ORIGINS.서귀포);
    expect(d).toBeGreaterThan(27);
    expect(d).toBeLessThan(28);
  });
});

describe('S33 섬 스팟 — 배가 필요한 곳은 차로 몇 분이라고 하지 않는다', () => {
  const areas = (n: string) => AREAS.find((a) => a.name === n)!;

  it('islandOf catches exactly 우도 65 · 비양도 6 · 가파도 4 · 마라도 10 · 차귀도 1 in spots.json', () => {
    const counts: Record<string, number> = {};
    for (const s of realSpots) {
      const i = islandOf(s);
      if (i) counts[i] = (counts[i] ?? 0) + 1;
    }
    // 비양도 6: the island's own pin moved onto it (corrections-02, ADR-0071)
    expect(counts).toEqual({ 우도: 65, 비양도: 6, 가파도: 4, 마라도: 10, 차귀도: 1 });
  });

  it('main-island edge spots (성산포·종달·협재·금능·모슬포) stay on the main island', () => {
    for (const p of [
      { lat: 33.4623, lng: 126.9365 }, // 성산포항
      { lat: 33.4945, lng: 126.9063 }, // 종달리
      { lat: 33.3940, lng: 126.2397 }, // 협재
      { lat: 33.3895, lng: 126.2350 }, // 금능
      { lat: 33.2140, lng: 126.2510 }, // 모슬포
    ]) {
      expect(islandOf(p)).toBeNull();
    }
    expect(islandOf(areas('우도'))).toBe('우도');
  });

  it('from 성산 to a 우도 spot → "우도라서 배를 타야 해요"; from 우도 to the main island → "본섬이라 …"', () => {
    const udo = realSpots.find((s) => islandOf(s) === '우도')!;
    const main = realSpots.find((s) => !islandOf(s))!;
    expect(travelText(travel(areas('성산'), false, udo), '성산에서')).toBe('우도라서 배를 타야 해요');
    expect(travelText(travel(areas('우도'), false, main), '우도에서')).toBe('본섬이라 배를 타고 나가야 해요');
    expect(travelText(travel(areas('우도'), false, udo), '우도에서')).toBe('같은 우도 안이에요');
    const mara = realSpots.find((s) => islandOf(s) === '마라도')!;
    expect(travelText(travel(areas('대정'), false, mara))).toBe('마라도라서 배를 타야 해요');
  });

  it('every area × button: no card on another island is ever given a drive time', () => {
    for (const area of AREAS) {
      for (const b of BUTTONS) {
        for (const c of pickCards(realSpots, area, b).cards) {
          const t = travel(area, false, c.spot);
          if (islandOf(area) !== islandOf(c.spot)) expect(t.kind).toMatch(/^ferry/);
        }
      }
    }
  });
});

describe('S12 이동 문구 — 출발지·걷기·시간 표기', () => {
  it('walks only from a real position under 1km; an area centre never "walks"', () => {
    const near = { lat: 33.5, lng: 126.505 }; // ~0.46km from (33.5, 126.5)
    expect(travel({ lat: 33.5, lng: 126.5 }, true, near)).toEqual({ kind: 'walk', minutes: walkMinutes(distanceKm({ lat: 33.5, lng: 126.5 }, near)) });
    expect(travel({ lat: 33.5, lng: 126.5 }, false, near).kind).toBe('drive');
    expect(travelText({ kind: 'walk', minutes: 10 }, '여기서')).toBe('여기서 걸어서 약 10분');
  });

  it('walkMinutes: km × 1.3 ÷ 4.5km/h, 5-minute steps, at least 5', () => {
    expect(walkMinutes(0)).toBe(5);
    expect(walkMinutes(0.5)).toBe(10); // 8.67 → 10
    expect(walkMinutes(0.9)).toBe(15); // 15.6 → 15
  });

  it('formatMinutes: under an hour in 분, then 시간 (+ 분)', () => {
    expect(formatMinutes(5)).toBe('5분');
    expect(formatMinutes(60)).toBe('1시간');
    expect(formatMinutes(70)).toBe('1시간 10분');
    expect(travelText({ kind: 'drive', minutes: 70 }, '애월에서')).toBe('애월에서 차로 약 1시간 10분');
    expect(travelText({ kind: 'drive', minutes: 15 })).toBe('차로 약 15분');
  });
});

describe('S34 한 바퀴 (wrapped)', () => {
  const at = (i: number): Spot => ({
    id: `w${i}`, name: `스팟${i}`, lat: 33.5, lng: 126.5 + i * 0.001, mood: 'walk',
    reason: '테스트용 이유 문장입니다 열여덟 글자 이상', image: 'https://example.com/x.jpg', kakaoPlaceId: String(3000 + i), bookable: false, score: 3,
  });
  it('is false while unseen places remain, true on the tap that starts the pool over', () => {
    const spots = Array.from({ length: 6 }, (_, i) => at(i));
    const o = { lat: 33.5, lng: 126.5 };
    const a = pickCards(spots, o, 'walk');
    expect(a.wrapped).toBe(false);
    const b = pickCards(spots, o, 'walk', a.histories);
    expect(b.wrapped).toBe(false); // the second 3 are all new
    const c = pickCards(spots, o, 'walk', b.histories);
    expect(c.wrapped).toBe(true); // everything seen → back to the start
    expect(c.cards.map((x) => x.spot.id)).toEqual(['w0', 'w1', 'w2']);
  });

  it('real data: a first pick is never "wrapped"', () => {
    for (const o of Object.values(ORIGINS)) for (const b of BUTTONS) expect(pickCards(realSpots, o, b).wrapped).toBe(false);
  });
});

describe('비 와요(실내만) (ADR-0065, specs/indoor.md)', () => {
  const LISTS: [Button, Tab?][] = [['rest'], ['walk'], ['new', 'mix'], ['new', 'sight'], ['new', 'do'], ['food', 'meal'], ['food', 'cafe'], ['any']];
  const inList = (b: Button, sub: Tab | undefined, s: Spot) => listed(s) && s.mood === b && (!sub || sub === 'mix' || s.sub === sub);

  it('I2 15 areas × 3 ranges × 8 lists → 3 distinct cards, all indoor (빈손 0); none beyond the range when 3 or more indoor are in it', () => {
    let checked = 0;
    for (const area of AREAS) {
      for (const [b, sub] of LISTS) {
        for (const reach of REACHES) {
          const why = `${area.name} / ${b}${sub ? `:${sub}` : ''} / ${reach}`;
          const { cards } = pickCards(realSpots, area, b, {}, sub, reach, true);
          expect(cards, why).toHaveLength(3);
          expect(new Set(cards.map((c) => c.spot.id)).size, why).toBe(3);
          for (const c of cards) {
            expect(c.spot.indoor, `${why} / ${c.spot.name}`).toBe(true);
            if (b === 'any' || b === 'walk') continue; // 아무거나 draws per mood; 걷기 widens to 구경 (below)
            expect(inList(b, sub, c.spot), `${why} / ${c.spot.name}`).toBe(true);
            const near = realSpots.filter((s) => s.indoor && inList(b, sub, s) && withinReach(reach, area, s));
            if (near.length >= 3) expect(withinReach(reach, area, c.spot), `${why} / ${c.spot.name}`).toBe(true);
          }
          checked++;
        }
      }
    }
    expect(checked).toBe(15 * 8 * 3);
  });

  it('I2 걷기 has fewer than 3 indoor places on the island: it widens to indoor 구경', () => {
    const walkIndoor = realSpots.filter((s) => s.mood === 'walk' && s.indoor);
    expect(walkIndoor.length).toBeLessThan(3);
    for (const area of AREAS) {
      for (const reach of REACHES) {
        const { cards } = pickCards(realSpots, area, 'walk', {}, undefined, reach, true);
        for (const c of cards) expect(c.spot.mood === 'walk' || (c.spot.mood === 'new' && c.spot.sub === 'sight'), area.name).toBe(true);
      }
    }
    // with 3 or more indoor walk places, no widening to 구경
    const mk = (id: string, mood: 'walk' | 'new', km: number): Spot => ({
      id, name: id, lat: 33.5, lng: 126.5 + km / 92.8, mood, ...(mood === 'new' ? { sub: 'sight' as const } : {}), indoor: true,
      reason: '테스트용 이유 문장입니다 열여덟 글자 이상', image: 'https://example.com/x.jpg', kakaoPlaceId: null, bookable: false, score: 3,
    });
    const o = { lat: 33.5, lng: 126.5 };
    const three = [mk('w1', 'walk', 1), mk('w2', 'walk', 2), mk('w3', 'walk', 3), mk('s1', 'new', 0.5)];
    expect(pickCards(three, o, 'walk', {}, undefined, 'drive30', true).cards.map((c) => c.spot.id).sort()).toEqual(['w1', 'w2', 'w3']);
    expect(pickCards(three.filter((s) => s.id !== 'w3'), o, 'walk', {}, undefined, 'drive30', true).cards.map((c) => c.spot.id).sort()).toEqual(['s1', 'w1', 'w2']);
  });

  it('I2 아무거나 never shows the same place twice, even when 걷기 widened to 구경', () => {
    for (const area of AREAS) {
      for (const reach of REACHES) {
        let h: Histories = {};
        for (let tap = 0; tap < 3; tap++) {
          const r = pickCards(realSpots, area, 'any', h, undefined, reach, true);
          expect(new Set(r.cards.map((c) => c.spot.id)).size, `${area.name} / ${reach} / ${tap}`).toBe(r.cards.length);
          h = r.histories;
        }
      }
    }
  });

  it('I3 off is the default and the same as before: indoor false / missing = every place', () => {
    for (const area of AREAS.slice(0, 5)) {
      for (const [b, sub] of LISTS) {
        const ids = (indoor?: boolean) => pickCards(realSpots, area, b, {}, sub, 'drive30', indoor).cards.map((c) => c.spot.id);
        expect(ids(false), `${area.name} / ${b}`).toEqual(ids());
      }
    }
    // a spot without the field counts as outdoor
    const s = { ...realSpots.find((x) => x.mood === 'rest')! };
    delete s.indoor;
    expect(pickCards([s], s, 'rest', {}, undefined, 'drive30', true).cards).toEqual([]);
  });
});

describe('오일장 장날 (ADR-0066, specs/market-days.md M3)', () => {
  const o = { lat: 33.5, lng: 126.5 };
  const mk = (id: string, km: number, score: number, market?: Spot['market']): Spot => ({
    id, name: id, lat: 33.5, lng: 126.5 + km / 92.8, mood: 'new', sub: 'sight', indoor: false,
    reason: '테스트용 이유 문장입니다 열여덟 글자 이상', image: 'https://example.com/x.jpg', kakaoPlaceId: null, bookable: false, score,
    ...(market ? { market } : {}),
  });
  const JEJU = { days: [2, 7, 12, 17, 22, 27], label: '2·7일' };
  const DAEJEONG = { days: [1, 6, 11, 16, 21, 26, 31], label: '1·6일', noFirstAfter31: true };
  const ids = (spots: Spot[], day?: string) => pickCards(spots, o, 'new', {}, 'sight', 'drive30', false, day).cards.map((c) => c.spot.id);

  it('on a market day the market leads the cards with the same score; its score is not raised', () => {
    // all in one 거리 칸 (차로 5분), so the 칸 does not decide (ADR-0108)
    const spots = [mk('a', 1.5, 4), mk('b', 2, 4), mk('m', 3, 4, JEJU), mk('top', 3.5, 5)];
    expect(ids(spots, '2026-10-02')).toEqual(['top', 'm', 'a']);
    // not a market day: the usual order (score → trip → id), the market falls out of the 3
    expect(ids(spots, '2026-10-03')).toEqual(['top', 'a', 'b']);
    // no day given: as before
    expect(ids(spots)).toEqual(['top', 'a', 'b']);
    // a lower score never jumps ahead
    expect(ids([mk('a', 1.5, 4), mk('b', 2, 4), mk('c', 3, 4), mk('m', 1.5, 3, JEJU)], '2026-10-02')).toEqual(['a', 'b', 'c']);
    expect(pickCards(spots, o, 'new', {}, 'sight', 'drive30', false, '2026-10-02').cards.find((c) => c.spot.id === 'm')!.spot.score).toBe(4);
  });

  it('a market the source says is closed that day (대정, the 1st after a 31-day month) is left out; other days it stays', () => {
    const spots = [mk('d', 1, 5, DAEJEONG), mk('a', 2, 3), mk('b', 3, 3), mk('c', 4, 3)];
    expect(ids(spots, '2026-11-01')).toEqual(['a', 'b', 'c']);
    expect(ids(spots, '2026-10-31')).toEqual(['d', 'a', 'b']);
    expect(ids(spots, '2026-11-02')).toEqual(['d', 'a', 'b']); // off, not closed: kept
    expect(ids(spots, '2026-10-01')).toEqual(['d', 'a', 'b']); // September has 30 days
  });

  it('M3 real data: the 9 markets are 구경; on 대정\'s closed day 15 areas × 3 ranges × 새로운 거 3 tabs and 아무거나 still give 3 distinct cards, never 대정', () => {
    const markets = realSpots.filter((s) => s.market);
    expect(markets).toHaveLength(9);
    const daejeong = markets.find((s) => s.name === '대정오일시장')!;
    for (const day of ['2026-11-01', '2026-10-31', '2026-10-02']) {
      for (const area of AREAS) {
        for (const reach of REACHES) {
          for (const [b, sub] of [['new', 'mix'], ['new', 'sight'], ['new', 'do'], ['any']] as [Button, Tab?][]) {
            const why = `${day} / ${area.name} / ${reach} / ${b}:${sub ?? ''}`;
            const { cards } = pickCards(realSpots, area, b, {}, sub, reach, false, day);
            expect(cards, why).toHaveLength(3);
            expect(new Set(cards.map((c) => c.spot.id)).size, why).toBe(3);
            if (day === '2026-11-01') expect(cards.some((c) => c.spot.id === daejeong.id), why).toBe(false);
          }
        }
      }
    }
    // on its market day, 대정 is first among the same score near 대정
    const near = { lat: daejeong.lat, lng: daejeong.lng };
    const first = pickCards(realSpots, near, 'new', {}, 'sight', 'walk', false, '2026-10-31').cards;
    const same = first.filter((c) => c.spot.score === daejeong.score);
    expect(same[0]?.spot.id).toBe(daejeong.id);
  });
});

describe('만족도 점수와 범위 (ADR-0060, specs/ranking.md R2·R3)', () => {
  /** the results screen's 8 lists: 4 moods (food as 식사 / 카페·디저트, new as 섞어서 / 구경 / 체험) and 아무거나 */
  const SIX: [Button, Tab?][] = [['rest'], ['walk'], ['new', 'mix'], ['new', 'sight'], ['new', 'do'], ['food', 'meal'], ['food', 'cafe'], ['any']];
  const poolOf = (b: Button, sub?: Tab) =>
    realSpots.filter((s) => listed(s) && (b === 'any' ? ['rest', 'walk', 'new'].includes(s.mood) : s.mood === b && (!sub || sub === 'mix' || s.sub === sub)));
  const label = (a: string, b: Button, sub: Tab | undefined, reach: Reach) => `${a} / ${b}${sub ? `:${sub}` : ''} / ${reach}`;

  it('ranges: 걸어서 = 걷기 15분 이내, 차로 30분, 차로 1시간; default 차로 30분', () => {
    expect(REACHES).toEqual(['walk', 'drive30', 'drive60']);
    expect(DEFAULT_REACH).toBe('drive30');
    const o = { lat: 33.5, lng: 126.5 };
    const east = (km: number) => ({ lat: 33.5, lng: 126.5 + km / (111.32 * Math.cos((33.5 * Math.PI) / 180)) });
    expect(withinReach('walk', o, east(0.9))).toBe(true); // walkMinutes 15
    expect(withinReach('walk', o, east(1.2))).toBe(false); // walkMinutes 20
    expect(withinReach('drive30', o, east(15))).toBe(true); // driveMinutes 30
    expect(withinReach('drive30', o, east(17))).toBe(false); // 35
    expect(withinReach('drive60', o, east(31))).toBe(true); // 60
    expect(withinReach('drive60', o, east(34))).toBe(false); // 65
  });

  it('R2·N2 15 areas × 8 lists × 3 ranges → 3 distinct cards; none beyond the range when 3 or more are in it', () => {
    let checked = 0;
    for (const area of AREAS) {
      for (const [b, sub] of SIX) {
        for (const reach of REACHES) {
          const why = label(area.name, b, sub, reach);
          const { cards } = pickCards(realSpots, area, b, {}, sub, reach);
          expect(cards, why).toHaveLength(3);
          expect(new Set(cards.map((c) => c.spot.id)).size, why).toBe(3);
          for (const c of cards) {
            // 아무거나 draws one card from each mood: that mood's own pool decides whether it had to widen
            const pool = b === 'any' ? poolOf(c.spot.mood) : poolOf(b, sub);
            if (pool.filter((s) => withinReach(reach, area, s)).length >= 3) expect(withinReach(reach, area, c.spot), `${why} / ${c.spot.name}`).toBe(true);
          }
          checked++;
        }
      }
    }
    expect(checked).toBe(15 * 8 * 3);
  });

  /** R3 (ADR-0108): each card's 거리 칸 is ≤ the cards after it; in the same 칸 its score is ≥ theirs. */
  const expectNearFirst = (o: Point, cards: { spot: Spot }[], why: string) => {
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const bi = nearBand(distanceKm(o, cards[i].spot));
        const bj = nearBand(distanceKm(o, cards[j].spot));
        expect(bi, why).toBeLessThanOrEqual(bj);
        if (bi === bj) expect(cards[i].spot.score, why).toBeGreaterThanOrEqual(cards[j].spot.score);
      }
    }
  };

  it('R3 within one range the first card is in the nearest 거리 칸, and scores at least as high as the cards after it in that 칸 (every area, button, range)', () => {
    for (const area of AREAS) {
      for (const [b, sub] of SIX) {
        for (const reach of REACHES) {
          const { cards } = pickCards(realSpots, area, b, {}, sub, reach);
          expectNearFirst(area, cards, label(area.name, b, sub, reach));
        }
      }
    }
  });

  it('R3 holds tap after tap, while the rotation shows only unseen places', () => {
    for (const [name, origin] of Object.entries(ORIGINS)) {
      for (const [b, sub] of SIX) {
        let h: Histories = {};
        const seen = new Set<string>();
        for (let tap = 0; tap < 4; tap++) {
          const r = pickCards(realSpots, origin, b, h, sub);
          expectNearFirst(origin, r.cards, `${name} / ${b} / tap ${tap}`);
          if (!r.wrapped) for (const c of r.cards) expect(seen.has(c.spot.id), `${name} / ${b} / tap ${tap}`).toBe(false);
          for (const c of r.cards) seen.add(c.spot.id);
          h = r.histories;
        }
      }
    }
  });

  it('a nearer place comes before a better-scored one further away (score only within a 거리 칸), and never one beyond the range', () => {
    const mk = (id: string, km: number, score: number): Spot => ({
      id, name: id, lat: 33.5, lng: 126.5 + km / (111.32 * Math.cos((33.5 * Math.PI) / 180)), mood: 'rest',
      reason: '테스트용 이유 문장입니다 열여덟 글자 이상', image: 'https://example.com/x.jpg', kakaoPlaceId: null, bookable: false, score,
    });
    // near3·near3b·near5 are all 차로 5분; mid5 is 20분, mid4 25분, far5 50분
    const spots = [mk('near3', 1.5, 3), mk('near3b', 2, 3), mk('near5', 3, 5), mk('mid5', 10, 5), mk('mid4', 12, 4), mk('far5', 25, 5)];
    const o = { lat: 33.5, lng: 126.5 };
    // 차로 30분: far5 (차로 약 50분) is out; the nearest 칸 first, the 5 first within it, ties by trip then id
    expect(pickCards(spots, o, 'rest', {}, undefined, 'drive30').cards.map((c) => c.spot.id)).toEqual(['near5', 'near3', 'near3b']);
    // 차로 1시간: far5 is in the range, but a further 칸 never outranks a nearer one
    expect(pickCards(spots, o, 'rest', {}, undefined, 'drive60').cards.map((c) => c.spot.id)).toEqual(['near5', 'near3', 'near3b']);
    // 걸어서: none is within 15 minutes on foot → widened to the nearest 3, still nearest 칸 first
    expect(pickCards(spots, o, 'rest', {}, undefined, 'walk').cards.map((c) => c.spot.id)).toEqual(['near5', 'near3', 'near3b']);
  });
});

describe('철 (ADR-0080, specs/seasonal-spots.md S3)', () => {
  const o = { lat: 33.5, lng: 126.5 };
  const mk = (id: string, km: number, score: number, extra: Partial<Spot> = {}): Spot => ({
    id, name: id, lat: 33.5, lng: 126.5 + km / 92.8, mood: 'new', sub: 'sight', indoor: false,
    reason: '테스트용 이유 문장입니다 열여덟 글자 이상', image: 'https://example.com/x.jpg', kakaoPlaceId: null, bookable: false, score, ...extra,
  });
  const MARCH: Spot['season'] = [{ kind: 'rapeseed', months: [3] }];
  const JEJU = { days: [2, 7, 12, 17, 22, 27], label: '2·7일' };
  const ids = (spots: Spot[], day?: string) => pickCards(spots, o, 'new', {}, 'sight', 'drive30', false, day).cards.map((c) => c.spot.id);

  it('same score: the market on its day, then the place in season, then the rest; never ahead of a higher score', () => {
    // all in one 거리 칸 (차로 5분), so the 칸 does not decide (ADR-0108)
    const spots = [mk('a', 1.5, 4), mk('s', 2, 4, { season: MARCH }), mk('m', 3, 4, { market: JEJU }), mk('top', 3.5, 5)];
    expect(ids(spots, '2026-03-02')).toEqual(['top', 'm', 's']);
    expect(ids(spots, '2026-03-03')).toEqual(['top', 's', 'a']);
    // out of season and with no day: the usual order (score → trip → id)
    expect(ids(spots, '2026-04-03')).toEqual(['top', 'a', 's']);
    expect(ids(spots)).toEqual(['top', 'a', 's']);
    // a lower score never jumps ahead
    expect(ids([mk('a', 1.5, 4), mk('b', 2, 4), mk('c', 3, 4), mk('s', 1.5, 3, { season: MARCH })], '2026-03-10')).toEqual(['a', 'b', 'c']);
  });

  it('real data: out of season the order is what it was with no 철; in season 15 areas × 3 ranges × every list still give 3 distinct cards', () => {
    const plain = realSpots.map(({ season: _s, ...s }) => s as Spot);
    for (const area of AREAS) {
      for (const reach of REACHES) {
        for (const [b, sub] of [['rest'], ['walk'], ['new', 'mix'], ['new', 'sight'], ['new', 'do'], ['any']] as [Button, Tab?][]) {
          const why = `${area.name} / ${reach} / ${b}:${sub ?? ''}`;
          const at = (spots: Spot[], day: string) => pickCards(spots, area, b, {}, sub, reach, false, day).cards.map((c) => c.spot.id);
          expect(at(realSpots, '2026-10-04'), why).toEqual(at(plain, '2026-10-04'));
          const nov = at(realSpots, '2026-11-10');
          expect(nov, why).toHaveLength(3);
          expect(new Set(nov).size, why).toBe(3);
        }
      }
    }
  });
});

// 자동 지역 (plans/nationwide-app.md 3, U7): a place may have several moods; 아무거나 takes its cards from 걷기·새로운 것.
describe('자동 지역 moods · anyMoods', () => {
  const origin = { lat: 37.75, lng: 128.88 };
  const mk = (id: string, moods: Spot['mood'][], km: number, extra: Partial<Spot> = {}): Spot => ({
    id, name: id, lat: origin.lat + km / 111.19, lng: origin.lng, mood: moods[0], moods, reason: '', image: '', kakaoPlaceId: null, bookable: false, score: 3,
    ...(moods[0] === 'food' ? { sub: 'meal' as const } : moods[0] === 'new' ? { sub: 'sight' as const } : {}), ...extra,
  });
  const spots = [mk('w1', ['walk'], 5), mk('w2', ['walk'], 8), mk('wn', ['walk', 'new'], 2), mk('n1', ['new'], 10), mk('n2', ['new'], 13), mk('f1', ['food'], 1), mk('f2', ['food'], 1.5)];
  const ANY = ['walk', 'new'] as const;

  it('a place counts for each of its moods (moods), not only the first', () => {
    expect(pickCards(spots, origin, 'new').cards.map((c) => c.spot.id)).toEqual(['wn', 'n1', 'n2']);
    expect(pickCards(spots, origin, 'walk').cards.map((c) => c.spot.id)).toEqual(['wn', 'w1', 'w2']);
  });

  it('anyMoods [walk, new]: 3 cards — 걷기 1, 새로운 것 1, the next best of both — no 먹기, no place twice', () => {
    const { cards } = pickCards(spots, origin, 'any', {}, undefined, 'drive30', false, undefined, false, ANY);
    const ids = cards.map((c) => c.spot.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(cards.some((c) => c.spot.mood === 'food')).toBe(false);
    // the same score everywhere: the nearest first (wn for 걷기, then n1 for 새로운 것, then w1)
    expect(ids).toEqual(['wn', 'w1', 'n1']);
  });

  it('anyMoods: the rotation moves on — the 2 unseen places come, the third is one seen before (5 places in all)', () => {
    const a = pickCards(spots, origin, 'any', {}, undefined, 'drive30', false, undefined, false, ANY);
    const b = pickCards(spots, origin, 'any', a.histories, undefined, 'drive30', false, undefined, false, ANY);
    const ids = b.cards.map((c) => c.spot.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual(expect.arrayContaining(['w2', 'n2']));
    expect(b.wrapped).toBe(true);
  });

  it('the 3 moods as before: the default is rest, walk, new — one card each', () => {
    const three = [...spots, mk('r1', ['rest'], 5)];
    const before = pickCards(three, origin, 'any');
    expect(pickCards(three, origin, 'any', {}, undefined, 'drive30', false, undefined, false, ['rest', 'walk', 'new'])).toEqual(before);
    expect(before.cards.map((c) => c.spot.id).sort()).toEqual(['n1', 'r1', 'wn']);
    // 쉬기 has none: two cards, not a third from the others (아무거나 of 3 moods is as it was)
    expect(pickCards(spots, origin, 'any').cards).toHaveLength(2);
  });
});
