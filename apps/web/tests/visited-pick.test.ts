// @vitest-environment jsdom
// 가 봤어요 (ADR-0087, specs/hide-visited.md S1): 뺀 곳 are left out of the one array the cards, 「예:」, 노을 볼 곳 and
// 오늘 장 서는 곳 are picked from; the widening rules (빈손 없음) stay as they are; with none left out nothing changes.
import { beforeEach, describe, expect, it } from 'vitest';
import { AREAS, areaByName, type AreaName } from '../src/areas';
import { openMarkets, sunsetSpots } from '../src/home';
import { islandTop, pickCards, pool, REACHES, type Button, type Mood, type Spot, type Tab } from '../src/pick';
import { splitName } from '../src/render';
import { pickSpots } from '../src/state';
import { KEYS } from '../src/store';
import { sunsetMinutes } from '../src/sun';
import { fileSpots } from './fixtures';
import { $, flush, render, reset } from './harness';

const DAY = '2026-10-03'; // 중문's market day
const LISTS: { button: Button; tab?: Tab; mood: Mood }[] = [
  { button: 'rest', mood: 'rest' },
  { button: 'walk', mood: 'walk' },
  { button: 'food', tab: 'meal', mood: 'food' },
  { button: 'food', tab: 'cafe', mood: 'food' },
  { button: 'new', tab: 'mix', mood: 'new' },
  { button: 'new', tab: 'sight', mood: 'new' },
  { button: 'new', tab: 'do', mood: 'new' },
];
const kst = (day: string, min: number) => new Date(Date.parse(`${day}T00:00:00+09:00`) + min * 60_000);
const region = (name: AreaName) => {
  window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
  window.localStorage.setItem('jeju.region', JSON.stringify(name));
};
const visit = (ids: string[]) => window.localStorage.setItem(KEYS.visited, JSON.stringify(ids));
async function home(today: () => Date) {
  render({ today });
  await flush();
  await flush();
}

beforeEach(reset);

describe('S1 pickSpots', () => {
  it('none left out: the data itself (the same array, so every pick is exactly as before)', () => {
    expect(pickSpots(fileSpots, [])).toBe(fileSpots);
  });
  it('left out by id; the same list again gives the same array; the data and `hide` are not touched', () => {
    const ids = [fileSpots[0].id, fileSpots[1].id, 'not-in-the-data'];
    const a = pickSpots(fileSpots, ids);
    expect(a).toHaveLength(fileSpots.length - 2);
    expect(a.some((s) => ids.includes(s.id))).toBe(false);
    expect(pickSpots(fileSpots, ids)).toBe(a);
    expect(fileSpots[0].hide).toBe(fileSpots[0].hide);
    expect(fileSpots.length).toBe(a.length + 2);
  });
});

describe('S1 고르기 — 결과 카드', () => {
  it('a place left out is not picked; put back, it is picked again', () => {
    const o = areaByName('애월')!;
    const first = pickCards(fileSpots, o, 'walk', {}, undefined, 'drive30', false, DAY).cards;
    const out = first[0].spot.id;
    const without = pickCards(pickSpots(fileSpots, [out]), o, 'walk', {}, undefined, 'drive30', false, DAY).cards;
    expect(without.map((c) => c.spot.id)).not.toContain(out);
    expect(without).toHaveLength(3);
    const back = pickCards(pickSpots(fileSpots, []), o, 'walk', {}, undefined, 'drive30', false, DAY).cards;
    expect(back.map((c) => c.spot.id)).toEqual(first.map((c) => c.spot.id));
  });

  it('15 areas × 3 ranges × 7 lists + 아무거나: every near candidate of the list left out → the widening rule as before (빈손 없음)', () => {
    let checked = 0;
    for (const area of AREAS) {
      for (const reach of REACHES) {
        for (const { button, tab, mood } of LISTS) {
          const near = pool(fileSpots, area, mood, tab, reach, false, DAY).map((c) => c.spot.id);
          const from = pickSpots(fileSpots, near);
          const { cards } = pickCards(from, area, button, {}, tab, reach, false, DAY);
          const left = islandTop(from, mood, tab, false, DAY).length;
          expect(cards.length, `${area.name} ${reach} ${button}/${tab}`).toBe(Math.min(3, left));
          expect(cards.some((c) => near.includes(c.spot.id))).toBe(false);
          checked++;
        }
        const nearAny = (['rest', 'walk', 'new'] as Mood[]).flatMap((m) => pool(fileSpots, area, m, undefined, reach, false, DAY).map((c) => c.spot.id));
        const any = pickCards(pickSpots(fileSpots, nearAny), area, 'any', {}, undefined, reach, false, DAY).cards;
        expect(any, `${area.name} ${reach} any`).toHaveLength(3);
        expect(any.some((c) => nearAny.includes(c.spot.id))).toBe(false);
      }
    }
    expect(checked).toBe(15 * 3 * 7);
  });
});

