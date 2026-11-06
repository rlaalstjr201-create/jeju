// 이번 주 서울 (ADR-0118, specs/seoul-weekly.md): the shipped file's shape, ended things gone, the day's own list first by name,
// the 'week' shelf holding only them (open now by their dates and times), its place in the hour's order, the card sheet.
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import FILE from '../data/seoul/weekly-seoul.json';
import { ORDER, SHELVES, browseCard, buildShelves, inHood } from '../src/browse';
import { BROWSE_COPY, browseCardSheet } from '../src/browse-view';
import { openNow, seoulMinutes, type CultureItem, type Now } from '../src/culture';
import { distanceKm } from '../src/pick';
import { funItems, realItems } from '../src/fun';
import { isWeek, usualTime, weeklyItems, type WeekRow } from '../src/weekly';

const ROWS = FILE.items as WeekRow[];
const now = (day: string, h: number, m = 0): Now => ({ day, weekday: new Date(`${day}T00:00:00Z`).getUTCDay(), minute: h * 60 + m });
const row = (over: Partial<WeekRow>): WeekRow => ({ id: 'wk-1-20261101', name: '어느 팝업', kind: '팝업', start: '2026-11-01', end: '2026-11-08', time: '11:00~20:00', place: '어느 곳', lat: 37.5446, lng: 127.0559, kakao: 'https://place.map.kakao.com/1', src: 'https://blog.naver.com/x/1', reserve: 'none', ...over });
const 성수 = { lat: 37.5446, lng: 127.0559 };

