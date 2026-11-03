// 밤에는 야외 산길을 뒤로 (ADR-0091, specs/night-trails.md §2·S2·S3), 배로 가는 섬도 (Amendment 1): pickCards / pool /
// islandTop with `night`. By day neither is read; at night a trail, or a small island the origin is not on, goes after
// every other candidate — never left out — and the rotation, the widening (빈손 없음), the tabs and 아무거나 stay as they
// are. `nightShifted` says which kind that moved ('trail' | 'island' | 'both'), null when it moved none.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AREAS, areaByName } from '../src/areas';
import { BUSAN_AREAS } from '../src/busan';
import { normalizeSpots } from '../src/data';
import { islandOf, islandTop, pickCards, pool, REACHES, type Button, type Card, type Histories, type Point, type Spot, type Tab } from '../src/pick';
import { nightNow } from '../src/sun';
import { fileSpots } from './fixtures';

const DAY = '2026-10-16';
const o = { lat: 33.5, lng: 126.5 };
const mk = (id: string, km: number, score: number, extra: Partial<Spot> = {}): Spot => ({
  id, name: id, lat: 33.5, lng: 126.5 + km / 92.8, mood: 'walk',
  reason: '테스트용 이유 문장입니다 열여덟 글자 이상', image: 'https://example.com/x.jpg', kakaoPlaceId: null, bookable: false, score, ...extra,
});
const T = { trail: true } as const;
const ids = (cards: Card[]) => cards.map((c) => c.spot.id);
/** the data as it was before ADR-0091: no `trail` anywhere */
const plain = fileSpots.map(({ trail: _t, ...s }) => s as Spot);
const LISTS: [Button, Tab?][] = [['rest'], ['walk'], ['new', 'mix'], ['new', 'sight'], ['new', 'do'], ['food', 'meal'], ['food', 'cafe'], ['any']];
/** what a result is, without the spot objects (stripping `trail` makes new ones) */
const shape = (r: ReturnType<typeof pickCards>) => JSON.stringify({ cards: r.cards.map((c) => [c.spot.id, c.minutes]), h: r.histories, w: r.wrapped, n: r.nightShifted });
const at = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
const night = (list: Spot[], origin: Point = o, b: Button = 'walk', h: Histories = {}) => pickCards(list, origin, b, h, undefined, 'drive30', false, undefined, true);
/** hard to go to at night from `origin`: a 야외 산길, or a small island the origin is not on (`ferryTo`) */
const hardFrom = (origin: Point) => (s: Spot) => s.trail === true || (islandOf(s) !== null && islandOf(s) !== islandOf(origin));

describe('by day: neither trail nor island is read (S2 낮 12시)', () => {
  it('15 areas × 3 ranges × every list, three taps each: the same as the data without trail', () => {
    for (const area of AREAS)
      for (const reach of REACHES)
        for (const [b, tab] of LISTS) {
          let h: Histories = {};
          let hp: Histories = {};
          for (let tap = 0; tap < 3; tap++) {
            const r = pickCards(fileSpots, area, b, h, tab, reach, false, DAY);
            const rp = pickCards(plain, area, b, hp, tab, reach, false, DAY);
            expect(shape(r), `${area.name} ${reach} ${b}:${tab ?? ''} tap ${tap}`).toBe(shape(rp));
            expect(r.nightShifted).toBeNull();
            h = r.histories;
            hp = rp.histories;
          }
        }
  });
  it('the home\'s order too: pool and islandTop', () => {
    for (const area of AREAS) {
      const day = pool(fileSpots, area, 'walk', undefined, 'drive30', false, DAY).map((c) => c.spot.id);
      expect(day).toEqual(pool(plain, area, 'walk', undefined, 'drive30', false, DAY).map((c) => c.spot.id));
    }
    expect(islandTop(fileSpots, 'walk', undefined, false, DAY).map((s) => s.id)).toEqual(islandTop(plain, 'walk', undefined, false, DAY).map((s) => s.id));
  });
});

