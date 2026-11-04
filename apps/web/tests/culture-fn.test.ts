// /api/culture (ADR-0112 6): the whole Seoul list read a page at a time, kept rows only, a failure is 204.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { kstDay, onRequestGet } from '../functions/api/culture';
import rows from './fixtures/seoul-culture-20261104.json';

const req = (q: string) => ({ request: new Request(`https://yeochana.com/api/culture${q}`), env: { SEOUL_OPEN_API_KEY: 'k' } });

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
