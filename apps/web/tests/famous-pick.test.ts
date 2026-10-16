// @vitest-environment jsdom
// 유명한 데 가 보고 싶어 (ADR-0092, specs/famous-places.md §2·F1–F4·F7): the 유명한 곳 whatever their mood, picked by
// the rules every mood has (range, score, widening, rotation, 밤); outdoors by default, the indoor ones with 비 와요.
import { describe, expect, it } from 'vitest';
import { AREAS, areaByName } from '../src/areas';
import { readDeepLink } from '../src/deeplink';
import { parseSession } from '../src/store';
import { parseBatch } from '../events/validate';
import { historyKey, islandOf, pickCards, REACHES, type Button, type Card, type Histories, type Spot } from '../src/pick';
import type { FamousItem } from '../scripts/famous.mjs';
import { loadInputs } from '../scripts/sunset.mjs';
import { $, $$, cardNames, render, reset, tap } from './harness';
import { fileSpots } from './fixtures';

const DAY = '2026-10-16';
const inputs = loadInputs() as unknown as Map<string, FamousItem>;
const names = (cards: Card[]) => cards.map((c) => c.spot.name);
const pick = (area: string, h: Histories = {}, indoor = false, night = false) =>
  pickCards(fileSpots, areaByName(area as never)!, 'famous', h, undefined, 'drive30', indoor, DAY, night);
/** the data as it was before ADR-0092: no `famous` anywhere */
const plain = fileSpots.map(({ famous: _f, ...s }) => s as Spot);

describe('by day (F1·F2)', () => {
  it('성산: 광치기해변 · 섭지코지 · 성산일출봉 — no 먹기, no cafe', () => {
    const r = pick('성산');
    expect(names(r.cards)).toEqual(['광치기해변', '섭지코지', '성산일출봉']);
    expect(r.cards.every((c) => c.spot.mood !== 'food' && inputs.get(c.spot.id)!.category !== 'cafe')).toBe(true);
  });
  it('서귀포 시내: 천지연폭포 and 정방폭포 are among the first 3', () => {
    expect(names(pick('서귀포시내').cards)).toEqual(expect.arrayContaining(['천지연폭포', '정방폭포']));
  });
  it('the next 3 are others (다른 3곳 보기), still 유명한 곳', () => {
    const first = pick('성산');
    const next = pick('성산', first.histories);
    expect(next.cards).toHaveLength(3);
    expect(next.cards.every((c) => c.spot.famous && !first.cards.some((x) => x.spot.id === c.spot.id))).toBe(true);
  });
  it('the rotation is its own: key famous', () => {
    expect(historyKey('famous')).toBe('famous');
    expect(Object.keys(pick('성산').histories)).toEqual(['famous']);
  });
});

describe('every area, range and 비 와요 (F3·F7)', () => {
  it('3 cards, each a 유명한 곳: outdoors without 비 와요, indoors with it — never 먹기 or a cafe source', () => {
    for (const area of AREAS)
      for (const reach of REACHES)
        for (const indoor of [false, true]) {
          let h: Histories = {};
          for (let t = 0; t < 2; t++) {
            const r = pickCards(fileSpots, area, 'famous', h, undefined, reach, indoor, DAY);
            const tag = `${area.name} ${reach} ${indoor ? '실내' : ''} tap ${t}`;
            expect(r.cards, tag).toHaveLength(3);
            for (const c of r.cards) {
              expect(c.spot.famous, `${tag} ${c.spot.name}`).toBe(true);
              expect(c.spot.indoor === true, `${tag} ${c.spot.name}`).toBe(indoor);
              expect(c.spot.mood, `${tag} ${c.spot.name}`).not.toBe('food');
              expect(['cafe', 'restaurant', 'shopping'], `${tag} ${c.spot.name}`).not.toContain(inputs.get(c.spot.id)!.category);
            }
            h = r.histories;
          }
        }
  });
});

describe('밤 (F4, ADR-0091)', () => {
  it('성산 at night: 성산일출봉 (a 야외 산길) and 우도 go back, the status line says both kinds', () => {
    const r = pick('성산', {}, false, true);
    expect(names(r.cards)).not.toContain('성산일출봉');
    expect(r.cards.some((c) => c.spot.trail || islandOf(c.spot))).toBe(false);
    expect(r.nightShifted).toBe('both');
  });
  it('by day nothing moves', () => {
    expect(pick('성산').nightShifted).toBeNull();
  });
});

describe('the other buttons are as they were', () => {
  it('rest · walk · new · food · 아무거나: the same cards with or without famous in the data', () => {
    const lists: [Button, ('meal' | 'cafe' | 'mix' | 'sight' | 'do')?][] = [['rest'], ['walk'], ['new', 'mix'], ['new', 'sight'], ['food', 'meal'], ['food', 'cafe'], ['any']];
    for (const area of AREAS)
      for (const [b, tab] of lists)
        for (const indoor of [false, true]) {
          const a = pickCards(fileSpots, area, b, {}, tab, 'drive30', indoor, DAY);
          const p = pickCards(plain, area, b, {}, tab, 'drive30', indoor, DAY);
          expect(a.cards.map((c) => c.spot.id), `${area.name} ${b}`).toEqual(p.cards.map((c) => c.spot.id));
        }
  });
});

describe('links, the session record and the usage counts take famous', () => {
  it('?mood=famous', () => {
    expect(readDeepLink('?mood=famous&area=seongsan', DAY)).toEqual({ mood: 'famous', area: '성산' });
  });
  it('a session record for famous comes back', () => {
    expect(parseSession({ v: 1, mood: 'famous', sub: 'meal', origin: null })).toMatchObject({ mood: 'famous' });
  });
  it('the collector takes a famous tap (no sub)', () => {
    const batch = [{ e: 'tap', mood: 'famous', d: DAY }];
    expect(parseBatch(JSON.stringify(batch), DAY)).toEqual({ ok: true, events: batch });
    expect(parseBatch(JSON.stringify([{ ...batch[0], sub: 'mix' }]), DAY)).toMatchObject({ ok: false });
  });
});

describe('the app (first screen and results)', () => {
  it('the 4th mood row, 「예:」 once the data is in; a tap shows its 3 near 성산 under its own title', async () => {
    reset();
    window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
    window.localStorage.setItem('jeju.region', JSON.stringify('성산'));
    render();
    const rows = $$('.moods [data-mood]');
    expect(rows.map((b) => b.dataset.mood)).toEqual(['rest', 'walk', 'new', 'famous', 'food']);
    await tap('[data-mood="famous"]');
    expect($('#crumb').textContent).toBe('유명한 데 가 보고 싶어');
    expect(cardNames()).toContain('성산일출봉');
    expect($('#foodSub').hidden && $('#newSub').hidden).toBe(true);
    await tap('#back');
    expect($('[data-mood="famous"] .ex')?.textContent).toMatch(/^예: /);
  });
});
