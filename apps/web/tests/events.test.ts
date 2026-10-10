// U4 받는 쪽 (specs/usage-events.md, ADR-0061): the collector refuses what it does not know and counts the
// rest exactly; the aggregate turns the counters into review/popularity.json rows.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aggregate } from '../events/aggregate';
import { FLOW_IDS, handleEvents } from '../events/handler';
import { memoryStore } from '../events/store';
import { MAX_EVENTS, parseBatch } from '../events/validate';
import { contextOf, type UsageEvent } from '../src/track';

const ID = 'e654312a-2a40-45cd-9464-a83756bac0fa';
const ID2 = 'ec5de537-0e1a-4503-b1e8-338822d5ab3c';
const d = '2026-09-30';
const base = { range: '30', basis: 'here', dated: false, d } as const;
const post = (body: unknown, init: RequestInit = {}) =>
  new Request('https://events.test/e', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'text/plain;charset=UTF-8' }, ...init });

describe('U4 받는 쪽 — 검증', () => {
  it('accepts what the app sends: tap, shown, save, unsave, map, book, with an area basis and food sub', async () => {
    const ctx = contextOf({ view: 'cards', mood: 'food', sub: 'cafe', newSub: 'mix', reach: 'walk', basis: 'region', region: '애월', when: '2026-10-01', today: d });
    expect(ctx).toEqual({ mood: 'food', sub: 'cafe', range: 'walk', basis: 'area', area: '애월', dated: true, d });
    const batch: UsageEvent[] = [{ e: 'tap', ...ctx }, ...(['shown', 'save', 'unsave', 'map', 'book'] as const).map((e) => ({ e, id: ID, ...ctx }))];
    expect(parseBatch(JSON.stringify(batch))).toEqual({ ok: true, events: batch });
    const res = await handleEvents(post(batch), memoryStore());
    expect(res.status).toBe(204);
  });

  it.each(['mix', 'sight', 'do'] as const)('accepts 새로운 거 tab sub %s (ADR-0064)', (newSub) => {
    const ctx = contextOf({ view: 'cards', mood: 'new', sub: 'meal', newSub, reach: 'drive30', basis: 'gps', region: null, when: 'now', today: d });
    expect(ctx).toEqual({ mood: 'new', sub: newSub, ...base });
    const batch: UsageEvent[] = [{ e: 'tap', ...ctx }, { e: 'shown', id: ID, ...ctx }];
    expect(parseBatch(JSON.stringify(batch))).toEqual({ ok: true, events: batch });
  });

  it('accepts 비 와요 (ADR-0065): indoor true when it is on, and nothing when it is off', () => {
    const on = contextOf({ view: 'cards', mood: 'rest', sub: 'meal', newSub: 'mix', reach: 'drive30', basis: 'gps', region: null, when: 'now', today: d, indoor: true });
    expect(on).toEqual({ mood: 'rest', ...base, indoor: true });
    expect(contextOf({ view: 'cards', mood: 'rest', sub: 'meal', newSub: 'mix', reach: 'drive30', basis: 'gps', region: null, when: 'now', today: d, indoor: false })).toEqual({ mood: 'rest', ...base });
    const batch: UsageEvent[] = [{ e: 'tap', ...on }, { e: 'shown', id: ID, ...on }];
    expect(parseBatch(JSON.stringify(batch))).toEqual({ ok: true, events: batch });
  });

  it('accepts 철 (ADR-0080): season on shown and map, a known kind', () => {
    const batch: UsageEvent[] = [{ e: 'shown', id: ID, d, season: 'rapeseed' }, { e: 'map', id: ID, d, season: 'tangerine' }];
    expect(parseBatch(JSON.stringify(batch))).toEqual({ ok: true, events: batch });
  });

  it.each([
    ['indoor not a boolean', [{ e: 'map', id: ID, d, indoor: 'yes' }], 400],
    ['not JSON', '[{', 400],
    ['an object, not an array', { e: 'map', id: ID, d }, 400],
    ['an empty array', [], 400],
    ['a coordinate field', [{ e: 'map', id: ID, d, lat: 33.5 }], 400],
    ['a user id', [{ e: 'map', id: ID, d, uid: 'x' }], 400],
    ['a time of day', [{ e: 'map', id: ID, d: '2026-09-30T10:00' }], 400],
    ['no day', [{ e: 'map', id: ID }], 400],
    ['an impossible day', [{ e: 'map', id: ID, d: '2026-02-30' }], 400],
    ['an unknown event', [{ e: 'view', id: ID, d }], 400],
    ['a place event without a place', [{ e: 'save', d }], 400],
    ['a malformed place id', [{ e: 'save', id: 'a b/../c', d }], 400],
    ['a tap without a mood', [{ e: 'tap', d }], 400],
    ['a tap with a place', [{ e: 'tap', mood: 'rest', id: ID, d }], 400],
    ['an unknown mood', [{ e: 'tap', mood: 'sleep', d }], 400],
    ['a sub without food', [{ e: 'tap', mood: 'rest', sub: 'cafe', d }], 400],
    ['a food sub on new', [{ e: 'tap', mood: 'new', sub: 'cafe', d }], 400],
    ['a new sub on food', [{ e: 'tap', mood: 'food', sub: 'sight', d }], 400],
    ['a sub without a mood', [{ e: 'map', id: ID, d, sub: 'mix' }], 400],
    ['an unknown range', [{ e: 'map', id: ID, d, range: '90' }], 400],
    ['an unknown basis', [{ e: 'map', id: ID, d, basis: 'gps' }], 400],
    ['an area without an area basis', [{ e: 'map', id: ID, d, basis: 'stay', area: '애월' }], 400],
    ['an unknown area', [{ e: 'map', id: ID, d, basis: 'area', area: '서울' }], 400],
    ['dated not a boolean', [{ e: 'map', id: ID, d, dated: 'yes' }], 400],
    ['an unknown season kind', [{ e: 'map', id: ID, d, season: 'beach' }], 400],
    ['a season on a save', [{ e: 'save', id: ID, d, season: 'rapeseed' }], 400],
    ['one bad event among good ones', [{ e: 'map', id: ID, d }, { e: 'map', id: ID, d, lng: 126 }], 400],
    [`more than ${MAX_EVENTS} events`, Array.from({ length: MAX_EVENTS + 1 }, () => ({ e: 'map', id: ID, d })), 413],
    ['more than 8 KB', `[${' '.repeat(8 * 1024)}]`, 413],
  ])('refuses %s (%#) — and counts nothing', async (_, body, status) => {
    const store = memoryStore();
    const res = await handleEvents(post(body), store);
    expect(res.status).toBe(status);
    expect(await store.dump()).toEqual([]);
  });

  it('only POST; a declared body over 8 KB is refused before it is read', async () => {
    const store = memoryStore();
    expect((await handleEvents(new Request('https://events.test/e'), store)).status).toBe(405);
    const big = post([{ e: 'map', id: ID, d }], { headers: { 'content-length': String(9000) } });
    expect((await handleEvents(big, store)).status).toBe(413);
    expect(await store.dump()).toEqual([]);
  });

  it('50 events is still one batch', async () => {
    const body = Array.from({ length: MAX_EVENTS }, () => ({ e: 'shown', id: ID, ...base }));
    expect(JSON.stringify(body).length).toBeLessThan(8 * 1024);
    const store = memoryStore();
    expect((await handleEvents(post(body), store)).status).toBe(204);
    expect(await store.dump()).toEqual([{ d, id: ID, e: 'shown', n: MAX_EVENTS }]);
  });
});