describe('the shipped file (review/seoul-weekly, criteria-01)', () => {
  it('16 things (17 kept, 더마비 left out by hand, Amendment 1), each with a kind, dates, a Seoul place, https links and a reservation value', () => {
    expect(ROWS.length).toBe(16);
    expect(ROWS.some((r) => /더마비/.test(r.name))).toBe(false);
    const ids = new Set<string>();
    for (const r of ROWS) {
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      expect(r.id).toMatch(/^wk-\d+-\d{8}$/);
      expect(['팝업', '새로 연 곳', '전시', '마켓', '축제']).toContain(r.kind);
      expect(r.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.start <= r.end).toBe(true);
      // 이번 주 (criteria-01 B): still running on 11-05, begun by 11-11
      expect(r.end >= '2026-11-05' && r.start <= '2026-11-11').toBe(true);
      expect(r.lat).toBeGreaterThan(37.4);
      expect(r.lat).toBeLessThan(37.72);
      expect(r.lng).toBeGreaterThan(126.76);
      expect(r.lng).toBeLessThan(127.19);
      expect(r.kakao).toMatch(/^https:\/\/place\.map\.kakao\.com\/\d+$/);
      expect(r.src).toMatch(/^https:\/\//);
      expect(['none', 'onsite']).toContain(r.reserve);
    }
  });
});

describe('weeklyItems', () => {
  it('ended ones are not made (the day after the last end, none at all)', () => {
    const last = ROWS.map((r) => r.end).sort().at(-1)!;
    expect(weeklyItems('2026-11-05').length).toBe(16);
    expect(weeklyItems('2026-11-09').every((i) => i.end >= '2026-11-09')).toBe(true);
    expect(weeklyItems('2026-11-09').length).toBeLessThan(16);
    const after = new Date(Date.parse(`${last}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);
    expect(weeklyItems(last).length).toBeGreaterThan(0);
    expect(weeklyItems(after)).toEqual([]);
  });

  it("the day's own list first: a thing it has under the same name (spaces and marks aside) is left to it", () => {
    const own = [{ title: '어느  팝업!' } as CultureItem];
    expect(weeklyItems('2026-11-05', own, [row({}), row({ id: 'wk-2-20261101', name: '다른 것' })]).map((i) => i.title)).toEqual(['다른 것']);
  });

  it("are items of the day's list, but not the day's own (realItems)", () => {
    const w = weeklyItems('2026-11-05');
    for (const i of w) {
      expect(isWeek(i)).toBe(true);
      expect(i.link).toMatch(/^https:\/\//);
    }
    expect(realItems([...w, ...funItems('2026-11-05')])).toEqual([]);
  });
});

describe("the 'week' shelf", () => {
  const items = (rows: WeekRow[], day: string) => weeklyItems(day, [], rows);
  it('holds the week\'s items only, open now by their own dates and times', () => {
    const rows = [row({}), row({ id: 'wk-2-20261101', name: '전시 하나', kind: '전시' }), row({ id: 'wk-3-20261110', name: '아직', start: '2026-11-10', end: '2026-11-20' })];
    const s = buildShelves(items(rows, '2026-11-05'), now('2026-11-05', 14), 성수, 17 * 60 + 25);
    expect(s.map((x) => x.key)).toEqual(['week']);
    // 전시 goes to 'week', not to 전시·박물관; one not begun yet is shut
    expect(s[0].cards.map((c) => c.item.title).sort()).toEqual(['어느 팝업', '전시 하나']);
    // the card says its dates only (Amendment 1)
    expect(s[0].cards[0].why).toBe('일요일까지');
    // after its hours, and on the day after it ends: no shelf
    expect(buildShelves(items(rows, '2026-11-05'), now('2026-11-05', 20), 성수, 17 * 60 + 25)).toEqual([]);
    expect(buildShelves(items(rows, '2026-11-09'), now('2026-11-09', 14), 성수, 17 * 60 + 25).flatMap((x) => x.cards.map((c) => c.item.title))).toEqual([]);
  });

  it('the shipped file at 11-05 14:00 near 성수: every card open now and in its dates', () => {
    const s = buildShelves(weeklyItems('2026-11-05'), now('2026-11-05', 14), 성수, 17 * 60 + 25);
    const cards = s.flatMap((x) => x.cards);
    expect(cards.length).toBeGreaterThan(0);
    for (const x of s) expect(x.key).toBe('week');
    for (const c of cards) expect(openNow(c.item, now('2026-11-05', 14), undefined, c.trip?.minutes ?? 0)).not.toBe('shut');
    // 내 위치 먼저: nearest first (no big-name order as the day's own list has)
    const km = cards.map((c) => c.trip!.minutes);
    expect(km).toEqual([...km].sort((x, y) => x - y));
  });

  it('the time to get there counts: open at 19:10 from next door, shut when it takes 30 minutes or more (docs/qa/mutation-2026-11-05.md 2)', () => {
    const w = weeklyItems('2026-11-05', [], [row({})])[0]; // 11:00~20:00 at 성수, out from 19:30
    const 경복궁 = { lat: 37.5796, lng: 126.977 };
    expect(browseCard(w, now('2026-11-05', 19, 10), 성수)).not.toBeNull();
    const card = browseCard(w, now('2026-11-05', 19, 10), null);
    expect(card?.trip).toBeNull();
    expect(seoulMinutes(distanceKm(경복궁, w)).minutes).toBeGreaterThanOrEqual(30);
    expect(browseCard(w, now('2026-11-05', 19, 10), 경복궁)).toBeNull();
  });

  it('reads 「월~목 … 금~토 …」: shut on a Sunday', () => {
    const coach = weeklyItems('2026-11-01').find((i) => i.time.startsWith('월~목'))!;
    expect(coach).toBeTruthy();
    expect(openNow(coach, now('2026-11-01', 14))).toBe('shut'); // a Sunday
    expect(openNow(coach, now('2026-11-06', 14))).toBe('open'); // a Friday
  });

  it('not in a 동네 sheet (its sources are the city\'s, KOPIS\'s and 카카오맵\'s)', () => {
    const hood = { ...funItems('2026-11-05').find((f) => f.fun.g === 'hood')! };
    const w = weeklyItems('2026-11-05', [], [row({ lat: hood.lat, lng: hood.lng })]);
    expect(inHood(hood, w, now('2026-11-05', 14), null)).toEqual([]);
  });

  it("its place in the hour's order (spec): first by day, third in the morning and at dusk, never in the night's or late first three", () => {
    for (const band of Object.values(ORDER)) expect([...band].sort()).toEqual([...SHELVES].sort());
    expect(ORDER.day[0]).toBe('week');
    expect(ORDER.morning.indexOf('week')).toBe(2);
    expect(ORDER.dusk.indexOf('week')).toBe(2);
    expect(ORDER.night.indexOf('week')).toBeGreaterThan(2);
    expect(ORDER.late.indexOf('week')).toBeGreaterThan(2);
  });
});

describe('a kind\'s usual hours where the posts gave none (Amendment 1, review m1)', () => {
  const shelf = (day: string, h: number, m = 0) => buildShelves(weeklyItems(day), now(day, h, m), 성수, 17 * 60 + 25).flatMap((x) => x.cards.map((c) => c.item.title));
  it('the table: a pop-up in a store by its hours, else 12–20; an exhibition 11–18 shut on Mondays; the rest 11–20', () => {
    expect(usualTime({ kind: '팝업', place: '더현대 서울' })).toBe('10:30~20:00');
    expect(usualTime({ kind: '팝업', place: '피앤알 성수' })).toBe('12:00~20:00');
    expect(usualTime({ kind: '전시', place: '리만머핀' })).toBe('화-일 11:00~18:00');
    expect(usualTime({ kind: '축제', place: 'aT센터' })).toBe('11:00~20:00');
    expect(usualTime({ kind: '마켓', place: '면목역광장' })).toBe('11:00~20:00');
    // a time the posts gave is kept
    expect(weeklyItems('2026-11-05').find((i) => i.title.startsWith('코치'))!.time).toMatch(/^월~목/);
  });
  it('리만머핀 not on Monday 11-09 (9:00, 14:00), there on Tuesday 14:00', () => {
    expect(shelf('2026-11-09', 9).some((t) => t.includes('리만머핀'))).toBe(false);
    expect(shelf('2026-11-09', 14).some((t) => t.includes('리만머핀'))).toBe(false);
    expect(shelf('2026-11-10', 14).some((t) => t.includes('리만머핀'))).toBe(true);
  });
  it('더현대 not at 9:00, there at 11:00; nothing that opens later today, nothing within half an hour of its close', () => {
    expect(shelf('2026-11-05', 9).some((t) => t.includes('더현대'))).toBe(false);
    expect(shelf('2026-11-05', 9)).toEqual([]);
    expect(shelf('2026-11-05', 11).some((t) => t.includes('더현대'))).toBe(true);
    // 커튼콜 가든 opens 17:00: not at 14:00, there at 18:00
    expect(shelf('2026-11-05', 14).some((t) => t.includes('커튼콜'))).toBe(false);
    expect(shelf('2026-11-05', 18).some((t) => t.includes('커튼콜'))).toBe(true);
  });
  it('a festival with no time (아이온2) by the table: there on 11-08 at 14:00', () => {
    expect(shelf('2026-11-08', 14).some((t) => t.includes('아이온2'))).toBe(true);
    expect(shelf('2026-11-08', 20).some((t) => t.includes('아이온2'))).toBe(false);
  });
});

describe('the card (Amendment 1, ADR-0123 7): a station-sign tile (kind icon and place), the name under it, one line', () => {
  it('a 4:3 box with the tile; 「토요일까지 · 걸어서 약 …분」', async () => {
    const { homeShelvesView } = await import('../src/browse-view');
    const doc = new JSDOM('<!doctype html><body></body>').window.document;
    const s = buildShelves(weeklyItems('2026-11-05', [], [row({ end: '2026-11-07' })]), now('2026-11-05', 14), 성수, 17 * 60 + 25);
    const box = homeShelvesView(doc, s, { rest: '', walk: '', new: '', famous: '', food: '' }, []);
    const card = box.querySelector('[data-shelf="week"] .bcard')!;
    expect(card.querySelector('.bpic.pl.noimg')).not.toBeNull();
    expect(card.querySelector('.btile.t-week svg.bi path')).not.toBeNull();
    expect(card.querySelector('.btile .bh')!.textContent).toBe('어느 곳');
    expect(card.querySelector('.nm')!.className).toBe('nm');
    expect(card.querySelector('.nm')!.textContent).toBe('어느 팝업');
    const metas = [...card.querySelectorAll('.meta')].map((m) => m.textContent);
    expect(metas.length).toBe(1);
    expect(metas[0]).toMatch(/^토요일까지 · 걸어서 약 \d+분$/);
  });
});

describe('the card sheet', () => {
  it('its dates, a queue when there may be one, 출처 글 보기 to the post', () => {
    const doc = new JSDOM('<!doctype html><body></body>').window.document;
    const it0 = weeklyItems('2026-11-05', [], [row({ reserve: 'onsite' })]);
    const sheet = browseCardSheet(doc, it0, it0[0].id, now('2026-11-05', 14), 성수, 'naver', (n) => n, [])!;
    const text = sheet.textContent ?? '';
    expect(text).toContain('11.1~11.8');
    expect(text).toContain(BROWSE_COPY.onsite);
    const more = [...sheet.querySelectorAll('a')].find((a) => a.textContent === BROWSE_COPY.post)!;
    expect(more.textContent).toBe(BROWSE_COPY.post);
    expect(more.dataset.blink).toBe('post');
    expect(more.getAttribute('href')).toBe('https://blog.naver.com/x/1');
  });
});
