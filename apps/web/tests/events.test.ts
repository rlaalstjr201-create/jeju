// U4 받는 쪽 (specs/usage-events.md, ADR-0061): the collector refuses what it does not know and counts the
// rest exactly; the aggregate turns the counters into review/popularity.json rows.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aggregate } from '../events/aggregate';
import { handleEvents } from '../events/handler';
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

describe('U4 앱 번들 밖', () => {
  it('no app source imports the collector', () => {
    for (const f of ['main.ts', 'app.ts', 'track.ts', 'render.ts', 'state.ts', 'store.ts']) {
      expect(readFileSync(resolve(__dirname, '../src', f), 'utf8'), f).not.toMatch(/from ['"][./]*events\//);
    }
  });
});
