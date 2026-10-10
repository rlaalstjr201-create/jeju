// @vitest-environment jsdom
// 익명 사용 기록 (ADR-0061, specs/usage-events.md U1–U3): the tracker on its own (batching, offline, off), and
// in the app with a fake sendBeacon (which events, once each, no position).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLUSH_AT, FLUSH_MS, ageOf, createTracker, type UsageEvent } from '../src/track';
import { listed } from '../src/pick';
import { realSpots } from './fixtures';
import { $, $$, advance, cardIds, current, flush, render, reset, tap } from './harness';

const URL_ = 'https://events.test/e';
const ev = (i: number): UsageEvent => ({ e: 'shown', id: `p${i}`, range: '30', basis: 'here', dated: false, d: '2026-09-30' });

describe('track.ts — batching', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it(`sends every ${FLUSH_MS / 1000}s, at ${FLUSH_AT} events, and when the page is hidden — as one JSON array`, () => {
    const send = vi.fn(() => true);
    const t = createTracker({ url: URL_, send, enabled: () => true, online: () => true, doc: document });
    t.track(ev(1));
    t.track(ev(2));
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(FLUSH_MS);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenLastCalledWith(URL_, JSON.stringify([ev(1), ev(2)]));
    for (let i = 0; i < FLUSH_AT; i++) t.track(ev(i));
    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.parse((send.mock.calls[1] as unknown as [string, string])[1])).toHaveLength(FLUSH_AT);
    t.track(ev(99));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    delete (document as unknown as Record<string, unknown>).visibilityState;
    expect(send).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(FLUSH_MS * 3);
    expect(send).toHaveBeenCalledTimes(3); // nothing left, nothing sent empty
  });

  it('offline: the batch is dropped, never retried; a failing sendBeacon changes nothing', () => {
    let online = false;
    const send = vi.fn(() => true);
    const t = createTracker({ url: URL_, send, enabled: () => true, online: () => online });
    t.track(ev(1));
    t.flush();
    online = true;
    t.flush();
    vi.advanceTimersByTime(FLUSH_MS);
    expect(send).not.toHaveBeenCalled();
    const boom = createTracker({ url: URL_, send: () => { throw new Error('quota'); }, enabled: () => true, online: () => true });
    boom.track(ev(2));
    expect(() => boom.flush()).not.toThrow();
  });

  it('no address, or 기록 끄기: nothing is queued and nothing is sent', () => {
    const send = vi.fn(() => true);
    for (const url of [undefined, '']) {
      const t = createTracker({ url, send, enabled: () => true, online: () => true });
      t.track(ev(1));
      t.flush();
    }
    let on = true;
    const t = createTracker({ url: URL_, send, enabled: () => on, online: () => true });
    t.track(ev(1));
    on = false;
    t.track(ev(2));
    t.flush();
    vi.advanceTimersByTime(FLUSH_MS);
    expect(send).not.toHaveBeenCalled();
  });
});

// --- in the app ---
const sent: unknown[][] = [];
const beacon = vi.fn((url: string, body: string) => {
  expect(url).toBe(URL_);
  sent.push(JSON.parse(body) as unknown[]);
  return true;
});
function hide() {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
  delete (document as unknown as Record<string, unknown>).visibilityState;
}
const events = () => sent.flat() as Record<string, unknown>[];
// jsdom does not open links; the click still reaches the app first.
const noNav = (e: Event) => e.preventDefault();

beforeEach(() => {
  reset();
  sent.length = 0;
  beacon.mockClear();
  document.addEventListener('click', noNav);
});
afterEach(() => document.removeEventListener('click', noNav));

// a 체험 with a verified booking route (ADR-0074), among places of its mood without one
const exp = realSpots.find((s) => s.book && !s.book.u.startsWith('tel:'))!;
const others = realSpots.filter((s) => s.mood === exp.mood && !s.book && listed(s)).slice(0, 5);
const spots = () => Promise.resolve([exp, ...others]);

