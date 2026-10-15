// 밤에는 야외 산길을 뒤로 (ADR-0091, specs/night-trails.md §2·S2·S3): pickCards / pool / islandTop with `night`.
// By day `trail` is never read; at night a trail goes after every other candidate — never left out — and the
// rotation, the widening (빈손 없음), the tabs and 아무거나 stay as they are. `nightShifted` only when that moved one.
import { describe, expect, it } from 'vitest';
import { AREAS, areaByName } from '../src/areas';
import { islandTop, pickCards, pool, REACHES, type Button, type Card, type Histories, type Spot, type Tab } from '../src/pick';
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

describe('by day: trail is never read (S2 낮 12시)', () => {
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
            expect(r.nightShifted).toBe(false);
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
    const night = pickCards(spots, o, 'walk', {}, undefined, 'drive30', false, undefined, true);
    expect(ids(night.cards)).toEqual(['a4', 'b3', 'c3']);
    expect(night.nightShifted).toBe(true);
    expect(pool(spots, o, 'walk', undefined, 'drive30', false, undefined, true).map((c) => c.spot.id)).toEqual(['a4', 'b3', 'c3', 't5', 't4']);
  });

  it('never left out: the next tap brings the trails (unseen first, as the rotation always does), shown after the other place', () => {
    const first = pickCards(spots, o, 'walk', {}, undefined, 'drive30', false, undefined, true);
    const second = pickCards(spots, o, 'walk', first.histories, undefined, 'drive30', false, undefined, true);
    expect(ids(second.cards)).toEqual(['a4', 't5', 't4']);
    // the trails came because the others were seen, not because night moved them
    expect(second.nightShifted).toBe(false);
    expect(second.wrapped).toBe(true);
  });

  it('too few others: the trails fill the 3, after them', () => {
    const r = pickCards([mk('t5', 1, 5, T), mk('a2', 2, 2), mk('t3', 3, 3, T), mk('t4', 4, 4, T)], o, 'walk', {}, undefined, 'drive30', false, undefined, true);
    expect(ids(r.cards)).toEqual(['a2', 't5', 't4']);
    expect(r.nightShifted).toBe(true);
  });

  it('widening (빈손 없음) is the same: the nearest 3 on the island, a trail among them last', () => {
    // 걸어서 15분: only n1 is that close → the nearest 3 on the whole island, whatever night does
    const far = [mk('n1', 0.5, 3), mk('t2', 5, 5, T), mk('f3', 8, 4), mk('f4', 30, 5)];
    expect(ids(pickCards(far, o, 'walk', {}, undefined, 'walk').cards)).toEqual(['t2', 'f3', 'n1']);
    expect(ids(pickCards(far, o, 'walk', {}, undefined, 'walk', false, undefined, true).cards)).toEqual(['f3', 'n1', 't2']);
  });

  it('nightShifted only when a trail actually moved', () => {
    const night = (list: Spot[], b: Button = 'walk', h: Histories = {}) => pickCards(list, o, b, h, undefined, 'drive30', false, undefined, true);
    // the trails already rank below every other place: night changes nothing
    const below = [mk('a5', 1, 5), mk('b4', 2, 4), mk('c4', 3, 4), mk('t3', 1, 3, T), mk('t2', 1, 2, T)];
    expect(night(below).nightShifted).toBe(false);
    expect(ids(night(below).cards)).toEqual(ids(pickCards(below, o, 'walk').cards));
    // no trail, or nothing but trails: nothing to move
    expect(night([mk('a', 1, 3), mk('b', 2, 4), mk('c', 3, 5)]).nightShifted).toBe(false);
    expect(night([mk('t1', 1, 3, T), mk('t2', 2, 4, T), mk('t3', 3, 5, T)]).nightShifted).toBe(false);
    expect(ids(night([mk('t1', 1, 3, T), mk('t2', 2, 4, T), mk('t3', 3, 5, T)]).cards)).toEqual(['t3', 't2', 't1']);
    // a trail moved behind a place it outranks, though not one of the 3 shown: the order the picks come from changed
    const deep = [mk('a5', 1, 5), mk('b5', 2, 5), mk('c5', 3, 5), mk('t4', 1, 4, T), mk('d3', 2, 3)];
    expect(ids(night(deep).cards)).toEqual(['a5', 'b5', 'c5']);
    expect(night(deep).nightShifted).toBe(true);
    // a trail in the tier shown last time does not move behind an unseen place: the rotation put it there already
    const h: Histories = { walk: { seen: ['t4'], last: ['t4'] } };
    expect(night([mk('t4', 1, 4, T), mk('a3', 1, 3), mk('b3', 2, 3), mk('c3', 3, 3)], 'walk', h).nightShifted).toBe(false);
    // by day never
    expect(pickCards(deep, o, 'walk').nightShifted).toBe(false);
  });

  it('아무거나: one per mood as always; the walk card from the walk list in night order', () => {
    const list = [mk('t5', 1, 5, T), mk('w3', 2, 3), mk('r3', 1, 3, { mood: 'rest' }), mk('n3', 1, 3, { mood: 'new', sub: 'sight' })];
    const day = pickCards(list, o, 'any');
    expect(ids(day.cards)).toEqual(['t5', 'n3', 'r3']);
    const r = pickCards(list, o, 'any', {}, undefined, 'drive30', false, undefined, true);
    expect(ids(r.cards).sort()).toEqual(['n3', 'r3', 'w3']);
    expect(r.nightShifted).toBe(true);
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

describe('S2 real data: 「좀 걷고 싶어」 around 애월 · 서귀포 시내 · 성산 at 22:00, 00:25, 05:00 vs 12:00', () => {
  const AREAS3 = ['애월', '서귀포시내', '성산'] as const;
  const trail = (c: Card) => c.spot.trail === true;

  it('at night no trail comes before another place; a trail is shown only when fewer than 3 others are in the list', () => {
    for (const name of AREAS3) {
      const a = areaByName(name)!;
      for (const hm of ['22:00', '00:25', '05:00']) {
        const night = nightNow(at(hm), a, DAY);
        expect(night, `${name} ${hm}`).toBe(true);
        for (const reach of REACHES) {
          const why = `${name} ${hm} ${reach}`;
          const r = pickCards(fileSpots, a, 'walk', {}, undefined, reach, false, DAY, night);
          const flags = r.cards.map(trail);
          expect(flags.indexOf(true) === -1 || !flags.slice(flags.indexOf(true)).includes(false), why).toBe(true);
          const others = pool(fileSpots, a, 'walk', undefined, reach, false, DAY).filter((c) => !c.spot.trail).length;
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

  it('차로 30분, first tap: 애월 and 성산 change at night, 서귀포 시내 shows the same 3 (its trails moved further down)', () => {
    const both = (name: (typeof AREAS3)[number]) => {
      const a = areaByName(name)!;
      const day = pickCards(fileSpots, a, 'walk', {}, undefined, 'drive30', false, DAY, false);
      const night = pickCards(fileSpots, a, 'walk', {}, undefined, 'drive30', false, DAY, true);
      return { day: ids(day.cards), night: ids(night.cards), shifted: night.nightShifted };
    };
    const aewol = both('애월');
    expect(aewol.night).not.toEqual(aewol.day);
    expect(aewol.shifted).toBe(true);
    const seongsan = both('성산');
    expect(seongsan.night).not.toEqual(seongsan.day);
    const seogwipo = both('서귀포시내');
    expect(seogwipo.night).toEqual(seogwipo.day);
    expect(seogwipo.shifted).toBe(true);
  });

  it('다른 3곳 보기 at night: every other place before any trail, none twice, and every place in the round', () => {
    for (const name of AREAS3) {
      const a = areaByName(name)!;
      const all = pool(fileSpots, a, 'walk', undefined, 'drive30', false, DAY, true);
      const trails = new Set(all.filter((c) => c.spot.trail).map((c) => c.spot.id));
      const others = all.length - trails.size;
      let h: Histories = {};
      const shown: string[] = [];
      let sawTrail = false;
      for (let tap = 0; tap < Math.ceil(all.length / 3); tap++) {
        const r = pickCards(fileSpots, a, 'walk', h, undefined, 'drive30', false, DAY, true);
        // a trail only once the others have all been shown (the round's last tap may bring seen ones back: 한 바퀴)
        if (!r.wrapped)
          for (const c of r.cards) {
            if (c.spot.trail) sawTrail = true;
            else expect(sawTrail, `${name} tap ${tap}`).toBe(false);
          }
        shown.push(...ids(r.cards));
        h = r.histories;
      }
      expect(shown.slice(0, others).some((id) => trails.has(id)), name).toBe(false);
      expect(new Set(shown.slice(0, others)).size, name).toBe(others);
      expect(new Set(shown).size, name).toBe(all.length);
    }
  });
});
