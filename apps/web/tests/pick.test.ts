// S2 선택 로직 (plans/tomorrow-picker.md) — coverage tests use the real public/spots.json.
import { describe, expect, it } from 'vitest';
import { AREAS } from '../src/areas';
import { DEFAULT_REACH, REACHES, distanceKm, driveMinutes, formatMinutes, islandOf, pickCards, reachMinutes, travel, travelText, walkMinutes, withinReach, type Button, type Histories, type Point, type Reach, type Spot, type Sub } from '../src/pick';
import { BUTTONS, ORIGINS, SUBS, realSpots } from './fixtures';

/** specs/ranking.md 정렬 키: 점수 내림차순 → 이동 시간 오름차순 → id. */
const byRank = (origin: Point, reach: Reach) => (a: { spot: Spot }, b: { spot: Spot }) =>
  b.spot.score - a.spot.score ||
  reachMinutes(reach, distanceKm(origin, a.spot)) - reachMinutes(reach, distanceKm(origin, b.spot)) ||
  a.spot.id.localeCompare(b.spot.id);

const combos = Object.entries(ORIGINS).flatMap(([name, origin]) => BUTTONS.map((button) => ({ name, origin, button })));

describe('S2 real data: 4 origins × 5 buttons', () => {
  it('uses the real file (sanity)', () => {
    expect(realSpots.length).toBeGreaterThan(0);
    expect(combos).toHaveLength(20);
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

  // Changed on purpose (ADR-0060): no longer nearest first — score first, then the trip, then id.
  it.each(combos)('$name / $button → the best-scored spots in range, best first', ({ origin, button }) => {
    const { cards } = pickCards(realSpots, origin, button);
    expect(cards.map((c) => c.spot.id)).toEqual([...cards].sort(byRank(origin, DEFAULT_REACH)).map((c) => c.spot.id));
    if (button === 'any') return;
    // 'food' with no sub given defaults to 'meal' (S2/S3 toggle default).
    const best = realSpots
      .filter((s) => s.mood === button && (button !== 'food' || s.sub === 'meal') && withinReach(DEFAULT_REACH, origin, s))
      .map((spot) => ({ spot }))
      .sort(byRank(origin, DEFAULT_REACH))
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

  // Changed on purpose (ADR-0060): the first tap is the best-scored 3, not the nearest 3; the rotation then
  // moves down the same ranking.
  it('first tap shows the best-scored first; second tap moves to the next in rank', () => {
    // s0..s5 lie ~90m apart (all "차로 약 5분"); s5 and s3 score highest.
    const spots = [at(5, 'walk', 5), at(1, 'walk', 3), at(4, 'walk', 2), at(0, 'walk', 3), at(3, 'walk', 4), at(2, 'walk', 3)];
    const a = pickCards(spots, origin, 'walk');
    expect(a.cards.map((c) => c.spot.id)).toEqual(['s5', 's3', 's0']);
    const b = pickCards(spots, origin, 'walk', a.histories);
    expect(b.cards.map((c) => c.spot.id)).toEqual(['s1', 's2', 's4']);
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

  it('islandOf catches exactly 우도 65 · 비양도 5 · 가파도 4 · 마라도 10 in spots.json', () => {
    const counts: Record<string, number> = {};
    for (const s of realSpots) {
      const i = islandOf(s);
      if (i) counts[i] = (counts[i] ?? 0) + 1;
    }
    expect(counts).toEqual({ 우도: 65, 비양도: 5, 가파도: 4, 마라도: 10 });
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

describe('만족도 점수와 범위 (ADR-0060, specs/ranking.md R2·R3)', () => {
  /** the 6 buttons of the results screen: 4 moods (food as 식사 / 카페·디저트) and 아무거나 */
  const SIX: [Button, Sub?][] = [['rest'], ['walk'], ['new'], ['food', 'meal'], ['food', 'cafe'], ['any']];
  const poolOf = (b: Button, sub?: Sub) =>
    realSpots.filter((s) => (b === 'any' ? ['rest', 'walk', 'new'].includes(s.mood) : s.mood === b && (b !== 'food' || s.sub === sub)));
  const label = (a: string, b: Button, sub: Sub | undefined, reach: Reach) => `${a} / ${b}${sub ? `:${sub}` : ''} / ${reach}`;

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

  it('R2 15 areas × 6 buttons × 3 ranges → 3 distinct cards; none beyond the range when 3 or more are in it', () => {
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
    expect(checked).toBe(15 * 6 * 3);
  });

  it('R3 within one range the first card scores at least as high as the cards after it (every area, button, range)', () => {
    for (const area of AREAS) {
      for (const [b, sub] of SIX) {
        for (const reach of REACHES) {
          const { cards } = pickCards(realSpots, area, b, {}, sub, reach);
          const scores = cards.map((c) => c.spot.score);
          expect(scores[0], label(area.name, b, sub, reach)).toBe(Math.max(...scores));
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
          const scores = r.cards.map((c) => c.spot.score);
          expect(scores[0], `${name} / ${b} / tap ${tap}`).toBe(Math.max(...scores));
          if (!r.wrapped) for (const c of r.cards) expect(seen.has(c.spot.id), `${name} / ${b} / tap ${tap}`).toBe(false);
          for (const c of r.cards) seen.add(c.spot.id);
          h = r.histories;
        }
      }
    }
  });

  it('a better-scored place further away comes before a nearer one, but never one beyond the range', () => {
    const mk = (id: string, km: number, score: number): Spot => ({
      id, name: id, lat: 33.5, lng: 126.5 + km / (111.32 * Math.cos((33.5 * Math.PI) / 180)), mood: 'rest',
      reason: '테스트용 이유 문장입니다 열여덟 글자 이상', image: 'https://example.com/x.jpg', kakaoPlaceId: null, bookable: false, score,
    });
    const spots = [mk('near3', 1, 3), mk('near3b', 2, 3), mk('mid5', 10, 5), mk('mid4', 12, 4), mk('far5', 25, 5)];
    const o = { lat: 33.5, lng: 126.5 };
    // 차로 30분: far5 (차로 약 50분) is out; the 5 comes first, the 3s last, ties by trip then id
    expect(pickCards(spots, o, 'rest', {}, undefined, 'drive30').cards.map((c) => c.spot.id)).toEqual(['mid5', 'mid4', 'near3']);
    // 차로 1시간: far5 is in, and outranks the nearer 4
    expect(pickCards(spots, o, 'rest', {}, undefined, 'drive60').cards.map((c) => c.spot.id)).toEqual(['mid5', 'far5', 'mid4']);
    // 걸어서: only near3 is within 15 minutes on foot → widened to the nearest 3, still best first
    expect(pickCards(spots, o, 'rest', {}, undefined, 'walk').cards.map((c) => c.spot.id)).toEqual(['mid5', 'near3', 'near3b']);
  });
});
