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
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
  });

  it('an API error or a network failure is 204, never a stale list', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ RESULT: { CODE: 'INFO-100' } }), { status: 200 }));
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