describe('at night: 야외 산길 after every other candidate (fixtures)', () => {
  const spots = [mk('t5', 1, 5, T), mk('a4', 2, 4), mk('t4', 2, 4, T), mk('b3', 3, 3), mk('c3', 4, 3)];

  it('the others first, best first; by day the usual order', () => {
    expect(ids(pickCards(spots, o, 'walk').cards)).toEqual(['t5', 'a4', 't4']);
    const r = night(spots);
    expect(ids(r.cards)).toEqual(['a4', 'b3', 'c3']);
    expect(r.nightShifted).toBe('trail');
    expect(pool(spots, o, 'walk', undefined, 'drive30', false, undefined, true).map((c) => c.spot.id)).toEqual(['a4', 'b3', 'c3', 't5', 't4']);
  });

  it('never left out: the next tap brings the trails (unseen first, as the rotation always does), shown after the other place', () => {
    const first = night(spots);
    const second = night(spots, o, 'walk', first.histories);
    expect(ids(second.cards)).toEqual(['a4', 't5', 't4']);
    // the trails came because the others were seen, not because night moved them
    expect(second.nightShifted).toBeNull();
    expect(second.wrapped).toBe(true);
  });

  it('too few others: the trails fill the 3, after them', () => {
    const r = night([mk('t5', 1.5, 5, T), mk('a2', 2, 2), mk('t3', 2.5, 3, T), mk('t4', 3, 4, T)]);
    expect(ids(r.cards)).toEqual(['a2', 't5', 't4']);
    expect(r.nightShifted).toBe('trail');
  });

  it('widening (빈손 없음) is the same: the nearest 3 on the island, a trail among them last', () => {
    // 걸어서 15분: only n1 is that close → the nearest 3 on the whole island, whatever night does
    const far = [mk('n1', 0.5, 3), mk('t2', 5, 5, T), mk('f3', 8, 4), mk('f4', 30, 5)];
    expect(ids(pickCards(far, o, 'walk', {}, undefined, 'walk').cards)).toEqual(['n1', 't2', 'f3']);
    expect(ids(pickCards(far, o, 'walk', {}, undefined, 'walk', false, undefined, true).cards)).toEqual(['n1', 'f3', 't2']);
  });

  it('nightShifted only when a trail actually moved', () => {
    // the trails already rank below every other place: night changes nothing
    // (in one 거리 칸, 차로 5분, so the order is by score)
    const below = [mk('a5', 1.5, 5), mk('b4', 2, 4), mk('c4', 2.5, 4), mk('t3', 3, 3, T), mk('t2', 3.5, 2, T)];
    expect(night(below).nightShifted).toBeNull();
    expect(ids(night(below).cards)).toEqual(ids(pickCards(below, o, 'walk').cards));
    // no trail, or nothing but trails: nothing to move
    expect(night([mk('a', 1, 3), mk('b', 2, 4), mk('c', 3, 5)]).nightShifted).toBeNull();
    expect(night([mk('t1', 1.5, 3, T), mk('t2', 2, 4, T), mk('t3', 2.5, 5, T)]).nightShifted).toBeNull();
    expect(ids(night([mk('t1', 1.5, 3, T), mk('t2', 2, 4, T), mk('t3', 2.5, 5, T)]).cards)).toEqual(['t3', 't2', 't1']);
    // a trail moved behind a place it outranks, though not one of the 3 shown: the order the picks come from changed
    const deep = [mk('a5', 1, 5), mk('b5', 2, 5), mk('c5', 3, 5), mk('t4', 1, 4, T), mk('d3', 2, 3)];
    expect(ids(night(deep).cards)).toEqual(['a5', 'b5', 'c5']);
    expect(night(deep).nightShifted).toBe('trail');
    // a trail in the tier shown last time does not move behind an unseen place: the rotation put it there already
    const h: Histories = { walk: { seen: ['t4'], last: ['t4'] } };
    expect(night([mk('t4', 1, 4, T), mk('a3', 1, 3), mk('b3', 2, 3), mk('c3', 3, 3)], o, 'walk', h).nightShifted).toBeNull();
    // by day never
    expect(pickCards(deep, o, 'walk').nightShifted).toBeNull();
  });

  it('아무거나: one per mood as always; the walk card from the walk list in night order', () => {
    const list = [mk('t5', 1, 5, T), mk('w3', 2, 3), mk('r3', 1, 3, { mood: 'rest' }), mk('n3', 1, 3, { mood: 'new', sub: 'sight' })];
    const day = pickCards(list, o, 'any');
    expect(ids(day.cards)).toEqual(['t5', 'n3', 'r3']);
    const r = night(list, o, 'any');
    expect(ids(r.cards).sort()).toEqual(['n3', 'r3', 'w3']);
    expect(r.nightShifted).toBe('trail');
  });

  it('a tab (새로운 거 · 체험) keeps its own list: a trail there goes after the other 체험', () => {
    const book = { k: 'naver', u: 'https://example.com/b' } as const;
    const list = [mk('d5', 1, 5, { mood: 'new', sub: 'do', book, ...T }), mk('d3', 2, 3, { mood: 'new', sub: 'do', book }), mk('d2', 3, 2, { mood: 'new', sub: 'do', book }), mk('s5', 1, 5, { mood: 'new', sub: 'sight' })];
    expect(ids(pickCards(list, o, 'new', {}, 'do').cards)).toEqual(['d5', 'd3', 'd2']);
    expect(ids(pickCards(list, o, 'new', {}, 'do', 'drive30', false, undefined, true).cards)).toEqual(['d3', 'd2', 'd5']);
  });

  it('islandTop (「예:」 before a basis): trails after the others at night', () => {
    const list = [mk('t5', 1, 5, T), mk('a4', 2, 4), mk('b3', 3, 3)];
    expect(islandTop(list, 'walk').map((s) => s.id)).toEqual(['t5', 'a4', 'b3']);
    expect(islandTop(list, 'walk', undefined, false, undefined, true).map((s) => s.id)).toEqual(['a4', 'b3', 't5']);
  });
});

