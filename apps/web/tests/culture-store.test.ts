// /api/culture's one copy for every edge (ADR-0129): the day's complete list kept in D1 and read there first; a list cut short
// (KOPIS) never kept; another day's or an old copy never read; D1 failing changes nothing.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet } from '../functions/api/culture';
import type { D1Like, D1Stmt } from '../functions/_lib/events/d1';
import rows from './fixtures/seoul-culture-20261104.json';

interface Row {
  key: string;
  day: string;
  body: string;
  until: number;
}
/** The statements the function sends, over two Maps: the day's lists and the KOPIS details. */
function fakeD1(fail = false): D1Like & { rows: Map<string, Row>; shows: Map<string, { body: string; until: number }>; sql: string[] } {
  const rows = new Map<string, Row>();
  const shows = new Map<string, { body: string; until: number }>();
  const sql: string[] = [];
  return {
    rows,
    shows,
    sql,
    prepare(q: string): D1Stmt {
      sql.push(q.split(' ')[0]);
      let args: unknown[] = [];
      const stmt: D1Stmt = {
        bind: (...v: unknown[]) => ((args = v), stmt),
        async first<T>() {
          if (fail) throw new Error('d1 down');
          return (rows.get(args[0] as string) ?? null) as T | null;
        },
        async run() {
          if (fail) throw new Error('d1 down');
          if (q.includes('kopis_shows')) {
            if (q.startsWith('INSERT')) for (let i = 0; i < args.length; i += 3) shows.set(args[i] as string, { body: args[i + 1] as string, until: args[i + 2] as number });
            if (q.startsWith('DELETE')) for (const [k, r] of shows) if (r.until < (args[0] as number)) shows.delete(k);
            return {};
          }
          if (q.startsWith('INSERT')) rows.set(args[0] as string, { key: args[0] as string, day: args[1] as string, body: args[2] as string, until: args[3] as number });
          if (q.startsWith('DELETE')) for (const [k, r] of rows) if (q.includes('<=') ? r.day <= (args[0] as string) : r.day < (args[0] as string)) rows.delete(k);
          return {};
        },
        async all<T>() {
          if (fail) throw new Error('d1 down');
          const [now, ...ids] = args as [number, ...string[]];
          return { results: ids.filter((id) => (shows.get(id)?.until ?? 0) > now).map((id) => ({ id, body: shows.get(id)!.body })) as T[] };
        },
      };
      return stmt;
    },
  };
}

const dir = resolve(__dirname, 'fixtures/kopis');
const list = readFileSync(resolve(dir, 'list.xml'), 'utf8');
const details = Object.fromEntries(readdirSync(dir).filter((f) => /^(PF|FC)\d+\.xml$/.test(f)).map((f) => [f.slice(0, -4), readFileSync(resolve(dir, f), 'utf8')]));
const BLOCKED = '<HTML><BODY><H1>Request Blocked</H1></BODY></HTML>';
const xml = (body: string) => new Response(body, { status: 200 });
const ok = (path: string) => (path === 'pblprfr' ? xml(list) : details[path.split('/')[1]] ? xml(details[path.split('/')[1]]) : xml('<?xml version="1.0"?><dbs></dbs>'));
const KEY = 'https://culture.cache/seoul/2026-11-04/shows';

