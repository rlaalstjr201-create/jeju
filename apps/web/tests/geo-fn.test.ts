// 주소·숙소 검색 함수 (ADR-0103): the words in (a POST body, from this site only), Kakao's two answers out as at most 6 hits
// inside Korea; no key, or one Kakao refuses → 503.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hitsOf, limited, onRequestPost, queryOf, sameSite } from '../functions/api/geo';

const ADDRESS = {
  documents: [
    { address_name: '제주특별자치도 제주시 애월읍 애월리 1', x: '126.3105', y: '33.4631', road_address: { address_name: '제주특별자치도 제주시 애월읍 애월해안로 1', building_name: '애월 게스트하우스' } },
    { address_name: '강원특별자치도 속초시 조양동 1', x: '128.6014', y: '38.1906', road_address: null },
  ],
};
const KEYWORD = {
  documents: [
    { place_name: '애월 게스트하우스', address_name: '제주시 애월읍 애월리 1', road_address_name: '제주시 애월읍 애월해안로 1', x: '126.31051', y: '33.46312' }, // the same point again
    { place_name: '먼 곳', address_name: '어딘가', x: '139.7', y: '35.6' }, // outside Korea
    { place_name: '속초해수욕장', address_name: '강원 속초시 조양동', road_address_name: '', x: '128.6014', y: '38.1880' },
  ],
};

describe('queryOf', () => {
  it('folds spaces; refuses empty, over 40 characters, control characters', () => {
    expect(queryOf('  애월   해안로 ')).toBe('애월 해안로');
    expect(queryOf('')).toBeNull();
    expect(queryOf(null)).toBeNull();
    expect(queryOf('가'.repeat(40))).toBe('가'.repeat(40));
    expect(queryOf('가'.repeat(41))).toBeNull();
    expect(queryOf('a\u0000b')).toBeNull();
    expect(queryOf(42)).toBeNull();
  });
});

describe('sameSite', () => {
  const at = (h: Record<string, string>) => new Request('https://yeochana.com/api/geo', { method: 'POST', headers: h });
  it('Sec-Fetch-Site same-origin; without it an Origin of this site; without that a Referer of it; nothing else', () => {
    expect(sameSite(at({ 'Sec-Fetch-Site': 'same-origin' }))).toBe(true);
    expect(sameSite(at({ 'Sec-Fetch-Site': 'cross-site', Origin: 'https://yeochana.com' }))).toBe(false);
    expect(sameSite(at({ 'Sec-Fetch-Site': 'same-site' }))).toBe(false);
    expect(sameSite(at({ 'Sec-Fetch-Site': 'none' }))).toBe(false);
    expect(sameSite(at({ Origin: 'https://yeochana.com' }))).toBe(true);
    expect(sameSite(at({ Origin: 'https://evil.example' }))).toBe(false);
    expect(sameSite(at({ Referer: 'https://yeochana.com/?d=1' }))).toBe(true);
    expect(sameSite(at({ Referer: 'https://evil.example/' }))).toBe(false);
    expect(sameSite(at({}))).toBe(false);
  });
});

describe('hitsOf', () => {
  it('addresses first (building name, else the address), then places; inside Korea, one per point, 6 at most', () => {
    expect(hitsOf(ADDRESS, KEYWORD)).toEqual([
      { name: '애월 게스트하우스', addr: '제주특별자치도 제주시 애월읍 애월해안로 1', lat: 33.4631, lng: 126.3105 },
      { name: '강원특별자치도 속초시 조양동 1', addr: '', lat: 38.1906, lng: 128.6014 },
      { name: '속초해수욕장', addr: '강원 속초시 조양동', lat: 38.188, lng: 128.6014 },
    ]);
    const many = { documents: Array.from({ length: 10 }, (_, i) => ({ place_name: `곳 ${i}`, address_name: 'x', x: String(126.5 + i / 100), y: '33.5' })) };
    expect(hitsOf(null, many)).toHaveLength(6);
    expect(hitsOf({ documents: 'nope' }, undefined)).toEqual([]);
  });
});

describe('limited', () => {
  it('20 a minute per address, then 429 until the minute is over', () => {
    const t = 1_000_000;
    for (let i = 0; i < 20; i++) expect(limited('ip-a', t + i)).toBe(false);
    expect(limited('ip-a', t + 21)).toBe(true);
    expect(limited('ip-b', t + 21)).toBe(false);
    expect(limited('ip-a', t + 60_000)).toBe(false);
  });
});

