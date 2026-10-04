// @vitest-environment jsdom
// ADR-0078: GA4 · 네이버 애널리틱스 on the page (after load, only while 기록 is on), and the collector on D1
// (POST /api/events, GET /api/events/health).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnalytics, gaParams, type Analytics } from '../src/analytics';
import type { UsageEvent } from '../src/track';
import { countSince, d1Store, type D1Like, type D1Stmt } from '../events/d1';
import { onRequest } from '../functions/api/events/index';
import { onRequestGet as health } from '../functions/api/events/health';
import { listed } from '../src/pick';
import { realSpots } from './fixtures';
import { $, $$, render, tap } from './harness';

const GA = 'G-TEST123';
type W = Window & Record<string, unknown> & { dataLayer?: IArguments[] };
const w = window as unknown as W;
const srcs = () => [...document.querySelectorAll('script[src]')].map((s) => (s as HTMLScriptElement).src);

function loading() {
  Object.defineProperty(document, 'readyState', { configurable: true, value: 'loading' });
}
function loaded() {
  delete (document as unknown as Record<string, unknown>).readyState;
  window.dispatchEvent(new Event('load'));
}

beforeEach(() => {
  for (const s of document.querySelectorAll('script[src]')) s.remove();
  for (const k of ['dataLayer', 'gtag', 'wcs_add', `ga-disable-${GA}`]) delete w[k];
});
afterEach(() => {
  delete (document as unknown as Record<string, unknown>).readyState;
});

