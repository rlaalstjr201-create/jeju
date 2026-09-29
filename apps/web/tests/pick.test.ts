// S2 선택 로직 (plans/tomorrow-picker.md) — coverage tests use the real public/spots.json.
import { describe, expect, it } from 'vitest';
import { distanceKm, driveMinutes, pickCards, type Histories, type Spot } from '../src/pick';
import { BUTTONS, ORIGINS, SUBS, realSpots } from './fixtures';

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

  it.each(combos)('$name / $button → every card ≤ 60분', ({ origin, button }) => {
    const { cards } = pickCards(realSpots, origin, button);
    for (const c of cards) {
      expect(c.minutes).toBe(driveMinutes(distanceKm(origin, c.spot)));
      expect(c.minutes).toBeLessThanOrEqual(60);
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

  it.each(combos)('$name / $button → mood buttons show the nearest spots, nearest first', ({ origin, button }) => {
    const { cards } = pickCards(realSpots, origin, button);
    const km = cards.map((c) => distanceKm(origin, c.spot));
    expect([...km].sort((a, b) => a - b)).toEqual(km);
    if (button === 'any') return;
    // 'food' with no sub given defaults to 'meal' (S2/S3 toggle default).
    const nearest = realSpots
      .filter((s) => s.mood === button && (button !== 'food' || s.sub === 'meal'))
      .map((s) => distanceKm(origin, s))
      .sort((a, b) => a - b)
      .slice(0, 3);
    expect(km).toEqual(nearest);
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
      reason: '테스트용 이유 문장입니다 열여덟 글자 이상', image: 'https://example.com/x.jpg', kakaoPlaceId: String(2000 + i), bookable: false,
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
  const at = (i: number, mood: Spot['mood'] = 'walk'): Spot => ({
    id: `s${i}`, name: `스팟${i}`, lat: 33.5, lng: 126.5 + i * 0.001, mood,
    reason: '테스트용 이유 문장입니다 열여덟 글자 이상', image: 'https://example.com/x.jpg', kakaoPlaceId: String(1000 + i), bookable: false,
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

  it('first tap shows nearest first; second tap moves to the next nearest', () => {
    const spots = [5, 1, 4, 0, 3, 2].map((i) => at(i));
    const a = pickCards(spots, origin, 'walk');
    expect(a.cards.map((c) => c.spot.id)).toEqual(['s0', 's1', 's2']);
    const b = pickCards(spots, origin, 'walk', a.histories);
    expect(b.cards.map((c) => c.spot.id)).toEqual(['s3', 's4', 's5']);
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
    const { cards } = pickCards(far, { lat: 33.5, lng: 126.2 }, 'walk');
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
