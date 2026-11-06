// U4 받는 쪽 (specs/usage-events.md, ADR-0061): the collector refuses what it does not know and counts the
// rest exactly; the aggregate turns the counters into review/popularity.json rows.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aggregate } from '../events/aggregate';
import { BROWSE_IDS, FLOW_IDS, START_IDS, handleEvents } from '../events/handler';
import { memoryStore, type CounterStore } from '../events/store';
import { MAX_EVENTS, eventProblem, parseBatch } from '../events/validate';
import { addDays } from '../src/dates';
import { BUSAN } from '../src/release';
import { contextOf, type UsageEvent } from '../src/track';

const ID = 'e654312a-2a40-45cd-9464-a83756bac0fa';
const ID2 = 'ec5de537-0e1a-4503-b1e8-338822d5ab3c';
const d = '2026-09-30';
const base = { range: '30', basis: 'here', dated: false, d } as const;
/** with the switch on, the context says the destination too (specs/busan.md 7); a Jeju-only build sends what it did */
const DEST = BUSAN ? ({ dest: 'jeju' } as const) : {};
/** what sendBeacon sends: a string body, so its length is said (F11); `init.headers` add to or override these */
const post = (body: unknown, init: RequestInit = {}) => {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const headers = { 'content-type': 'text/plain;charset=UTF-8', 'content-length': String(new TextEncoder().encode(text).length), ...(init.headers as Record<string, string>) };
  return new Request('https://events.test/e', { method: 'POST', body: text, ...init, headers });
};
/** the collector on the day `d` in Jeju (F7: an event's day is within one of the server's) */
const handle = (req: Request, store: CounterStore) => handleEvents(req, store, () => new Date(`${d}T12:00:00+09:00`));

describe('U4 받는 쪽 — 검증', () => {
  it('accepts what the app sends: tap, shown, save, unsave, map, book, with an area basis and food sub', async () => {
    const ctx = contextOf({ view: 'cards', mood: 'food', sub: 'cafe', newSub: 'mix', reach: 'walk', basis: 'region', region: '애월', when: '2026-10-01', today: d });
    expect(ctx).toEqual({ mood: 'food', sub: 'cafe', range: 'walk', basis: 'area', area: '애월', dated: true, ...DEST, d });
    const batch: UsageEvent[] = [{ e: 'tap', ...ctx }, ...(['shown', 'save', 'unsave', 'map', 'book'] as const).map((e) => ({ e, id: ID, ...ctx }))];
    expect(parseBatch(JSON.stringify(batch))).toEqual({ ok: true, events: batch });
    const res = await handle(post(batch), memoryStore());
    expect(res.status).toBe(204);
  });

  it('accepts a famous tap, counted under mood:famous (ADR-0092)', async () => {
    const ctx = contextOf({ view: 'cards', mood: 'famous', sub: 'meal', newSub: 'mix', reach: 'drive30', basis: 'gps', region: null, when: 'now', today: d });
    expect(ctx).toEqual({ mood: 'famous', ...base, ...DEST });
    expect(parseBatch(JSON.stringify([{ e: 'tap', ...ctx }]))).toEqual({ ok: true, events: [{ e: 'tap', ...ctx }] });
    const store = memoryStore();
    expect((await handle(post([{ e: 'tap', ...ctx }]), store)).status).toBe(204);
  });

  it.each(['mix', 'sight', 'do'] as const)('accepts 새로운 거 tab sub %s (ADR-0064)', (newSub) => {
    const ctx = contextOf({ view: 'cards', mood: 'new', sub: 'meal', newSub, reach: 'drive30', basis: 'gps', region: null, when: 'now', today: d });
    expect(ctx).toEqual({ mood: 'new', sub: newSub, ...base, ...DEST });
    const batch: UsageEvent[] = [{ e: 'tap', ...ctx }, { e: 'shown', id: ID, ...ctx }];
    expect(parseBatch(JSON.stringify(batch))).toEqual({ ok: true, events: batch });
  });

  it('accepts 비 와요 (ADR-0065): indoor true when it is on, and nothing when it is off', () => {
    const on = contextOf({ view: 'cards', mood: 'rest', sub: 'meal', newSub: 'mix', reach: 'drive30', basis: 'gps', region: null, when: 'now', today: d, indoor: true });
    expect(on).toEqual({ mood: 'rest', ...base, indoor: true, ...DEST });
    expect(contextOf({ view: 'cards', mood: 'rest', sub: 'meal', newSub: 'mix', reach: 'drive30', basis: 'gps', region: null, when: 'now', today: d, indoor: false })).toEqual({ mood: 'rest', ...base, ...DEST });
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
    ['a sub on famous (ADR-0092: no tabs)', [{ e: 'tap', mood: 'famous', sub: 'mix', d }], 400],
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
    const res = await handle(post(body), store);
    expect(res.status).toBe(status);
    expect(await store.dump()).toEqual([]);
  });

  it('only POST; a declared body over 8 KB is refused before it is read', async () => {
    const store = memoryStore();
    expect((await handle(new Request('https://events.test/e'), store)).status).toBe(405);
    const big = post([{ e: 'map', id: ID, d }], { headers: { 'content-length': String(9000) } });
    expect((await handle(big, store)).status).toBe(413);
    expect(await store.dump()).toEqual([]);
  });

  it('50 events is still one batch', async () => {
    const body = Array.from({ length: MAX_EVENTS }, () => ({ e: 'shown', id: ID, ...base }));
    expect(JSON.stringify(body).length).toBeLessThan(8 * 1024);
    const store = memoryStore();
    expect((await handle(post(body), store)).status).toBe(204);
    expect(await store.dump()).toEqual([{ d, id: ID, e: 'shown', n: MAX_EVENTS }]);
  });
});