describe('Amendment 1: at night a small island the origin is not on goes after the others too (fixtures)', () => {
  /** a place at a point (the island boxes are pick.ts ISLANDS) */
  const put = (id: string, p: Point, score: number, extra: Partial<Spot> = {}): Spot => ({ ...mk(id, 0, score, extra), lat: p.lat, lng: p.lng });
  const SEONGSAN = { lat: 33.46, lng: 126.93 }; // the main island, by 성산포항
  const UDO = { lat: 33.5, lng: 126.955 };
  const main = (id: string, km: number, score: number, extra: Partial<Spot> = {}) => put(id, { lat: SEONGSAN.lat, lng: SEONGSAN.lng - km / 92.8 }, score, extra);

  it('the main island first, the island by boat after them (never left out); the line says 섬', () => {
    expect([islandOf(SEONGSAN), islandOf(UDO)]).toEqual([null, '우도']);
    // 우도 is in the same 거리 칸 as m4 (차로 10분), so by day its score puts it first
    const list = [put('u5', UDO, 5), main('m4', 6, 4), main('m3', 7, 3), main('m2', 8, 2)];
    expect(ids(pickCards(list, SEONGSAN, 'walk').cards)).toEqual(['u5', 'm4', 'm3']);
    const r = night(list, SEONGSAN);
    expect(ids(r.cards)).toEqual(['m4', 'm3', 'm2']);
    expect(r.nightShifted).toBe('island');
    // the next tap: the island (unseen) comes, shown after the main island places brought back with it
    expect(ids(night(list, SEONGSAN, 'walk', r.histories).cards)).toEqual(['m4', 'm3', 'u5']);
  });

  it('a person on the island: its own places stay where they rank; another island is a boat away, the main island is not moved', () => {
    const GAPA = { lat: 33.17, lng: 126.27 };
    const MARA = { lat: 33.118, lng: 126.268 };
    const PORT = { lat: 33.215, lng: 126.255 }; // 운진항 side of the main island
    expect([islandOf(GAPA), islandOf(MARA), islandOf(PORT)]).toEqual(['가파도', '마라도', null]);
    const list = [put('m5', MARA, 5), put('g4', { lat: 33.172, lng: 126.272 }, 4), put('j3', PORT, 3)];
    // g4 is on the person's own island and nearest; m5 and j3 share a 거리 칸, so by day the score orders them
    expect(ids(pickCards(list, GAPA, 'walk').cards)).toEqual(['g4', 'm5', 'j3']);
    const r = night(list, GAPA);
    expect(ids(r.cards)).toEqual(['g4', 'j3', 'm5']);
    expect(r.nightShifted).toBe('island');
    // on 우도 itself, 우도's places are as by day
    const udo = [put('u5', UDO, 5), put('u4', { lat: 33.505, lng: 126.95 }, 4), main('m3', 1, 3)];
    const onUdo = night(udo, { lat: 33.51, lng: 126.96 });
    expect(ids(onUdo.cards)).toEqual(['u5', 'u4', 'm3']);
    expect(onUdo.nightShifted).toBeNull();
  });

  it('the line names what moved: 산길, 섬, or both — a 산길 on an island counts as both', () => {
    const t = main('t5', 1, 5, T);
    const u = put('u5', UDO, 5);
    // ADR-0108: the others in 우도's 거리 칸 (차로 10분), so by day 우도 ranks among them
    const others = [main('a3', 4.6, 3), main('b3', 5, 3), main('c3', 5.4, 3)];
    expect(night([t, ...others], SEONGSAN).nightShifted).toBe('trail');
    expect(night([u, ...others], SEONGSAN).nightShifted).toBe('island');
    expect(night([t, u, ...others], SEONGSAN).nightShifted).toBe('both');
    expect(night([put('ut', UDO, 5, T), ...others], SEONGSAN).nightShifted).toBe('both');
    // an island that already ranks below every other place moved nothing; the trail that did is the one named
    expect(night([t, put('u1', UDO, 1), ...others], SEONGSAN).nightShifted).toBe('trail');
    // 아무거나 adds up its three lists
    const any = [t, main('w1', 5, 1), put('ur', UDO, 5, { mood: 'rest' }), main('r1', 5, 1, { mood: 'rest' }), main('n1', 5, 1, { mood: 'new', sub: 'sight' })];
    expect(night(any, SEONGSAN, 'any').nightShifted).toBe('both');
  });

  it('islandTop (no basis yet: the main island, as 길찾기 takes it): islands after the others at night', () => {
    const list = [put('u5', UDO, 5), main('a4', 1, 4), main('b3', 2, 3)];
    expect(islandTop(list, 'walk').map((s) => s.id)).toEqual(['u5', 'a4', 'b3']);
    expect(islandTop(list, 'walk', undefined, false, undefined, true).map((s) => s.id)).toEqual(['a4', 'b3', 'u5']);
  });
});