describe('U1 수집 주소가 없으면 보내지 않는다', () => {
  it('without VITE_EVENTS_URL: taps, hearts, links and hiding the page never call sendBeacon', async () => {
    render({ beacon, loadSpots: spots, locate: () => Promise.resolve(exp) });
    await tap(`[data-mood="${exp.mood}"]`);
    await tap($$('#cards .heart')[0]);
    $('#cards .card-link').click();
    $('#cards a.book')?.click();
    hide();
    expect(beacon).not.toHaveBeenCalled();
  });

  it('without VITE_EVENTS_URL the saved list has no note and no 기록 끄기; with it, both', async () => {
    render({ loadSpots: spots, locate: () => Promise.resolve(exp) });
    await tap(`[data-mood="${exp.mood}"]`);
    await tap($$('#cards .heart')[0]);
    await tap('#saved');
    expect($('#savedView .track').hidden).toBe(true);
    expect($('#savedView .foot').hidden).toBe(false);
    reset();
    render({ eventsUrl: URL_, beacon, loadSpots: spots, locate: () => Promise.resolve(exp) });
    await tap(`[data-mood="${exp.mood}"]`);
    await tap($$('#cards .heart')[0]);
    await tap('#saved');
    expect($('#savedView .track').hidden).toBe(false);
    expect($('#trackNote').textContent).toBe('써 본 기록을 남겨요(GA4·네이버 애널리틱스 포함). 개인정보 처리 안내');
    expect($('#savedView [data-action="track"]').textContent).toBe('기록 끄기');
    expect($('#trackNote a')?.getAttribute('href')).toBe('/privacy'); // D2: what is recorded, in full
  });
});

describe('U2 탭·노출·하트·지도·예약 — 정확히 한 번씩, 좌표 없음', () => {
  it('each event once, with mood / range / basis / dated / day and nothing about a position', async () => {
    render({ eventsUrl: URL_, beacon, loadSpots: spots, locate: () => Promise.resolve(exp) });
    const mood = exp.mood;
    await tap(`[data-mood="${mood}"]`);
    const ids = cardIds() as string[];
    expect(ids).toContain(exp.id);
    const d = current().state().today;
    const sub = mood === 'food' ? 'meal' : mood === 'new' ? 'mix' : null;
    const ctx = { mood, ...(sub ? { sub } : {}), range: '30', basis: 'here', dated: false, d };
    const heart = $(`#cards .card[data-id="${exp.id}"] .heart`);
    await tap(heart); // save
    await tap(heart); // unsave
    // a double tap on the map link: one event
    const link = $(`#cards .card[data-id="${ids[1]}"] .card-link`);
    link.click();
    advance(100);
    link.click();
    advance();
    $(`#cards .card[data-id="${exp.id}"] a.book`).click();
    await flush();
    expect(beacon).not.toHaveBeenCalled(); // batched until 10s / 20 events / hidden
    hide();
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(events()).toEqual([
      { e: 'tap', ...ctx },
      ...ids.map((id) => ({ e: 'shown', id, ...ctx })),
      { e: 'save', id: exp.id, ...ctx },
      { e: 'unsave', id: exp.id, ...ctx },
      { e: 'map', id: ids[1], ...ctx },
      { e: 'book', id: exp.id, ...ctx },
    ]);
    const keys = new Set(events().flatMap((e) => Object.keys(e)));
    expect([...keys].sort()).toEqual(['basis', 'd', 'dated', 'e', 'id', 'mood', 'range', ...(sub ? ['sub'] : [])].sort());
    expect(JSON.stringify(sent)).not.toMatch(/lat|lng|point|origin|\d+\.\d{3,}|T\d\d:/);
  });

  it('shown: once per set of 3 — re-renders, the saved list and back, the same 3 brought back after a reload add nothing; 다른 3곳 보기 is a new set', async () => {
    render({ eventsUrl: URL_, beacon, loadSpots: spots, locate: () => Promise.resolve(exp) });
    await tap(`[data-mood="${exp.mood}"]`);
    const first = cardIds();
    await tap($$('#cards .heart')[0]);
    await tap('#saved');
    await tap('[data-action="close-saved"]');
    await tap('#cards .more');
    const second = cardIds();
    hide();
    const shown = () => events().filter((e) => e.e === 'shown').map((e) => e.id);
    expect(shown()).toEqual([...first, ...second]);
    sent.length = 0;
    render({ eventsUrl: URL_, beacon, loadSpots: spots, locate: () => Promise.resolve(exp) }); // reload
    await flush();
    await flush();
    expect(cardIds()).toEqual(second);
    hide();
    expect(shown()).toEqual([]);
  });

  it('an area basis names the area (and only then); a chosen day is dated; 30 / 60 / walk ranges', async () => {
    window.localStorage.setItem('jeju.basis', '"region"');
    window.localStorage.setItem('jeju.region', '"애월"');
    window.localStorage.setItem('jeju.reach', '"drive60"');
    render({ eventsUrl: URL_, beacon });
    await tap('#basis');
    await tap('#sheet [data-when]:not([data-when="now"])'); // 내일
    await tap('#sheet [data-action="close"].sheet-close');
    await tap('[data-mood="rest"]');
    hide();
    for (const e of events()) expect(e).toMatchObject({ basis: 'area', area: '애월', range: '60', dated: true });
    expect(events().filter((e) => e.e === 'tap')).toHaveLength(1);
  });
});