describe('U4 받는 쪽 — 카운터', () => {
  it('(day, place, event) counters add up exactly across batches; a mood tap counts under mood:<mood>', async () => {
    const store = memoryStore();
    const day2 = '2026-10-01';
    await handleEvents(post([{ e: 'shown', id: ID, ...base }, { e: 'shown', id: ID2, ...base }, { e: 'save', id: ID, ...base }, { e: 'tap', mood: 'rest', ...base }]), store);
    await handleEvents(post([{ e: 'shown', id: ID, ...base }, { e: 'map', id: ID, ...base }, { e: 'shown', id: ID, ...base, d: day2 }, { e: 'tap', mood: 'rest', ...base }]), store);
    const rows = (await store.dump()).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    expect(rows).toEqual(
      [
        { d, id: ID, e: 'shown', n: 2 },
        { d, id: ID2, e: 'shown', n: 1 },
        { d, id: ID, e: 'save', n: 1 },
        { d, id: ID, e: 'map', n: 1 },
        { d: day2, id: ID, e: 'shown', n: 1 },
        { d, id: 'mood:rest', e: 'tap', n: 2 },
        { d, id: 'save:now', e: 'save', n: 1 }, // ADR-0085: the save also counts as dated / now
      ].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    );
  });

  it('nothing from the request but its body is kept: no IP, user agent or cookie in any counter', async () => {
    const store = memoryStore();
    const req = post([{ e: 'map', id: ID, ...base }], { headers: { 'user-agent': 'UA-SECRET', 'x-forwarded-for': '203.0.113.9', cookie: 'c=COOKIE' } });
    expect((await handleEvents(req, store)).status).toBe(204);
    expect(JSON.stringify(await store.dump())).not.toMatch(/UA-SECRET|203\.0\.113\.9|COOKIE/);
    expect(readFileSync(resolve(__dirname, '../events/handler.ts'), 'utf8')).not.toMatch(/user-agent|x-forwarded-for|cf-connecting-ip|headers\.get\((?!'content-length')/i);
  });
});

describe('U4 집계 → review/popularity.json 모양', () => {
  it('{ id, shown, save, map, book } per place over all days; save is net of unsave; mood taps left out', () => {
    expect(
      aggregate([
        { d, id: ID2, e: 'shown', n: 3 },
        { d, id: ID, e: 'shown', n: 2 },
        { d: '2026-10-01', id: ID, e: 'shown', n: 5 },
        { d, id: ID, e: 'save', n: 2 },
        { d, id: ID, e: 'unsave', n: 1 },
        { d, id: ID2, e: 'unsave', n: 1 },
        { d, id: ID, e: 'map', n: 4 },
        { d, id: ID, e: 'book', n: 1 },
        { d, id: 'mood:rest', e: 'tap', n: 9 },
      ]),
    ).toEqual([
      { id: ID, shown: 7, save: 1, map: 4, book: 1 },
      { id: ID2, shown: 3, save: 0, map: 0, book: 0 },
    ]);
  });
});

// 저장 목록 흐름 (ADR-0085, specs/saved-flow-events.md F1·F7)
describe('F1 저장 목록 흐름 — 검사', () => {
  it('accepts open (live0 / past), arrange (each op), map from the saved list (age / past), save as before', () => {
    const batch = [
      { e: 'open', ...base },
      { e: 'open', live0: true, past: true, ...base },
      { e: 'open', past: true, ...base },
      ...(['up', 'down', 'move', 'past'] as const).map((op) => ({ e: 'arrange', op, ...base })),
      { e: 'map', id: ID, from: 'saved', age: 0, ...base },
      { e: 'map', id: ID, from: 'saved', age: 1, past: true, ...base },
      { e: 'map', id: ID, from: 'saved', age: 2, ...base },
      { e: 'map', id: ID, from: 'saved', past: true, ...base }, // no `at` on the row: no age
      { e: 'map', id: ID, ...base },
      { e: 'save', id: ID, ...base, dated: true },
    ];
    expect(parseBatch(JSON.stringify(batch))).toEqual({ ok: true, events: batch });
  });

  it.each([
    ['open with a place', { e: 'open', id: ID, d }],
    ['arrange with a place', { e: 'arrange', op: 'up', id: ID, d }],
    ['arrange without op', { e: 'arrange', d }],
    ['an unknown op', { e: 'arrange', op: 'sort', d }],
    ['op on open', { e: 'open', op: 'up', d }],
    ['live0 false', { e: 'open', live0: false, d }],
    ['past false', { e: 'open', past: false, d }],
    ['live0 on map', { e: 'map', id: ID, from: 'saved', live0: true, d }],
    ['live0 on arrange', { e: 'arrange', op: 'up', live0: true, d }],
    ['past on arrange', { e: 'arrange', op: 'past', past: true, d }],
    ['from on save', { e: 'save', id: ID, from: 'saved', d }],
    ['from on open', { e: 'open', from: 'saved', d }],
    ['an unknown from', { e: 'map', id: ID, from: 'card', d }],
    ['age without from', { e: 'map', id: ID, age: 1, d }],
    ['past on a card map', { e: 'map', id: ID, past: true, d }],
    ['age 3', { e: 'map', id: ID, from: 'saved', age: 3, d }],
    ['age as a string', { e: 'map', id: ID, from: 'saved', age: '1', d }],
    ['age on save', { e: 'save', id: ID, age: 0, d }],
    ['past on shown', { e: 'shown', id: ID, past: true, d }],
    ['at (the day saved) itself', { e: 'map', id: ID, from: 'saved', at: d, d }],
  ])('refuses %s — the whole batch', async (_, bad) => {
    const store = memoryStore();
    const res = await handleEvents(post([{ e: 'open', ...base }, bad]), store);
    expect(res.status).toBe(400);
    expect(await store.dump()).toEqual([]);
  });

  it('a time of day ("21:30", an ISO time) gets through no field', () => {
    const good: Record<string, Record<string, unknown>> = {
      tap: { e: 'tap', mood: 'rest', ...base },
      open: { e: 'open', live0: true, past: true, ...base },
      arrange: { e: 'arrange', op: 'up', ...base },
      map: { e: 'map', id: ID, from: 'saved', age: 1, past: true, ...base, season: 'rapeseed', basis: 'area', area: '애월', indoor: true },
    };
    for (const ev of Object.values(good)) expect(parseBatch(JSON.stringify([ev])).ok).toBe(true);
    for (const t of ['21:30', '2026-09-30T21:30:00+09:00', '2026-09-30T12:30:00.000Z']) {
      for (const ev of Object.values(good)) {
        for (const k of [...Object.keys(ev), 'at', 'time', 't']) {
          if (k === 'e') continue;
          expect(parseBatch(JSON.stringify([{ ...ev, [k]: t }])).ok, `${ev.e}.${k} = ${t}`).toBe(false);
        }
      }
    }
  });
});

describe('F7 저장 목록 흐름 — D1 카운터', () => {
  const sorted = (rows: unknown[]) => [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

  it('the added counters go up as in the spec table; the place counters are what they were', async () => {
    const store = memoryStore();
    await handleEvents(
      post([
        { e: 'open', ...base },
        { e: 'open', live0: true, past: true, ...base },
        { e: 'open', live0: true, ...base },
        { e: 'open', past: true, ...base },
        { e: 'arrange', op: 'up', ...base },
        { e: 'arrange', op: 'up', ...base },
        { e: 'arrange', op: 'past', ...base },
        { e: 'map', id: ID, from: 'saved', age: 1, past: true, ...base },
        { e: 'map', id: ID, from: 'saved', ...base },
        { e: 'map', id: ID2, ...base },
        { e: 'save', id: ID, ...base, dated: true },
        { e: 'save', id: ID2, ...base },
      ]),
      store,
    );
    const rows = await store.dump();
    expect(sorted(rows)).toEqual(
      sorted([
        { d, id: 'open', e: 'open', n: 1 },
        { d, id: 'open:live0:past', e: 'open', n: 1 },
        { d, id: 'open:live0', e: 'open', n: 1 },
        { d, id: 'open:past', e: 'open', n: 1 },
        { d, id: 'arrange:up', e: 'arrange', n: 2 },
        { d, id: 'arrange:past', e: 'arrange', n: 1 },
        { d, id: ID, e: 'map', n: 2 },
        { d, id: ID2, e: 'map', n: 1 },
        { d, id: 'saved:a1:p', e: 'map', n: 1 },
        { d, id: 'saved:ax:-', e: 'map', n: 1 },
        { d, id: ID, e: 'save', n: 1 },
        { d, id: ID2, e: 'save', n: 1 },
        { d, id: 'save:dated', e: 'save', n: 1 },
        { d, id: 'save:now', e: 'save', n: 1 },
      ]),
    );
    for (const r of rows) if (r.id !== ID && r.id !== ID2) expect(FLOW_IDS).toContain(r.id);
  });

  it('the added ids are a fixed list of 18 with the four prefixes; none is a place in the aggregate', () => {
    expect(FLOW_IDS).toHaveLength(18);
    for (const id of FLOW_IDS) expect(id).toMatch(/^(open(:|$)|arrange:|saved:|save:)/);
    const counters = [...FLOW_IDS.map((id) => ({ d, id, e: id.startsWith('saved:') ? 'map' : id.startsWith('save:') ? 'save' : 'open', n: 3 })), { d, id: ID, e: 'map', n: 1 }];
    expect(aggregate(counters)).toEqual([{ id: ID, shown: 0, save: 0, map: 1, book: 0 }]);
  });
});

describe('U4 앱 번들 밖', () => {
  it('no app source imports the collector', () => {
    for (const f of ['main.ts', 'app.ts', 'track.ts', 'render.ts', 'state.ts', 'store.ts']) {
      expect(readFileSync(resolve(__dirname, '../src', f), 'utf8'), f).not.toMatch(/from ['"][./]*events\//);
    }
  });
});