const ask = (q: string, db?: D1Like, init?: RequestInit) => ({
  request: new Request(`https://yeochana.com/api/culture${q}`, init),
  env: { SEOUL_OPEN_API_KEY: 'k', KOPIS_API_KEY: 'kk', ...(db ? { EVENTS_DB: db } : {}) },
});
/** fetch: this function's own asks back to it (with `db`: the shows chunks keep their details there), the Seoul list, KOPIS */
function stub(kopis: (path: string) => Response, db?: D1Like) {
  const outside: string[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url.startsWith('https://yeochana.com/')) return onRequestGet(ask(url.slice('https://yeochana.com/api/culture'.length), db, init));
    outside.push(url);
    if (url.startsWith('http://www.kopis.or.kr/')) return kopis(new URL(url).pathname.replace('/openApi/restful/', ''));
    return new Response(JSON.stringify({ culturalEventInfo: { list_total_count: rows.length, row: rows } }), { status: 200 });
  });
  return outside;
}
const at = (iso: string) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('/api/culture kept in D1 (ADR-0129)', () => {
  it('a complete list is kept until KST midnight, and another edge reads it there without asking anyone', async () => {
    at('2026-11-04T05:00:00Z'); // 14:00 KST: 10 hours to midnight
    const db = fakeD1();
    stub(ok);
    const first = await onRequestGet(ask('?city=seoul', db));
    expect(first.status).toBe(200);
    const kept = db.rows.get(KEY)!;
    expect(kept.day).toBe('2026-11-04');
    expect(kept.until).toBe(Date.parse('2026-11-04T15:00:00Z'));
    // another edge, an hour on: D1 answers, nothing is asked
    at('2026-11-04T06:00:00Z');
    const outside = stub(ok);
    const second = await onRequestGet(ask('?city=seoul', db));
    expect(outside).toEqual([]);
    expect(second.status).toBe(200);
    expect(await second.text()).toBe(kept.body);
    expect(second.headers.get('Cache-Control')).toBe(`public, max-age=300, s-maxage=${9 * 3600}`);
    expect(second.headers.get('Content-Type')).toMatch(/application\/json/);
  });

  it('a list cut short (KOPIS blocked) is not kept: the next edge builds it again', async () => {
    at('2026-11-04T05:00:00Z');
    const db = fakeD1();
    stub(() => new Response(BLOCKED, { status: 400 }));
    const res = await onRequestGet(ask('?city=seoul', db));
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=120, s-maxage=120');
    expect(db.rows.size).toBe(0);
  });

  it('a copy past its time is never read; days 7 and more back are deleted', async () => {
    at('2026-11-04T05:00:00Z');
    const db = fakeD1();
    db.rows.set(KEY, { key: KEY, day: '2026-11-04', body: '{"stale":true}', until: Date.parse('2026-11-04T04:00:00Z') });
    db.rows.set('https://culture.cache/seoul/2026-11-03/shows', { key: 'https://culture.cache/seoul/2026-11-03/shows', day: '2026-11-03', body: '{}', until: Date.parse('2026-11-05T00:00:00Z') });
    db.rows.set('old', { key: 'old', day: '2026-10-28', body: '{}', until: 0 });
    const outside = stub(ok);
    const res = await onRequestGet(ask('?city=seoul', db));
    expect(outside.length).toBeGreaterThan(0);
    expect(await res.text()).not.toMatch(/stale/);
    expect(db.rows.get(KEY)!.body).not.toMatch(/stale/);
    expect(db.rows.has('https://culture.cache/seoul/2026-11-03/shows')).toBe(true);
    expect(db.rows.has('old')).toBe(false);
  });

  it('D1 failing or missing: the list as without it', async () => {
    at('2026-11-04T05:00:00Z');
    stub(ok);
    const down = await onRequestGet(ask('?city=seoul', fakeD1(true)));
    expect(down.status).toBe(200);
    const none = await onRequestGet(ask('?city=seoul'));
    expect(none.status).toBe(200);
  });

  it('a preview build (*.pages.dev) neither reads nor keeps a list in D1 (review m2)', async () => {
    at('2026-11-04T05:00:00Z');
    const db = fakeD1();
    db.rows.set(KEY, { key: KEY, day: '2026-11-04', body: '{"live":true}', until: Date.parse('2026-11-04T15:00:00Z') });
    stub(ok);
    const res = await onRequestGet({ ...ask('?city=seoul', db), request: new Request('https://abc123.yeochana.pages.dev/api/culture?city=seoul') });
    expect(await res.text()).not.toMatch(/live/);
    expect(db.sql).toEqual([]);
  });

  it('KOPIS details are one copy too (Amendment 1): a list cut short at one edge is finished at the next, which asks KOPIS only for the rest', async () => {
    at('2026-11-04T05:00:00Z');
    const db = fakeD1();
    // the first edge: KOPIS blocks after two details
    let n = 0;
    stub((path) => (path === 'pblprfr' || n++ < 2 ? ok(path) : new Response(BLOCKED, { status: 400 })), db);
    const cut = await onRequestGet(ask('?city=seoul', db));
    expect(cut.headers.get('Cache-Control')).toBe('public, max-age=120, s-maxage=120');
    expect(db.rows.size).toBe(0);
    const had = db.shows.size;
    expect(had).toBeGreaterThan(0);
    // another edge: the details already in D1 are not asked again; the list comes complete and is kept
    const outside = stub(ok, db);
    const done = await onRequestGet(ask('?city=seoul', db));
    expect(done.headers.get('Cache-Control')).toMatch(/s-maxage=\d{4,}$/);
    expect(db.rows.has(KEY)).toBe(true);
    const details = outside.filter((u) => /\/pblprfr\/PF/.test(u)).map((u) => u.split('/').pop()!.split('?')[0]);
    for (const id of details) expect([...db.shows.keys()].slice(0, had)).not.toContain(id);
  });

  it('a page ask never touches D1', async () => {
    at('2026-11-04T05:00:00Z');
    const db = fakeD1();
    stub(ok);
    await onRequestGet(ask('?city=seoul&page=1&day=2026-11-04', db));
    expect(db.sql).toEqual([]);
  });
});
