// /api/culture (ADR-0112 6): the whole Seoul list read a page at a time, kept rows only, a failure is 204.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { kstDay, onRequestGet, showsSig } from '../functions/api/culture';
import rows from './fixtures/seoul-culture-20261104.json';

const req = (q: string, init?: RequestInit) => ({ request: new Request(`https://yeochana.com/api/culture${q}`, init), env: { SEOUL_OPEN_API_KEY: 'k' } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('/api/culture', () => {
  it('only city=seoul; no key is 204', async () => {
    expect((await onRequestGet(req(''))).status).toBe(400);
    expect((await onRequestGet({ ...req('?city=seoul'), env: {} })).status).toBe(204);
  });

  it('reads every page (1,000 rows a call) and answers today\'s kept items, no position asked', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-04T05:00:00Z')); // 14:00 KST
    const urls: string[] = [];
    // three pages: the fixture's 208 rows padded to a total of 2,500
    vi.stubGlobal('fetch', async (url: string) => {
      // a page's ask goes back through this same function (its own invocation, ADR-0112 Amendment 1)
      if (url.startsWith('https://yeochana.com/')) return onRequestGet(req(url.slice('https://yeochana.com/api/culture'.length)));
      urls.push(url);
      const from = Number(url.split('/').slice(-3)[0]);
      const page = from === 1 ? rows : [];
      return new Response(JSON.stringify({ culturalEventInfo: { list_total_count: 2500, row: page } }), { status: 200 });
    });
    const res = await onRequestGet(req('?city=seoul'));
    expect(res.status).toBe(200);
    expect(urls).toHaveLength(3);
    expect(urls[0]).toMatch(/^http:\/\/openapi\.seoul\.go\.kr:8088\/k\/json\/culturalEventInfo\/1\/1000\/$/);
    expect(urls[2]).toMatch(/\/2001\/3000\/$/);
    const body = (await res.json()) as { day: string; items: unknown[]; from: string };
    expect(body.day).toBe('2026-11-04');
    expect(body.items.length).toBeGreaterThan(80);
    expect(body.items.length).toBeLessThan(130);
    expect(body.from).toMatch(/서울 열린데이터광장/);
    expect(res.headers.get('Cache-Control')).toMatch(/^public, max-age=300, s-maxage=\d+$/);
  });

  it('a page is asked only for today and a page there can be', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-04T05:00:00Z'));
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ culturalEventInfo: { list_total_count: 1, row: rows } }), { status: 200 }));
    expect((await onRequestGet(req('?city=seoul&page=1&day=2026-11-03'))).status).toBe(400);
    expect((await onRequestGet(req('?city=seoul&page=0&day=2026-11-04'))).status).toBe(400);
    expect((await onRequestGet(req('?city=seoul&page=99&day=2026-11-04'))).status).toBe(400);
    const one = await onRequestGet(req('?city=seoul&page=1&day=2026-11-04'));
    expect(one.status).toBe(200);
    const b = (await one.json()) as { total: number; rows: { END_DATE: string }[] };
    expect(b.total).toBe(1);
    expect(b.rows.length).toBeGreaterThan(0);
    expect(b.rows.length).toBeLessThanOrEqual(rows.length);
  });

  it('an API error or a network failure is 204, never a stale list', async () => {
    const self = async (url: string) => (url.startsWith('https://yeochana.com/') ? onRequestGet(req(url.slice('https://yeochana.com/api/culture'.length))) : null);
    vi.stubGlobal('fetch', async (url: string) => (await self(url)) ?? new Response(JSON.stringify({ RESULT: { CODE: 'INFO-100' } }), { status: 200 }));
    const a = await onRequestGet(req('?city=seoul'));
    expect(a.status).toBe(204);
    expect(a.headers.get('X-Culture-Reason')).toMatch(/INFO-100/);
    vi.stubGlobal('fetch', async () => {
      throw new Error('down');
    });
    expect((await onRequestGet(req('?city=seoul'))).status).toBe(204);
  });

  it('the KST day turns at 15:00 UTC', () => {
    expect(kstDay(Date.parse('2026-11-04T14:59:00Z'))).toBe('2026-11-04');
    expect(kstDay(Date.parse('2026-11-04T15:00:00Z'))).toBe('2026-11-05');
  });
});