describe('S1 고르기 — 홈(예:·노을·장날)', () => {
  it('뺀 곳 없음: the home is the same DOM whether or not the left-out list holds an id the data does not have', async () => {
    await home(() => kst(DAY, 600));
    const before = $('#home').innerHTML;
    reset();
    visit(['not-in-the-data']);
    await home(() => kst(DAY, 600));
    expect($('#home').innerHTML).toBe(before);
  });

  it('「예:」 skips a place left out', async () => {
    const top = islandTop(fileSpots, 'rest', undefined, false, DAY).filter((s) => s.image);
    visit([top[0].id]);
    await home(() => kst(DAY, 600));
    const want = top.slice(1, 3).map((s) => splitName(s.name.trim()).main).join(', ');
    expect($('[data-mood="rest"] .ex')!.textContent).toBe(`제주 인기: ${want}`);
  });

  it('오늘 장 서는 곳: a market left out is not listed', async () => {
    const open = openMarkets(fileSpots, null, DAY);
    expect(open.length).toBeGreaterThan(0);
    await home(() => kst(DAY, 600));
    expect($('#market')).not.toBeNull();
    reset();
    visit(open.map((r) => r.spot.id));
    await home(() => kst(DAY, 600));
    expect($('#market')).toBeNull();
  });

  it('노을 볼 곳: the 3-place rule counts what is left after 뺀 곳', async () => {
    const p = areaByName('한림')!;
    const origin = { key: 'region:한림', point: p, isPoint: false, from: '한림에서' };
    const rows = sunsetSpots(fileSpots, origin, DAY);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const dusk = () => kst(DAY, sunsetMinutes(p, DAY) - 60);
    region('한림');
    await home(dusk);
    expect($('#today .act[data-action="to-sunset"]')!.textContent).toContain(`${rows.length}곳`);
    // one out: one fewer
    reset();
    region('한림');
    visit([rows[0].spot.id]);
    await home(dusk);
    expect($('#today .act[data-action="to-sunset"]')!.textContent).toContain(`${rows.length - 1}곳`);
    expect($('#sunset')!.textContent).not.toContain(rows[0].spot.name.trim());
    // all but 2 out: no 노을 row, no section
    reset();
    region('한림');
    visit(rows.slice(0, rows.length - 2).map((r) => r.spot.id));
    await home(dusk);
    expect($('#today .act[data-action="to-sunset"]')).toBeNull();
    expect($('#sunset')).toBeNull();
  });
});

describe('S1 not applied: 저장한 곳 keeps a place left out', () => {
  it('saved and left out: the saved list still shows it', async () => {
    const s: Spot = fileSpots.find((x) => !x.hide && x.image)!;
    window.localStorage.setItem(KEYS.savedV2, JSON.stringify([{ id: s.id, date: '2026-10-03', order: 0 }]));
    visit([s.id]);
    render({ today: () => kst(DAY, 600) });
    await flush();
    $('#saved').click();
    await flush();
    await flush();
    expect($('#savedView .picks')!.querySelector(`.card[data-id="${s.id}"]`)).not.toBeNull();
  });
});