describe('S2 real data: 「좀 걷고 싶어」 around 애월 · 서귀포 시내 · 성산 at 22:00, 00:25, 05:00 vs 12:00', () => {
  const AREAS3 = ['애월', '서귀포시내', '성산'] as const;
  const trail = (c: Card) => c.spot.trail === true;

  it('at night nothing hard to go to (산길, 섬 by boat) comes before another place; one is shown only when fewer than 3 others are in the list', () => {
    for (const name of AREAS3) {
      const a = areaByName(name)!;
      const hard = hardFrom(a);
      for (const hm of ['22:00', '00:25', '05:00']) {
        const isNight = nightNow(at(hm), a, DAY);
        expect(isNight, `${name} ${hm}`).toBe(true);
        for (const reach of REACHES) {
          const why = `${name} ${hm} ${reach}`;
          const r = pickCards(fileSpots, a, 'walk', {}, undefined, reach, false, DAY, isNight);
          const flags = r.cards.map((c) => hard(c.spot));
          expect(flags.indexOf(true) === -1 || !flags.slice(flags.indexOf(true)).includes(false), why).toBe(true);
          const others = pool(fileSpots, a, 'walk', undefined, reach, false, DAY).filter((c) => !hard(c.spot)).length;
          expect(flags.filter(Boolean).length, why).toBe(Math.max(0, 3 - others));
        }
      }
    }
  });

  it('at 12:00 it is the day\'s order, trails where they rank (애월 · 성산 show some at 차로 30분)', () => {
    for (const name of AREAS3) {
      const a = areaByName(name)!;
      expect(nightNow(at('12:00'), a, DAY)).toBe(false);
    }
    const noon = (name: (typeof AREAS3)[number]) => pickCards(fileSpots, areaByName(name)!, 'walk', {}, undefined, 'drive30', false, DAY, false).cards;
    expect(noon('애월').filter(trail).length).toBeGreaterThan(0);
    expect(noon('성산').filter(trail).length).toBeGreaterThan(0);
  });

  it('차로 30분, first tap: 애월 and 성산 change at night (산길과 섬), 서귀포 시내 shows the same 3 (its trails moved further down)', () => {
    const both = (name: (typeof AREAS3)[number]) => {
      const a = areaByName(name)!;
      const day = pickCards(fileSpots, a, 'walk', {}, undefined, 'drive30', false, DAY, false);
      const atNight = pickCards(fileSpots, a, 'walk', {}, undefined, 'drive30', false, DAY, true);
      return { day: ids(day.cards), night: ids(atNight.cards), shifted: atNight.nightShifted };
    };
    const aewol = both('애월');
    expect(aewol.night).not.toEqual(aewol.day);
    expect(aewol.shifted).toBe('both');
    const seongsan = both('성산');
    expect(seongsan.night).not.toEqual(seongsan.day);
    expect(seongsan.shifted).toBe('both');
    const seogwipo = both('서귀포시내');
    expect(seogwipo.night).toEqual(seogwipo.day);
    expect(seogwipo.shifted).toBe('trail');
  });

  it('23:00: 애월 no longer puts 비양도, nor 성산 우도, ahead of main-island places', () => {
    const name = (id: string) => fileSpots.find((s) => s.id === id)!.name;
    for (const [area, island] of [['애월', '비양도'], ['성산', '우도']] as const) {
      const a = areaByName(area)!;
      const list = pool(fileSpots, a, 'walk', undefined, 'drive30', false, DAY, true);
      const firstIsland = list.findIndex((c) => islandOf(c.spot) === island);
      expect(firstIsland, area).toBeGreaterThan(-1);
      // every main-island place that is not a trail comes before the first island place
      expect(list.slice(firstIsland).some((c) => !c.spot.trail && islandOf(c.spot) === null), area).toBe(false);
      const cards = pickCards(fileSpots, a, 'walk', {}, undefined, 'drive30', false, DAY, true).cards;
      expect(cards.some((c) => islandOf(c.spot) !== null), `${area}: ${cards.map((c) => name(c.spot.id))}`).toBe(false);
    }
  });

  it('origin on 우도: its own places are not moved — the 우도 card stays first at night', () => {
    const udo = areaByName('우도')!;
    expect(islandOf(udo)).toBe('우도');
    const day = pickCards(fileSpots, udo, 'walk', {}, undefined, 'drive30', false, DAY, false).cards;
    const atNight = pickCards(fileSpots, udo, 'walk', {}, undefined, 'drive30', false, DAY, true);
    expect(islandOf(day[0].spot)).toBe('우도');
    expect(atNight.cards[0].spot.id).toBe(day[0].spot.id);
    // only trails go back there: no 우도 place that is not a trail moved
    expect(pool(fileSpots, udo, 'walk', undefined, 'drive30', false, DAY, true).filter((c) => c.late && !c.spot.trail)).toEqual([]);
    expect(atNight.nightShifted).toBe('trail');
  });

  it('다른 3곳 보기 at night: every other place before anything hard to go to, none twice, and every place in the round', () => {
    for (const name of AREAS3) {
      const a = areaByName(name)!;
      const hard = hardFrom(a);
      const all = pool(fileSpots, a, 'walk', undefined, 'drive30', false, DAY, true);
      const late = new Set(all.filter((c) => hard(c.spot)).map((c) => c.spot.id));
      const others = all.length - late.size;
      let h: Histories = {};
      const shown: string[] = [];
      let sawLate = false;
      for (let tap = 0; tap < Math.ceil(all.length / 3); tap++) {
        const r = pickCards(fileSpots, a, 'walk', h, undefined, 'drive30', false, DAY, true);
        // one only once the others have all been shown (the round's last tap may bring seen ones back: 한 바퀴)
        if (!r.wrapped)
          for (const c of r.cards) {
            if (late.has(c.spot.id)) sawLate = true;
            else expect(sawLate, `${name} tap ${tap}`).toBe(false);
          }
        shown.push(...ids(r.cards));
        h = r.histories;
      }
      expect(shown.slice(0, others).some((id) => late.has(id)), name).toBe(false);
      expect(new Set(shown.slice(0, others)).size, name).toBe(others);
      expect(new Set(shown).size, name).toBe(all.length);
    }
  });
});