describe('createAnalytics', () => {
  const ev: UsageEvent = { e: 'save', id: 'p1', mood: 'rest', range: '30', basis: 'area', area: '애월', dated: false, d: '2026-10-03' };

  it('no ids: nothing at all', () => {
    expect(createAnalytics(window, {})).toBeNull();
    expect(createAnalytics(window, { ga4: ' ', naverWa: '' })).toBeNull();
  });

  it('on: GA4 and wcslog.js are added only after load; GA4 configured without Google signals', () => {
    loading();
    const a = createAnalytics(window, { ga4: GA, naverWa: 'wa1' })!;
    a.setEnabled(true);
    expect(srcs()).toEqual([]);
    loaded();
    expect(srcs()).toEqual([`https://www.googletagmanager.com/gtag/js?id=${GA}`, 'https://wcs.pstatic.net/wcslog.js']);
    expect(w.wcs_add).toEqual({ wa: 'wa1' });
    expect(w[`ga-disable-${GA}`]).toBe(false);
    const calls = w.dataLayer!.map((x) => [...x]);
    expect(calls[1]).toEqual(['config', GA, expect.objectContaining({ allow_google_signals: false, allow_ad_personalization_signals: false })]);
  });

  it('기록 끄기 before load: nothing is loaded; turned on later, it is', () => {
    loading();
    const a = createAnalytics(window, { ga4: GA, naverWa: 'wa1' })!;
    a.setEnabled(false);
    loaded();
    a.event(ev);
    expect(srcs()).toEqual([]);
    expect(w.dataLayer).toBeUndefined();
    expect(w.wcs_add).toBeUndefined();
    a.setEnabled(true);
    expect(srcs()).toHaveLength(2);
  });

  it('mood / shown / map / save go to GA4 with the place id and plain context; no area, day or position; off at runtime stops them', () => {
    const a = createAnalytics(window, { ga4: GA })!; // jsdom: already loaded
    a.setEnabled(true);
    a.event(ev);
    a.event({ e: 'tap', mood: 'walk', range: 'walk', basis: 'here', dated: true, d: '2026-10-03' });
    a.event({ ...ev, e: 'shown', season: 'tangerine' });
    a.event({ ...ev, e: 'map', season: 'tangerine' });
    a.setEnabled(false);
    expect(w[`ga-disable-${GA}`]).toBe(true);
    a.event(ev);
    const events = w.dataLayer!.map((x) => [...x]).filter((c) => c[0] === 'event');
    expect(events).toEqual([
      ['event', 'place_save', { place_id: 'p1', mood: 'rest', range: '30', basis: 'area', dated: false }],
      ['event', 'mood_tap', { mood: 'walk', range: 'walk', basis: 'here', dated: true }],
      ['event', 'card_shown', { place_id: 'p1', mood: 'rest', range: '30', basis: 'area', dated: false, season: 'tangerine' }],
      ['event', 'map_open', { place_id: 'p1', mood: 'rest', range: '30', basis: 'area', dated: false, season: 'tangerine' }],
    ]);
    expect(JSON.stringify(w.dataLayer)).not.toMatch(/lat|lng|애월|2026-10-03"/);
    expect(srcs()).toEqual([`https://www.googletagmanager.com/gtag/js?id=${GA}`]); // no naver id: no wcslog
  });

  it('gaParams never carries the area or the day', () => {
    expect(Object.keys(gaParams({ e: 'map', id: 'x', basis: 'area', area: '애월', d: '2026-10-03', indoor: true }))).toEqual(['place_id', 'basis']);
  });
});

describe('in the app', () => {
  const exp = realSpots.find((s) => listed(s))!;
  const spots = () => Promise.resolve(realSpots.filter((s) => s.mood === exp.mood && listed(s)).slice(0, 6));
  const fake = () => ({ event: vi.fn(), setEnabled: vi.fn() }) satisfies Analytics;

  it('told the stored setting at start; mirrors events; 기록 끄기 turns it off and nothing more is mirrored; the note shows with analytics alone', async () => {
    const a = fake();
    render({ analytics: a, loadSpots: spots, locate: () => Promise.resolve(exp) });
    expect(a.setEnabled).toHaveBeenLastCalledWith(true);
    await tap(`[data-mood="${exp.mood}"]`);
    expect(a.event).toHaveBeenCalledWith(expect.objectContaining({ e: 'tap', mood: exp.mood }));
    await tap($$('#cards .heart')[0]);
    await tap('#saved');
    expect($('#savedView .track').hidden).toBe(false);
    await tap('#savedView [data-action="track"]');
    expect(a.setEnabled).toHaveBeenLastCalledWith(false);
    const n = a.event.mock.calls.length;
    await tap('[data-action="close-saved"]');
    await tap($$('#cards .heart')[1]);
    expect(a.event.mock.calls.length).toBe(n);
    expect(JSON.stringify(a.event.mock.calls)).not.toMatch(/lat|lng|point/);
  });

  it('기록 꺼진 채 시작: told off at start', () => {
    window.localStorage.setItem('jeju.track', 'false');
    const a = fake();
    render({ analytics: a, loadSpots: spots });
    expect(a.setEnabled).toHaveBeenLastCalledWith(false);
    expect(a.setEnabled).not.toHaveBeenCalledWith(true);
  });
});

/** Just enough D1 for the two statements the store runs. */
function fakeD1() {
  const rows = new Map<string, { day: string; id: string; event: string; n: number }>();
  const db: D1Like = {
    prepare(sql) {
      let args: unknown[] = [];
      const stmt: D1Stmt = {
        bind: (...v) => ((args = v), stmt),
        async run() {
          expect(sql).toMatch(/^INSERT INTO counters .* ON CONFLICT \(day, id, event\) DO UPDATE SET n = n \+ excluded\.n$/);
          const [day, id, event, n] = args as [string, string, string, number];
          const k = `${day}|${id}|${event}`;
          const r = rows.get(k);
          if (r) r.n += n;
          else rows.set(k, { day, id, event, n });
          return {};
        },
        async all<T>() {
          return { results: [...rows.values()].map((r) => ({ d: r.day, id: r.id, e: r.event, n: r.n })) as T[] };
        },
        async first<T>() {
          expect(sql).toMatch(/SUM\(n\).*WHERE day >= \?1/);
          return { n: [...rows.values()].filter((r) => r.day >= (args[0] as string)).reduce((s, r) => s + r.n, 0) } as T;
        },
      };
      return stmt;
    },
  };
  return { db, rows };
}

describe('POST /api/events → D1', () => {
  const post = (body: string, headers: Record<string, string> = {}) =>
    new Request('https://x.test/api/events', { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } });

  it('a valid batch: 204, no-store, counters summed per day × place × event', async () => {
    const { db, rows } = fakeD1();
    const d = '2026-10-03';
    const batch = [
      { e: 'tap', mood: 'rest', d },
      { e: 'tap', mood: 'rest', d },
      { e: 'save', id: 'p1', d },
    ];
    const res = await onRequest({ request: post(JSON.stringify(batch)), env: { EVENTS_DB: db } });
    expect(res.status).toBe(204);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await d1Store(db).dump()).toEqual([
      { d, id: 'mood:rest', e: 'tap', n: 2 },
      { d, id: 'p1', e: 'save', n: 1 },
    ]);
    await onRequest({ request: post(JSON.stringify(batch)), env: { EVENTS_DB: db } });
    expect(rows.get(`${d}|mood:rest|tap`)!.n).toBe(4);
  });

  it('refuses what validate.ts refuses (coordinates, too large) and other methods, all no-store', async () => {
    const { db, rows } = fakeD1();
    const env = { EVENTS_DB: db };
    const bad = await onRequest({ request: post(JSON.stringify([{ e: 'save', id: 'p1', d: '2026-10-03', lat: 33.5 }])), env });
    expect(bad.status).toBe(400);
    const big = await onRequest({ request: post('x'.repeat(9000)), env });
    expect(big.status).toBe(413);
    const get = await onRequest({ request: new Request('https://x.test/api/events'), env });
    expect(get.status).toBe(405);
    for (const r of [bad, big, get]) expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(rows.size).toBe(0);
  });

  it('no D1 binding: 503, not a crash', async () => {
    expect((await onRequest({ request: post('[]'), env: {} })).status).toBe(503);
  });
});

describe('GET /api/events/health', () => {
  it('{ last24h }: yesterday and today (Seoul) only, a count and nothing else', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-03T03:00:00Z')); // 12:00 KST
    try {
      const { db } = fakeD1();
      const store = d1Store(db);
      await store.increment('2026-10-01', 'p1', 'save', 5);
      await store.increment('2026-10-02', 'p1', 'save', 2);
      await store.increment('2026-10-03', 'mood:rest', 'tap', 3);
      const res = await health({ env: { EVENTS_DB: db } });
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(await res.json()).toEqual({ last24h: 5 });
      expect(await countSince(db, '2026-10-01')).toBe(10);
    } finally {
      vi.useRealTimers();
    }
  });

  it('no D1 binding: 503 JSON', async () => {
    const res = await health({ env: {} });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'no store' });
  });
});