describe('onRequestPost', () => {
  afterEach(() => void vi.unstubAllGlobals());
  const req = (q: string, h: Record<string, string> = {}) =>
    new Request('https://x.test/api/geo', {
      method: 'POST',
      body: JSON.stringify({ q }),
      headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', 'CF-Connecting-IP': `t-${Math.random()}`, ...h },
    });

  it('no key: 503, nothing asked', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const res = await onRequestPost({ request: req('애월'), env: {} });
    expect(res.status).toBe(503);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(f).not.toHaveBeenCalled();
  });

  it('from another site: 403, nothing asked', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const res = await onRequestPost({ request: req('애월', { 'Sec-Fetch-Site': 'cross-site' }), env: { KAKAO_REST_API_KEY: 'k' } });
    expect([res.status, res.headers.get('X-Geo-Reason')]).toEqual([403, 'cross-site']);
    expect(f).not.toHaveBeenCalled();
  });

  it('bad words: 400 (not JSON, no q)', async () => {
    const raw = (body: string, type = 'application/json') => new Request('https://x.test/api/geo', { method: 'POST', body, headers: { 'Content-Type': type, 'Sec-Fetch-Site': 'same-origin' } });
    expect((await onRequestPost({ request: raw('q=애월', 'application/x-www-form-urlencoded'), env: { KAKAO_REST_API_KEY: 'k' } })).status).toBe(400);
    expect((await onRequestPost({ request: raw('{'), env: { KAKAO_REST_API_KEY: 'k' } })).status).toBe(400);
    expect((await onRequestPost({ request: raw('{}'), env: { KAKAO_REST_API_KEY: 'k' } })).status).toBe(400);
    expect((await onRequestPost({ request: req(''), env: { KAKAO_REST_API_KEY: 'k' } })).status).toBe(400);
    expect((await onRequestPost({ request: req('가'.repeat(41)), env: { KAKAO_REST_API_KEY: 'k' } })).status).toBe(400);
  });

  it('asks both searches with the key in the header and only the words, answers the hits, not kept by the browser', async () => {
    const asked: { url: string; auth: string | null }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      asked.push({ url, auth: new Headers(init.headers).get('Authorization') });
      return new Response(JSON.stringify(url.includes('address') ? ADDRESS : KEYWORD), { status: 200 });
    });
    const res = await onRequestPost({ request: req('애월 해안로'), env: { KAKAO_REST_API_KEY: ' secret ' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(((await res.json()) as { hits: unknown[] }).hits).toHaveLength(3);
    expect(asked.map((a) => a.auth)).toEqual(['KakaoAK secret', 'KakaoAK secret']);
    expect(asked.map((a) => new URL(a.url).searchParams.get('query'))).toEqual(['애월 해안로', '애월 해안로']);
    expect(asked.every((a) => !a.url.includes('secret'))).toBe(true);
  });

  it('a key Kakao refuses (401/403): 503, as no key; the reason header ASCII only', async () => {
    for (const status of [401, 403]) {
      vi.stubGlobal('fetch', async () => new Response('', { status }));
      const res = await onRequestPost({ request: req('애월'), env: { KAKAO_REST_API_KEY: 'k' } });
      expect([res.status, res.headers.get('X-Geo-Reason')]).toEqual([503, `bad-key ${status}`]);
    }
    vi.stubGlobal('fetch', async () => {
      throw new Error('연결 끊김 \u2014 network');
    });
    const res = await onRequestPost({ request: req('애월'), env: { KAKAO_REST_API_KEY: 'k' } });
    expect([res.status, res.headers.get('X-Geo-Reason')]).toEqual([502, 'network']);
  });

  it('both searches failing: 502; one failing: the other one answers', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 500 }));
    expect((await onRequestPost({ request: req('애월'), env: { KAKAO_REST_API_KEY: 'k' } })).status).toBe(502);
    vi.stubGlobal('fetch', async (url: string) => (url.includes('address') ? new Response('', { status: 500 }) : new Response(JSON.stringify(KEYWORD))));
    const res = await onRequestPost({ request: req('애월'), env: { KAKAO_REST_API_KEY: 'k' } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { hits: { name: string }[] }).hits.map((h) => h.name)).toEqual(['애월 게스트하우스', '속초해수욕장']);
  });
  // 카카오 로컬은 실시간으로만 (데브톡 FAQ): the same words asked twice are asked of Kakao twice, nothing kept at the edge
  it('never kept: the same words asked again go to Kakao again; no edge cache touched', async () => {
    const put = vi.fn(async () => undefined);
    const match = vi.fn(async () => undefined);
    vi.stubGlobal('caches', { default: { match, put } });
    const f = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('address') ? ADDRESS : KEYWORD)));
    vi.stubGlobal('fetch', f);
    for (let i = 0; i < 2; i++) expect((await onRequestPost({ request: req('애월'), env: { KAKAO_REST_API_KEY: 'k' } })).status).toBe(200);
    expect(f).toHaveBeenCalledTimes(4);
    expect([put, match].map((m) => m.mock.calls.length)).toEqual([0, 0]);
  });
});