describe('비 와요(실내만) (ADR-0065) — 사용 기록의 indoor', () => {
  it('on: every event says indoor true; off (the default): no indoor field', async () => {
    window.sessionStorage.setItem('jeju.indoor', 'true');
    render({ eventsUrl: URL_, beacon });
    await tap('[data-mood="rest"]');
    await tap($$('#cards .heart')[0]);
    hide();
    expect(events().length).toBeGreaterThan(3);
    for (const e of events()) expect(e).toMatchObject({ indoor: true });
    sent.length = 0;
    reset();
    render({ eventsUrl: URL_, beacon });
    await tap('[data-mood="rest"]');
    hide();
    for (const e of events()) expect(e).not.toHaveProperty('indoor');
  });
});

describe('U3 기록 끄기', () => {
  it('under the saved list footnote: the note and 기록 끄기; off → nothing sent, still off after a reload; 기록 켜기 turns it back on', async () => {
    render({ eventsUrl: URL_, beacon, loadSpots: spots, locate: () => Promise.resolve(exp) });
    await tap(`[data-mood="${exp.mood}"]`);
    await tap($$('#cards .heart')[0]);
    await tap('#saved');
    const btn = () => $<HTMLButtonElement>('#savedView [data-action="track"]');
    expect($('#savedView .foot').nextElementSibling).toBe(btn().parentElement);
    expect(btn().parentElement!.hidden).toBe(false);
    expect($('#trackNote').textContent).toBe('써 본 기록을 남겨요(GA4·네이버 애널리틱스 포함). 개인정보 처리 안내');
    expect(btn().textContent).toBe('기록 끄기');
    expect(btn().classList.contains('tbtn')).toBe(true);
    await tap(btn());
    expect(btn().textContent).toBe('기록 켜기');
    expect(window.localStorage.getItem('jeju.track')).toBe('false');
    hide(); // what was queued before turning it off goes too
    expect(beacon).not.toHaveBeenCalled();

    await tap('[data-action="close-saved"]');
    await tap('[data-action="change"]');
    render({ eventsUrl: URL_, beacon, loadSpots: spots, locate: () => Promise.resolve(exp) }); // reload
    await flush();
    expect(btn().textContent).toBe('기록 켜기');
    await tap(`[data-mood="${exp.mood}"]`);
    await tap($$('#cards .heart')[0]);
    $('#cards .card-link').click();
    $('#cards a.book')?.click();
    hide();
    expect(beacon).not.toHaveBeenCalled();

    await tap('#saved');
    await tap(btn());
    expect(btn().textContent).toBe('기록 끄기');
    expect(window.localStorage.getItem('jeju.track')).toBe('true');
    await tap('[data-action="close-saved"]');
    await tap('#cards .more');
    hide();
    expect(events().filter((e) => e.e === 'shown')).toHaveLength(3);
  });

  it('기록 끄기 in another tab stops this tab at once: what it queued is dropped, nothing more is sent, the button says 기록 켜기', async () => {
    render({ eventsUrl: URL_, beacon, loadSpots: spots, locate: () => Promise.resolve(exp) });
    await tap(`[data-mood="${exp.mood}"]`); // tap + 3 shown queued
    window.localStorage.setItem('jeju.track', 'false');
    window.dispatchEvent(new StorageEvent('storage', { key: 'jeju.track', oldValue: null, newValue: 'false', storageArea: window.localStorage }));
    await tap($$('#cards .heart')[0]);
    hide();
    expect(beacon).not.toHaveBeenCalled();
    expect($('#savedView [data-action="track"]').textContent).toBe('기록 켜기');
    // the other tab turns it back on
    window.localStorage.setItem('jeju.track', 'true');
    window.dispatchEvent(new StorageEvent('storage', { key: 'jeju.track', oldValue: 'false', newValue: 'true', storageArea: window.localStorage }));
    expect($('#savedView [data-action="track"]').textContent).toBe('기록 끄기');
  });

  it('storage cleared in another tab (key null) re-reads 기록 too', async () => {
    window.localStorage.setItem('jeju.track', 'false');
    render({ eventsUrl: URL_, beacon, loadSpots: spots, locate: () => Promise.resolve(exp) });
    await flush();
    expect($('#savedView [data-action="track"]').textContent).toBe('기록 켜기');
    window.localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: window.localStorage }));
    expect($('#savedView [data-action="track"]').textContent).toBe('기록 끄기');
    // and turned off again elsewhere with a queue in this tab
    await tap(`[data-mood="${exp.mood}"]`);
    window.localStorage.setItem('jeju.track', 'false');
    window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: window.localStorage }));
    hide();
    expect(beacon).not.toHaveBeenCalled();
  });

  it('storage blocked: 기록 끄기 still holds for the visit', async () => {
    render({ eventsUrl: URL_, beacon, storage: null, loadSpots: spots, locate: () => Promise.resolve(exp) });
    await tap(`[data-mood="${exp.mood}"]`);
    await tap($$('#cards .heart')[0]);
    await tap('#saved');
    await tap('#savedView [data-action="track"]');
    await tap('[data-action="close-saved"]');
    await tap('#cards .more');
    hide();
    expect(beacon).not.toHaveBeenCalled();
    expect($('#savedView [data-action="track"]').textContent).toBe('기록 켜기');
  });
});