describe('부산 (plans/busan.md S6, B12): 22시 「좀 걷고 싶어」 동래·금정', () => {
  const busan = normalizeSpots(JSON.parse(readFileSync(resolve(__dirname, '../public/spots-busan.json'), 'utf8'))) as Spot[];
  const dongnae = BUSAN_AREAS.find((a) => a.slug === 'dongnae')!;
  // round 02's 16 true calls (review/busan/night/trail-02.json, audit passed)
  const first = new Set((JSON.parse(readFileSync(resolve(__dirname, '../review/busan/night/trail-02.json'), 'utf8')) as { id: string; trail: boolean }[]).filter((c) => c.trail).map((c) => c.id));
  const marked: Spot[] = busan.map((s) => (first.has(s.id) ? { ...s, trail: true as const } : s));
  it('22시 is night at 동래·금정 (the area\'s own sun)', () => {
    expect(nightNow(at('22:00'), dongnae, DAY)).toBe(true);
  });
  it('with trails marked, no trail comes before another candidate at 22시, three taps, every range', () => {
    for (const reach of REACHES) {
      let h: Histories = {};
      for (let tap = 0; tap < 3; tap++) {
        const r = pickCards(marked, dongnae, 'walk', h, undefined, reach, false, DAY, true);
        const order = r.cards.map((c) => c.spot.trail === true);
        expect(order.indexOf(true) === -1 || !order.slice(order.indexOf(true)).includes(false), `${reach} tap ${tap}`).toBe(true);
        expect(pool(marked, dongnae, 'walk', undefined, reach, false, DAY, true).filter((c) => !c.spot.trail).length >= r.cards.filter((c) => !c.spot.trail).length).toBe(true);
        h = r.histories;
      }
    }
    // the shift shows: by night the 30-minute picks are not the day's, and say so
    const day = pickCards(marked, dongnae, 'walk', {}, undefined, 'drive30', false, DAY);
    const nightR = pickCards(marked, dongnae, 'walk', {}, undefined, 'drive30', false, DAY, true);
    expect(day.cards.some((c) => c.spot.trail)).toBe(true);
    expect(nightR.cards.some((c) => c.spot.trail)).toBe(false);
    expect(nightR.nightShifted).toBe('trail');
  });
  it('the shipped Busan file (round 02 passed) carries exactly those trails, so the night picks above are what ships', () => {
    expect(busan.filter((s) => s.trail).map((s) => s.id).sort()).toEqual([...first].sort());
    expect(shape(pickCards(busan, dongnae, 'walk', {}, undefined, 'drive30', false, DAY, true))).toBe(shape(pickCards(marked, dongnae, 'walk', {}, undefined, 'drive30', false, DAY, true)));
  });
});

describe('ADR-0108 × 밤: what moved is judged by the day order (거리 칸 first)', () => {
  it('the nearest trail goes back at night and the line says so', () => {
    const list = [mk('t3', 2, 3, T), mk('p5', 10, 5), mk('q5', 11, 5), mk('r5', 12, 5)];
    expect(ids(pickCards(list, o, 'walk', {}, undefined, 'drive30', false, undefined, false).cards)).toEqual(['t3', 'p5', 'q5']);
    const r = night(list);
    expect(ids(r.cards)).toEqual(['p5', 'q5', 'r5']);
    expect(r.nightShifted).toBe('trail');
  });
  it('a far better-scored trail that was not shown by day is not said to have moved', () => {
    const list = [mk('p3', 2, 3), mk('q3', 3, 3), mk('r3', 4, 3), mk('t5', 12, 5, T)];
    expect(ids(pickCards(list, o, 'walk', {}, undefined, 'drive30', false, undefined, false).cards)).toEqual(['p3', 'q3', 'r3']);
    const r = night(list);
    expect(ids(r.cards)).toEqual(['p3', 'q3', 'r3']);
    expect(r.nightShifted).toBeNull();
  });
});
