// @vitest-environment jsdom
// 익명 사용 기록 (ADR-0061, specs/usage-events.md U1–U3): the tracker on its own (batching, offline, off), and
// in the app with a fake sendBeacon (which events, once each, no position).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLUSH_AT, FLUSH_MS, createTracker, type UsageEvent } from '../src/track';
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

const exp = realSpots.find((s) => s.bookable)!;
const others = realSpots.filter((s) => s.mood === exp.mood && !s.bookable).slice(0, 5);
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
    expect($('#trackNote').textContent).toBe('어디가 좋았는지 익명으로 세어요.');
    expect($('#savedView [data-action="track"]').textContent).toBe('기록 끄기');
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
    const ctx = { mood, ...(mood === 'food' ? { sub: 'meal' } : {}), range: '30', basis: 'here', dated: false, d };
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
    expect([...keys].sort()).toEqual(['basis', 'd', 'dated', 'e', 'id', 'mood', 'range', ...(mood === 'food' ? ['sub'] : [])].sort());
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

describe('U3 기록 끄기', () => {
  it('under the saved list footnote: the note and 기록 끄기; off → nothing sent, still off after a reload; 기록 켜기 turns it back on', async () => {
    render({ eventsUrl: URL_, beacon, loadSpots: spots, locate: () => Promise.resolve(exp) });
    await tap(`[data-mood="${exp.mood}"]`);
    await tap($$('#cards .heart')[0]);
    await tap('#saved');
    const btn = () => $<HTMLButtonElement>('#savedView [data-action="track"]');
    expect($('#savedView .foot').nextElementSibling).toBe(btn().parentElement);
    expect(btn().parentElement!.hidden).toBe(false);
    expect($('#trackNote').textContent).toBe('어디가 좋았는지 익명으로 세어요.');
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