// --- 저장 목록 흐름 (ADR-0085, specs/saved-flow-events.md F2–F6) ---
const TODAY = '2026-10-10';
/** a Jeju wall clock: `hm` on that Jeju day */
const kst = (day: string, hm = '10:00') => () => new Date(`${day}T${hm}:00+09:00`);
const row = (id: string, date: string, order: number, at?: string) => ({ id, date, order, ...(at ? { at } : {}) });
function seed(entries: ReturnType<typeof row>[]) {
  window.localStorage.setItem('jeju.saved.v2', JSON.stringify(entries));
}
const flowRender = () => render({ eventsUrl: URL_, beacon, loadSpots: spots, locate: () => Promise.resolve(exp), today: kst(TODAY) });
const savedLink = (id: string) => $<HTMLAnchorElement>(`#savedView .card[data-id="${id}"] .card-link`);
const ctxNow = { range: '30', basis: 'here', dated: false, d: TODAY };

describe('F4 ageOf — 담은 날부터 오늘까지', () => {
  it('same day 0, yesterday 1, two days 2, three days still 2, no `at` none', () => {
    expect(ageOf(TODAY, TODAY)).toBe(0);
    expect(ageOf('2026-10-09', TODAY)).toBe(1);
    expect(ageOf('2026-10-08', TODAY)).toBe(2);
    expect(ageOf('2026-10-07', TODAY)).toBe(2);
    expect(ageOf('2026-09-30', '2026-10-01')).toBe(1); // across a month
    expect(ageOf(undefined, TODAY)).toBeUndefined();
  });

  it('a heart at 00:30 in Jeju (still the day before in UTC) is saved on the Jeju day, kept on this device only', async () => {
    render({ eventsUrl: URL_, beacon, loadSpots: spots, locate: () => Promise.resolve(exp), today: kst(TODAY, '00:30') });
    await tap(`[data-mood="${exp.mood}"]`);
    await tap($$('#cards .heart')[0]);
    const stored = JSON.parse(window.localStorage.getItem('jeju.saved.v2')!) as Record<string, unknown>[];
    expect(stored).toEqual([expect.objectContaining({ date: TODAY, at: TODAY })]);
    hide();
    expect(JSON.stringify(sent)).not.toMatch(/"at"/);
  });
});

