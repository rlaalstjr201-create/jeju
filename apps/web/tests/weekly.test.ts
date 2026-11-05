// 이번 주 서울 (ADR-0118, specs/seoul-weekly.md): the shipped file's shape, ended things gone, the day's own list first by name,
// the 'week' shelf holding only them (open now by their dates and times), its place in the hour's order, the card sheet.
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import FILE from '../data/seoul/weekly-seoul.json';
import { ORDER, SHELVES, buildShelves, inHood } from '../src/browse';
import { BROWSE_COPY, browseCardSheet } from '../src/browse-view';
import { openNow, type CultureItem, type Now } from '../src/culture';
import { funItems, realItems } from '../src/fun';
import { isWeek, weeklyItems, type WeekRow } from '../src/weekly';

const ROWS = FILE.items as WeekRow[];
const now = (day: string, h: number, m = 0): Now => ({ day, weekday: new Date(`${day}T00:00:00Z`).getUTCDay(), minute: h * 60 + m });
const row = (over: Partial<WeekRow>): WeekRow => ({ id: 'wk-1-20261101', name: '어느 팝업', kind: '팝업', start: '2026-11-01', end: '2026-11-08', time: '11:00~20:00', place: '어느 곳', lat: 37.5446, lng: 127.0559, kakao: 'https://place.map.kakao.com/1', src: 'https://blog.naver.com/x/1', reserve: 'none', ...over });
const 성수 = { lat: 37.5446, lng: 127.0559 };

describe('the shipped file (review/seoul-weekly, criteria-01)', () => {
  it('17 things, each with a kind, dates, a Seoul place, https links and a reservation value', () => {
    expect(ROWS.length).toBe(17);
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
    expect(weeklyItems('2026-11-05').length).toBe(17);
    expect(weeklyItems('2026-11-09').every((i) => i.end >= '2026-11-09')).toBe(true);
    expect(weeklyItems('2026-11-09').length).toBeLessThan(17);
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
    expect(s[0].cards[0].why).toMatch(/일요일까지/);
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

describe('the card sheet', () => {
  it('its dates, a queue when there may be one, 출처 글 보기 to the post', () => {
    const doc = new JSDOM('<!doctype html><body></body>').window.document;
    const it0 = weeklyItems('2026-11-05', [], [row({ reserve: 'onsite' })]);
    const sheet = browseCardSheet(doc, it0, it0[0].id, now('2026-11-05', 14), 성수, 'naver', (n) => n, [])!;
    const text = sheet.textContent ?? '';
    expect(text).toContain('11.1~11.8');
    expect(text).toContain(BROWSE_COPY.onsite);
    const more = [...sheet.querySelectorAll('a')].find((a) => a.dataset.blink === 'more')!;
    expect(more.textContent).toBe(BROWSE_COPY.post);
    expect(more.getAttribute('href')).toBe('https://blog.naver.com/x/1');
  });
});