describe('U4 받는 쪽 — 카운터', () => {
  it('(day, place, event) counters add up exactly across batches; a mood tap counts under mood:<mood>', async () => {
    const store = memoryStore();
    const day2 = '2026-10-01';
    await handle(post([{ e: 'shown', id: ID, ...base }, { e: 'shown', id: ID2, ...base }, { e: 'save', id: ID, ...base }, { e: 'tap', mood: 'rest', ...base }]), store);
    await handle(post([{ e: 'shown', id: ID, ...base }, { e: 'map', id: ID, ...base }, { e: 'shown', id: ID, ...base, d: day2 }, { e: 'tap', mood: 'rest', ...base }]), store);
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
    expect((await handle(req, store)).status).toBe(204);
    expect(JSON.stringify(await store.dump())).not.toMatch(/UA-SECRET|203\.0\.113\.9|COOKIE/);
    expect(readFileSync(resolve(__dirname, '../events/handler.ts'), 'utf8')).not.toMatch(/user-agent|x-forwarded-for|cf-connecting-ip|headers\.get\((?!'content-length')/i);
  });
});

// 출시 전 점검 F7 (idempotency-security.md S1): one event dated 2099 kept the daily 「0건」 check (ADR-0078 2) quiet for good
describe('출시 전 점검 F7 (S1): the day must be within one of the collector\'s Jeju day', () => {
  it.each([
    ['yesterday', addDays(d, -1), 204],
    ['today', d, 204],
    ['tomorrow (a phone clock a little ahead at midnight)', addDays(d, 1), 204],
    ['two days ahead', addDays(d, 2), 400],
    ['two days back', addDays(d, -2), 400],
    ['2099', '2099-12-31', 400],
    ['year 1', '0001-01-01', 400],
  ])('%s: %s → %i', async (_, day, status) => {
    const store = memoryStore();
    expect((await handle(post([{ e: 'tap', mood: 'rest', d }, { e: 'tap', mood: 'rest', d: day }]), store)).status).toBe(status);
    expect((await store.dump()).length > 0).toBe(status === 204);
  });

  it('parseBatch without a day to hold it to is as before (the app\'s own checks)', () => {
    expect(parseBatch(JSON.stringify([{ e: 'tap', mood: 'rest', d: '2099-12-31' }])).ok).toBe(true);
    expect(parseBatch(JSON.stringify([{ e: 'tap', mood: 'rest', d: '2099-12-31' }]), d)).toMatchObject({ ok: false, status: 400 });
  });
});

// 출시 전 점검 F11 (idempotency-security.md S3): without a length the whole body was read into memory first
describe('출시 전 점검 F11 (S3): no more than 8 KB is read, with or without a length', () => {
  /** a body of `size` bytes as a stream, counting what has been read of it */
  function stream(size: number) {
    const read = { n: 0 };
    const chunk = new Uint8Array(4096).fill(0x20);
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        if (read.n >= size) return c.close();
        read.n += chunk.byteLength;
        c.enqueue(chunk);
      },
    });
    return { body, read };
  }

  it('no content-length (chunked) and too long: reading stops past 8 KB → 413, nothing counted', async () => {
    const store = memoryStore();
    const s = stream(1024 * 1024);
    const req = new Request('https://events.test/e', { method: 'POST', body: s.body, duplex: 'half' } as RequestInit);
    expect((await handle(req, store)).status).toBe(413);
    expect(s.read.n).toBeLessThanOrEqual(8 * 1024 + 2 * 4096);
    expect(await store.dump()).toEqual([]);
  });

  it('no content-length but a valid batch: still counted (a beacon must never be lost for a missing header)', async () => {
    const store = memoryStore();
    const text = JSON.stringify([{ e: 'tap', mood: 'rest', d }]);
    const bytes = new TextEncoder().encode(text);
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close(); } });
    const req = new Request('https://events.test/e', { method: 'POST', body, duplex: 'half' } as RequestInit);
    expect(req.headers.get('content-length')).toBeNull();
    expect((await handle(req, store)).status).toBe(204);
    expect(await store.dump()).toHaveLength(1);
  });

  it('a length that understates the body: reading stops past 8 KB → 413', async () => {
    const store = memoryStore();
    const s = stream(1024 * 1024);
    const req = new Request('https://events.test/e', { method: 'POST', body: s.body, duplex: 'half', headers: { 'content-length': '100' } } as RequestInit);
    expect((await handle(req, store)).status).toBe(413);
    expect(s.read.n).toBeLessThanOrEqual(8 * 1024 + 2 * 4096);
  });

  it('what the app sends (a beacon: a string with its length) is taken as before', async () => {
    const store = memoryStore();
    expect((await handle(post([{ e: 'tap', mood: 'rest', ...base }]), store)).status).toBe(204);
    expect(await store.dump()).toEqual([{ d, id: 'mood:rest', e: 'tap', n: 1 }]);
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
    const res = await handle(post([{ e: 'open', ...base }, bad]), store);
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
    await handle(
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

describe('가 봤어요 (ADR-0087, specs/hide-visited.md S5)', () => {
  it('visited / unvisited: accepted with a place id and the usual context, counted under (day, id, event)', async () => {
    const batch: UsageEvent[] = [
      { e: 'visited', id: ID, mood: 'walk', ...base },
      { e: 'unvisited', id: ID, ...base },
      { e: 'visited', id: ID2, ...base },
    ];
    expect(parseBatch(JSON.stringify(batch))).toEqual({ ok: true, events: batch });
    const store = memoryStore();
    expect((await handle(post(batch), store)).status).toBe(204);
    expect((await store.dump()).sort((a, b) => (a.id + a.e < b.id + b.e ? -1 : 1))).toEqual([
      { d, id: ID, e: 'unvisited', n: 1 },
      { d, id: ID, e: 'visited', n: 1 },
      { d, id: ID2, e: 'visited', n: 1 },
    ]);
  });
  it.each([
    ['visited without a place', [{ e: 'visited', d }]],
    ['unvisited without a place', [{ e: 'unvisited', ...base }]],
    ['season on visited', [{ e: 'visited', id: ID, d, season: 'rapeseed' }]],
    ['an unknown name still refused', [{ e: 'visit', id: ID, d }]],
    ['hidden (the data field) is not an event', [{ e: 'hide', id: ID, d }]],
  ])('refuses %s', (_, body) => {
    expect(parseBatch(JSON.stringify(body)).ok).toBe(false);
  });
  it('not in the popularity: a place only left out gets no row; one also shown keeps its counts as they were', () => {
    expect(
      aggregate([
        { d, id: ID, e: 'visited', n: 4 },
        { d, id: ID, e: 'unvisited', n: 1 },
        { d, id: ID2, e: 'shown', n: 3 },
        { d, id: ID2, e: 'visited', n: 2 },
      ]),
    ).toEqual([{ id: ID2, shown: 3, save: 0, map: 0, book: 0 }]);
  });
});

// 여행지와 시작 화면 (specs/busan.md 7, plans/busan.md S7 M6): the collector takes `dest` and the two 시작 화면 events before
// any app sends them — an older app (no `dest`) and a newer one (with it) both get through the same collector, and a
// value it does not know still refuses the batch whole.
describe('M6 여행지·시작 화면 — 받는 쪽', () => {
  const sorted = (rows: unknown[]) => [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const BS = 'bs-126081';
  /** what this collector took before S7: the same batch must count the same */
  const old: UsageEvent[] = [
    { e: 'tap', mood: 'walk', ...base },
    { e: 'shown', id: ID, mood: 'walk', ...base },
    { e: 'map', id: ID, mood: 'walk', range: '30', basis: 'area', area: '애월', dated: false, d },
    { e: 'open', id: 'src:hotel-a', d },
    { e: 'open', live0: true, ...base },
  ];

  it('an older app’s batch (no dest) is taken and counted as before', async () => {
    const store = memoryStore();
    expect((await handle(post(old), store)).status).toBe(204);
    expect(sorted(await store.dump())).toEqual(
      sorted([
        { d, id: 'mood:walk', e: 'tap', n: 1 },
        { d, id: ID, e: 'shown', n: 1 },
        { d, id: ID, e: 'map', n: 1 },
        { d, id: 'src:hotel-a', e: 'open', n: 1 },
        { d, id: 'open:live0', e: 'open', n: 1 },
      ]),
    );
  });

  it('the same events with dest (jeju or busan) are not refused, and count under the same ids — the place id says its destination', async () => {
    const withDest = old.map((ev) => (ev.id?.startsWith('src:') ? ev : { ...ev, dest: 'jeju' as const }));
    const a = memoryStore();
    const b = memoryStore();
    expect((await handle(post(old), a)).status).toBe(204);
    expect((await handle(post(withDest), b)).status).toBe(204);
    expect(sorted(await b.dump())).toEqual(sorted(await a.dump()));
    const busan: UsageEvent[] = [
      { e: 'tap', mood: 'walk', ...base, dest: 'busan' },
      { e: 'shown', id: BS, mood: 'walk', range: '30', basis: 'area', area: '광안리', dated: false, dest: 'busan', d },
    ];
    const c = memoryStore();
    expect((await handle(post(busan), c)).status).toBe(204);
    expect(sorted(await c.dump())).toEqual(sorted([{ d, id: 'mood:walk', e: 'tap', n: 1 }, { d, id: BS, e: 'shown', n: 1 }]));
  });

  it('the 시작 화면: start_view under start:view, start_done under start:<how>:<why>:<dest>; the ids are a fixed list, none a place', async () => {
    const store = memoryStore();
    const batch: UsageEvent[] = [
      { e: 'start_view', d },
      { e: 'start_view', d },
      { e: 'start_done', how: 'gps', why: 'none', dest: 'busan', d },
      { e: 'start_done', how: 'pick', why: 'denied', dest: 'jeju', d },
    ];
    expect(parseBatch(JSON.stringify(batch))).toEqual({ ok: true, events: batch });
    expect((await handle(post(batch), store)).status).toBe(204);
    const rows = await store.dump();
    expect(sorted(rows)).toEqual(
      sorted([
        { d, id: 'start:view', e: 'start_view', n: 2 },
        { d, id: 'start:gps:none:busan', e: 'start_done', n: 1 },
        { d, id: 'start:pick:denied:jeju', e: 'start_done', n: 1 },
      ]),
    );
    for (const r of rows) expect(START_IDS).toContain(r.id);
    expect(START_IDS).toHaveLength(1 + 2 * 4 * 5);
    expect(aggregate(rows)).toEqual([]);
  });

  it.each([
    ['an unknown destination', [{ e: 'tap', mood: 'walk', ...base, dest: 'daegu' }]],
    ['dest not a string', [{ e: 'map', id: ID, d, dest: 1 }]],
    ['how on another event', [{ e: 'tap', mood: 'walk', ...base, how: 'gps' }]],
    ['why on another event', [{ e: 'map', id: ID, d, why: 'denied' }]],
    ['a place on start_view', [{ e: 'start_view', id: ID, d }]],
    ['context on start_view', [{ e: 'start_view', range: '30', d }]],
    ['dest on start_view', [{ e: 'start_view', dest: 'jeju', d }]],
    ['start_done without dest', [{ e: 'start_done', how: 'gps', why: 'none', d }]],
    ['start_done with an unknown how', [{ e: 'start_done', how: 'ip', why: 'none', dest: 'jeju', d }]],
    ['start_done with an unknown why', [{ e: 'start_done', how: 'pick', why: 'slow', dest: 'jeju', d }]],
    ['a position on start_done', [{ e: 'start_done', how: 'gps', why: 'none', dest: 'busan', d, lat: 35.1 }]],
    ['dest on a 숙소 링크 count', [{ e: 'open', id: 'src:hotel-a', d, dest: 'jeju' }]],
    ['a good event with a bad dest beside it', [{ e: 'start_view', d }, { e: 'map', id: ID, d, dest: 'Jeju' }]],
  ])('refuses %s — and counts nothing', async (_, body) => {
    const store = memoryStore();
    expect((await handle(post(body), store)).status).toBe(400);
    expect(await store.dump()).toEqual([]);
  });
});
// 자동 지역 (plans/nationwide-app.md 7, U1): the collector takes dest nation and the 시군구 code before any app sends them.
// `sgg` only with dest nation and an area basis, a 4–8 digit code; nothing else about where.
describe('U1 자동 지역 — 받는 쪽', () => {
  const NT = 'nt-126508';
  it('takes dest nation, with sgg on an area basis, and counts under the place id as before', async () => {
    const batch = [
      { e: 'tap', mood: 'walk', ...base, dest: 'nation' },
      { e: 'shown', id: NT, mood: 'walk', range: '30', basis: 'area', sgg: '51150', dated: false, dest: 'nation', d },
      { e: 'map', id: NT, range: 'walk', basis: 'here', dated: false, dest: 'nation', d },
      { e: 'start_done', how: 'pick', why: 'outside', dest: 'nation', d },
    ];
    expect(parseBatch(JSON.stringify(batch)).ok).toBe(true);
    const store = memoryStore();
    expect((await handle(post(batch), store)).status).toBe(204);
    const rows = await store.dump();
    expect(rows).toHaveLength(4);
    expect(rows).toContainEqual({ d, id: NT, e: 'shown', n: 1 });
    expect(rows).toContainEqual({ d, id: 'start:pick:outside:nation', e: 'start_done', n: 1 });
    expect(START_IDS).toContain('start:pick:outside:nation');
  });

  it.each([
    ['sgg without dest nation', [{ e: 'shown', id: NT, range: '30', basis: 'area', sgg: '51150', dated: false, dest: 'busan', d }]],
    ['sgg without a dest', [{ e: 'shown', id: NT, range: '30', basis: 'area', sgg: '51150', dated: false, d }]],
    ['sgg on a here basis', [{ e: 'shown', id: NT, ...base, sgg: '51150', dest: 'nation' }]],
    ['sgg too short', [{ e: 'shown', id: NT, range: '30', basis: 'area', sgg: '511', dated: false, dest: 'nation', d }]],
    ['sgg too long', [{ e: 'shown', id: NT, range: '30', basis: 'area', sgg: '511501234', dated: false, dest: 'nation', d }]],
    ['sgg a name', [{ e: 'shown', id: NT, range: '30', basis: 'area', sgg: '강릉시', dated: false, dest: 'nation', d }]],
    ['sgg a number', [{ e: 'shown', id: NT, range: '30', basis: 'area', sgg: 51150, dated: false, dest: 'nation', d }]],
    ['a 시군구 code as area', [{ e: 'shown', id: NT, range: '30', basis: 'area', area: '51150', dated: false, dest: 'nation', d }]],
    ['sgg on start_done', [{ e: 'start_done', how: 'pick', why: 'none', dest: 'nation', sgg: '51150', d }]],
  ])('refuses %s — and counts nothing', async (_, body) => {
    const store = memoryStore();
    expect((await handle(post(body), store)).status).toBe(400);
    expect(await store.dump()).toEqual([]);
  });
});
// 강원 (ADR-0102): the collector takes dest gangwon, and its 동네 (a 시군구) as sgg on an area basis, as the 자동 지역's.
describe('C3 강원 — 받는 쪽', () => {
  const NT = 'nt-2900682';
  it('takes dest gangwon, with sgg on an area basis; start_done under start:<how>:<why>:gangwon', async () => {
    const batch = [
      { e: 'tap', mood: 'rest', ...base, dest: 'gangwon' },
      { e: 'shown', id: NT, mood: 'famous', range: '30', basis: 'area', sgg: '51150', dated: false, dest: 'gangwon', d },
      { e: 'start_done', how: 'pick', why: 'none', dest: 'gangwon', d },
    ];
    expect(parseBatch(JSON.stringify(batch)).ok).toBe(true);
    const store = memoryStore();
    expect((await handle(post(batch), store)).status).toBe(204);
    const rows = await store.dump();
    expect(rows).toContainEqual({ d, id: NT, e: 'shown', n: 1 });
    expect(rows).toContainEqual({ d, id: 'start:pick:none:gangwon', e: 'start_done', n: 1 });
    expect(START_IDS).toContain('start:gps:none:gangwon');
  });
  it.each([
    ['sgg with dest busan', [{ e: 'shown', id: NT, range: '30', basis: 'area', sgg: '51150', dated: false, dest: 'busan', d }]],
    ['a 시군구 code as area', [{ e: 'shown', id: NT, range: '30', basis: 'area', area: '51150', dated: false, dest: 'gangwon', d }]],
    ['dest gangneung', [{ e: 'tap', mood: 'walk', ...base, dest: 'gangneung' }]],
  ])('refuses %s', async (_, body) => {
    const store = memoryStore();
    expect((await handle(post(body), store)).status).toBe(400);
    expect(await store.dump()).toEqual([]);
  });
});

// 오늘 서울 둘러보기 (ADR-0114 7): opened, left (seconds in tens, shelves scrolled, cards pressed), a card, a link. No place,
// no item, no position: each event its own fields only.
describe('오늘 서울 둘러보기 — 받는 쪽', () => {
  const sorted = (rows: unknown[]) => [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  it('counts under browse:*, the ids a fixed list, none a place', async () => {
    const batch: UsageEvent[] = [
      { e: 'browse_open', d },
      { e: 'browse_open', d },
      { e: 'browse_card', d },
      { e: 'browse_link', link: 'go', d },
      { e: 'browse_link', link: 'more', d },
      { e: 'browse_link', link: 'post', d },
      { e: 'browse_done', secs: 45, rows: 2, cards: 1, d },
      { e: 'browse_done', secs: 600, rows: 0, cards: 0, d },
    ];
    expect(parseBatch(JSON.stringify(batch))).toEqual({ ok: true, events: batch });
    const store = memoryStore();
    expect((await handle(post(batch), store)).status).toBe(204);
    const rows = await store.dump();
    expect(sorted(rows)).toEqual(
      sorted([
        { d, id: 'browse:open', e: 'browse_open', n: 2 },
        { d, id: 'browse:card', e: 'browse_card', n: 1 },
        { d, id: 'browse:go', e: 'browse_link', n: 1 },
        { d, id: 'browse:more', e: 'browse_link', n: 1 },
        { d, id: 'browse:post', e: 'browse_link', n: 1 },
        { d, id: 'browse:secs:45', e: 'browse_done', n: 1 },
        { d, id: 'browse:rows:2', e: 'browse_done', n: 1 },
        { d, id: 'browse:cards:1', e: 'browse_done', n: 1 },
        { d, id: 'browse:secs:600', e: 'browse_done', n: 1 },
        { d, id: 'browse:rows:0', e: 'browse_done', n: 1 },
        { d, id: 'browse:cards:0', e: 'browse_done', n: 1 },
      ]),
    );
    for (const r of rows) expect(BROWSE_IDS).toContain(r.id);
    expect(BROWSE_IDS).toHaveLength(5 + 3 + 121 + 11 + 3);
    expect(aggregate(rows)).toEqual([]);
  });

  it('browse_card with its slot (ADR-0124 6): 새로 들어옴·당겨옴·기본 each under its own counter, and browse:card too', async () => {
    const batch: UsageEvent[] = [
      { e: 'browse_card', slot: 'new', d },
      { e: 'browse_card', slot: 'pull', d },
      { e: 'browse_card', slot: 'base', d },
      { e: 'browse_card', slot: 'base', d },
    ];
    expect(parseBatch(JSON.stringify(batch))).toEqual({ ok: true, events: batch });
    const store = memoryStore();
    expect((await handle(post(batch), store)).status).toBe(204);
    const rows = await store.dump();
    expect(sorted(rows)).toEqual(
      sorted([
        { d, id: 'browse:card', e: 'browse_card', n: 4 },
        { d, id: 'browse:card:new', e: 'browse_card', n: 1 },
        { d, id: 'browse:card:pull', e: 'browse_card', n: 1 },
        { d, id: 'browse:card:base', e: 'browse_card', n: 2 },
      ]),
    );
    for (const r of rows) expect(BROWSE_IDS).toContain(r.id);
    expect(aggregate(rows)).toEqual([]);
  });

  it('rows 0 to 10 (up to ten shelves, browse.ts SHELVES): all taken', () => {
    for (let rows = 0; rows <= 10; rows++) expect(eventProblem({ e: 'browse_done', secs: 45, rows, cards: 1, d })).toBeNull();
    expect(BROWSE_IDS).toContain('browse:rows:10');
  });

  it.each([
    ['an item id on browse_card', [{ e: 'browse_card', id: ID, d }]],
    ['a src tag on browse_open', [{ e: 'browse_open', id: 'src:hotel-a', d }]],
    ['context on browse_open', [{ e: 'browse_open', range: '30', d }]],
    ['dest on browse_open', [{ e: 'browse_open', dest: 'seoul', d }]],
    ['a position on browse_card', [{ e: 'browse_card', d, lat: 37.57 }]],
    ['a shelf position on browse_card', [{ e: 'browse_card', d, pos: 3 }]],
    ['an unknown slot on browse_card', [{ e: 'browse_card', slot: 'top', d }]],
    ['a slot on browse_link', [{ e: 'browse_link', link: 'go', slot: 'new', d }]],
    ['a slot on browse_open', [{ e: 'browse_open', slot: 'new', d }]],
    ['a slot on a place event', [{ e: 'shown', id: ID, slot: 'new', d }]],
    ['browse_link without a link', [{ e: 'browse_link', d }]],
    ['browse_link to an unknown link', [{ e: 'browse_link', link: 'book', d }]],
    ['browse_done without secs', [{ e: 'browse_done', rows: 1, cards: 0, d }]],
    ['secs not in fives', [{ e: 'browse_done', secs: 47, rows: 1, cards: 0, d }]],
    ['secs past 600', [{ e: 'browse_done', secs: 610, rows: 1, cards: 0, d }]],
    ['rows past 10 (the shelves there are, browse.ts SHELVES)', [{ e: 'browse_done', secs: 40, rows: 11, cards: 0, d }]],
    ['cards past 2', [{ e: 'browse_done', secs: 40, rows: 1, cards: 3, d }]],
    ['a fraction of rows', [{ e: 'browse_done', secs: 40, rows: 1.5, cards: 0, d }]],
    ['secs as a string', [{ e: 'browse_done', secs: '40', rows: 1, cards: 0, d }]],
    ['secs on another event', [{ e: 'tap', mood: 'walk', ...base, secs: 40 }]],
    ['link on a map count', [{ e: 'map', id: ID, ...base, link: 'go' }]],
  ])('refuses %s, and counts nothing', async (_, body) => {
    const store = memoryStore();
    expect((await handle(post(body), store)).status).toBe(400);
    expect(await store.dump()).toEqual([]);
  });
});