describe('/api/culture with KOPIS shows (ADR-0113 5)', () => {
  const dir = resolve(__dirname, 'fixtures/kopis');
  const list = readFileSync(resolve(dir, 'list.xml'), 'utf8');
  const details = Object.fromEntries(readdirSync(dir).filter((f) => /^(PF|FC)\d+\.xml$/.test(f)).map((f) => [f.slice(0, -4), readFileSync(resolve(dir, f), 'utf8')]));
  const shows = Object.keys(details).filter((id) => id.startsWith('PF'));
  const kreq = (q: string, init?: RequestInit) => ({ request: new Request(`https://yeochana.com/api/culture${q}`, init), env: { SEOUL_OPEN_API_KEY: 'k', KOPIS_API_KEY: 'kk' } });
  /** A shows ask as the function signs its own (review M1). */
  const signed = async (shows: string, day = '2026-11-04') => kreq(`?city=seoul&shows=${shows}&day=${day}`, { headers: { 'X-Culture-Sig': await showsSig('kk', day, shows) } });
  const BLOCKED = '<HTML><HEAD><TITLE>400 Bad Request</TITLE></HEAD><BODY><H1>Request Blocked</H1></BODY></HTML>';
  const xml = (body: string) => new Response(body, { status: 200 });
  const ok = (path: string) => (path === 'pblprfr' ? xml(list) : details[path.split('/')[1]] ? xml(details[path.split('/')[1]]) : xml('<?xml version="1.0"?><dbs></dbs>'));
  /** fetch: this function's own calls back to it, the Seoul list (one page), KOPIS (`kopis` answers its paths) */
  const stub = (kopis: (path: string) => Response) => {
    const asked: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://yeochana.com/')) return onRequestGet(kreq(url.slice('https://yeochana.com/api/culture'.length), init));
      if (url.startsWith('http://www.kopis.or.kr/')) {
        const path = new URL(url).pathname.replace('/openApi/restful/', '');
        asked.push(path);
        return kopis(path);
      }
      return new Response(JSON.stringify({ culturalEventInfo: { list_total_count: rows.length, row: rows } }), { status: 200 });
    });
    return asked;
  };
  const at14 = () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-04T05:00:00Z'));
  };

  it('the Seoul list and the shows merged: KOPIS asked for the list and each detail only, kept until midnight', async () => {
    at14();
    const asked = stub(ok);
    const res = await onRequestGet(kreq('?city=seoul'));
    expect(res.status).toBe(200);
    const b = (await res.json()) as { items: { id: string }[]; fromShows?: string };
    expect(b.items.filter((i) => i.id.startsWith('kp-')).length).toBeGreaterThan(0);
    expect(b.items.filter((i) => i.id.startsWith('sc-')).length).toBeGreaterThan(80);
    expect(b.fromShows).toBe('(재)예술경영지원센터 공연예술통합전산망(KOPIS)');
    expect(asked[0]).toBe('pblprfr');
    // a venue missing from the table (functions/_lib/kopis-venues.json) is asked too; nothing else
    expect(asked.slice(1).every((p) => /^(pblprfr\/PF|prfplc\/FC)\d+$/.test(p))).toBe(true);
    expect(asked.filter((p) => p.startsWith('pblprfr/'))).toHaveLength(shows.length);
    expect(res.headers.get('Cache-Control')).toMatch(/^public, max-age=300, s-maxage=\d{4,}$/);
  });

  it('KOPIS failing: the Seoul list alone, kept at the edge 10 minutes only', async () => {
    at14();
    stub(() => new Response(BLOCKED, { status: 400 }));
    const res = await onRequestGet(kreq('?city=seoul'));
    expect(res.status).toBe(200);
    const b = (await res.json()) as { items: { id: string }[]; fromShows?: string };
    expect(b.items.length).toBeGreaterThan(80);
    expect(b.items.every((i) => i.id.startsWith('sc-'))).toBe(true);
    expect(b.fromShows).toBeUndefined();
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300, s-maxage=600');
  });

  it('a detail blocked part way: what came, kept 10 minutes', async () => {
    at14();
    let n = 0;
    stub((path) => (path === 'pblprfr' || n++ < 1 ? ok(path) : new Response(BLOCKED, { status: 400 })));
    const res = await onRequestGet(kreq('?city=seoul'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300, s-maxage=600');
  });

  it('no KOPIS key: the Seoul list as before, until midnight', async () => {
    at14();
    const asked = stub(ok);
    const res = await onRequestGet(req('?city=seoul'));
    expect(asked).toEqual([]);
    expect(res.headers.get('Cache-Control')).toMatch(/s-maxage=\d{4,}$/);
  });

  it('shows are asked only for today, the list or a few well-formed ids', async () => {
    at14();
    stub(ok);
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `PF${300000 + i}`).join(',');
    expect((await onRequestGet(kreq('?city=seoul&shows=list&day=2026-11-03'))).status).toBe(400);
    expect((await onRequestGet(kreq('?city=seoul&shows=list'))).status).toBe(400);
    expect((await onRequestGet(kreq(`?city=seoul&shows=${ids(16)}&day=2026-11-04`))).status).toBe(400);
    expect((await onRequestGet(kreq('?city=seoul&shows=PF305348,PF305348&day=2026-11-04'))).status).toBe(400);
    expect((await onRequestGet(kreq('?city=seoul&shows=../prfplc&day=2026-11-04'))).status).toBe(400);
    expect((await onRequestGet(kreq('?city=seoul&shows=&day=2026-11-04'))).status).toBe(400);
    expect((await onRequestGet({ ...kreq('?city=seoul&shows=list&day=2026-11-04'), env: {} })).status).toBe(204);
    // not signed as the function signs its own: refused before any KOPIS call
    expect((await onRequestGet(kreq('?city=seoul&shows=list&day=2026-11-04'))).status).toBe(400);
    expect((await onRequestGet(kreq('?city=seoul&shows=list&day=2026-11-04', { headers: { 'X-Culture-Sig': 'x' } }))).status).toBe(400);
    const l = await onRequestGet(await signed('list'));
    expect(l.status).toBe(200);
    expect(((await l.json()) as { ids: string[] }).ids.length).toBeGreaterThan(2);
    const c = await onRequestGet(await signed(shows.join(',')));
    expect(c.status).toBe(200);
    const cb = (await c.json()) as { items: { id: string }[]; failed: number };
    expect(cb.failed).toBe(0);
    expect(cb.items.length).toBe(shows.length);
  });
});