describe('F2 저장 목록 열기 — open', () => {
  it('once per opening: re-draws, 지난 날 펼치기 and moving rows add none; ♥ 0 with a folded 지난 날 says live0 and past', async () => {
    seed([row(others[0].id, '2026-10-08', 0, '2026-10-07')]); // only a day gone by: ♥ 0, 지난 날 folded
    flowRender();
    await flush();
    await tap('#saved');
    await tap('#savedView [data-action="past"]'); // a re-draw
    await tap('#savedView [data-action="past"]');
    await tap('[data-action="close-saved"]');
    await tap('#saved');
    hide();
    const opens = events().filter((e) => e.e === 'open');
    expect(opens).toEqual([
      { e: 'open', live0: true, past: true, ...ctxNow },
      { e: 'open', live0: true, past: true, ...ctxNow },
    ]);
  });

  it('something on today and later, nothing gone by: neither live0 nor past', async () => {
    seed([row(others[0].id, TODAY, 0, TODAY)]);
    flowRender();
    await flush();
    await tap('#saved');
    hide();
    expect(events().filter((e) => e.e === 'open')).toEqual([{ e: 'open', ...ctxNow }]);
  });
});

describe('F3 저장 목록에서 연 길찾기 — map from saved', () => {
  it("from: 'saved' with that row's age and past; no `at` → no age; a card's map has none of them", async () => {
    seed([
      row(others[0].id, '2026-10-08', 0, '2026-10-07'), // gone by, saved 3 days ago
      row(others[1].id, TODAY, 0, '2026-10-09'), // today, saved yesterday
      row(others[2].id, TODAY, 1), // saved before this (or from a backup)
    ]);
    flowRender();
    await flush();
    await tap('#saved');
    savedLink(others[1].id).click();
    advance();
    savedLink(others[2].id).click();
    advance();
    await tap('#savedView [data-action="past"]');
    savedLink(others[0].id).click();
    advance();
    await tap('[data-action="close-saved"]');
    await tap(`[data-mood="${exp.mood}"]`);
    const id = cardIds()[0] as string;
    $(`#cards .card[data-id="${id}"] .card-link`).click();
    advance();
    hide();
    const maps = events().filter((e) => e.e === 'map');
    expect(maps.slice(0, 3)).toEqual([
      { e: 'map', id: others[1].id, from: 'saved', age: 1, ...ctxNow },
      { e: 'map', id: others[2].id, from: 'saved', ...ctxNow },
      { e: 'map', id: others[0].id, from: 'saved', age: 2, past: true, ...ctxNow },
    ]);
    expect(maps[3]).toMatchObject({ e: 'map', id });
    for (const k of ['from', 'age', 'past']) expect(maps[3]).not.toHaveProperty(k);
    expect(JSON.stringify(sent)).not.toMatch(/"at"|2026-10-07|2026-10-09/);
  });
});

describe('Q3 저장 목록 정리 — arrange', () => {
  it('위로 / 아래로 / 다른 날로 (moved) / 지난 날 펼치기·접기: one arrange each, no place', async () => {
    seed([row(others[0].id, TODAY, 0, TODAY), row(others[1].id, TODAY, 1, TODAY), row(others[2].id, '2026-10-08', 0), row(others[3].id, '2026-10-11', 0)]);
    flowRender();
    await flush();
    await tap('#saved');
    await tap(`#savedView [data-action="down"][data-id="${others[0].id}"]`);
    await tap(`#savedView [data-action="up"][data-id="${others[0].id}"]`);
    await tap(`#savedView [data-action="move-day"][data-id="${others[0].id}"]`);
    await tap('#sheet [data-day="2026-10-11"]');
    await tap('#savedView [data-action="past"]');
    await tap('#savedView [data-action="past"]');
    hide();
    const arr = events().filter((e) => e.e === 'arrange');
    expect(arr.map((e) => e.op)).toEqual(['down', 'up', 'move', 'past', 'past']);
    for (const e of arr) expect(e).toEqual({ e: 'arrange', op: e.op, ...ctxNow });
  });
});

describe('F6 기록 끄기 — 새 이벤트도 0건', () => {
  it('off: opening the list, arranging it and its map links send nothing', async () => {
    window.localStorage.setItem('jeju.track', 'false');
    seed([row(others[0].id, TODAY, 0, TODAY), row(others[1].id, TODAY, 1, '2026-10-09'), row(others[2].id, '2026-10-08', 0)]);
    flowRender();
    await flush();
    await tap('#saved');
    await tap(`#savedView [data-action="down"][data-id="${others[0].id}"]`);
    await tap('#savedView [data-action="past"]');
    savedLink(others[1].id).click();
    advance();
    hide();
    expect(beacon).not.toHaveBeenCalled();
  });
});
