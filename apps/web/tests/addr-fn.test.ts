// 고른 주소를 공공 주소로 (ADR-0103 Amendment 2): the picked answer's address in (a POST body, from this site only), the
// 행정안전부 도로명주소 API's 검색 then 좌표제공 asked, its address and point out (UTM-K turned into latitude·longitude);
// no keys, or one refused → 503; nothing found → 404.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addrOf, onRequestPost, utmkToWgs84 } from '../functions/api/addr';

describe('addrOf', () => {
  it('folds spaces, drops what the 검색 API refuses; refuses empty, over 80 characters, control characters', () => {
    expect(addrOf('  제주특별자치도 제주시   애월읍 애월해안로 1 ')).toBe('제주특별자치도 제주시 애월읍 애월해안로 1');
    expect(addrOf('애월[1]%=<>')).toBe('애월 1');
    expect(addrOf('가'.repeat(80))).toBe('가'.repeat(80));
    expect(addrOf('가'.repeat(81))).toBeNull();
    expect(addrOf('a\u0000b')).toBeNull();
    expect(addrOf('')).toBeNull();
    expect(addrOf(1)).toBeNull();
  });
});

describe('utmkToWgs84', () => {
  // the other way by proj4 2.11 (+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80)
  it.each([
    [889462.854, 1497445.884, 33.4631, 126.3105], // 애월
    [1151228.323, 1686089.53, 35.1587, 129.1604], // 해운대
    [1096450.576, 2021721.018, 38.1906, 128.6014], // 속초
    [953896.191, 1952009.386, 37.5662952, 126.9779451], // 서울시청
    [729353.11, 1460300.397, 33.1, 124.6], // far west of the central meridian
  ])('(%d, %d) → %d, %d', (x, y, lat, lng) => {
    const p = utmkToWgs84(x, y);
    expect(Math.abs(p.lat - lat)).toBeLessThan(2e-6);
    expect(Math.abs(p.lng - lng)).toBeLessThan(2e-6);
  });
});

describe('onRequestPost', () => {
  afterEach(() => void vi.unstubAllGlobals());
  const KEYS = { JUSO_SEARCH_KEY: ' sk ', JUSO_COORD_KEY: 'ck' };
  const req = (addr: string, h: Record<string, string> = {}) =>
    new Request('https://x.test/api/addr', {
      method: 'POST',
      body: JSON.stringify({ addr }),
      headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', 'CF-Connecting-IP': `t-${Math.random()}`, ...h },
    });
  const ok = (juso: unknown[]) => new Response(JSON.stringify({ results: { common: { errorCode: '0', errorMessage: '정상' }, juso } }));
  const err = (code: string) => new Response(JSON.stringify({ results: { common: { errorCode: code, errorMessage: 'x' }, juso: null } }));
  const FOUND = { roadAddr: '제주특별자치도 제주시 애월읍 애월해안로 1 (애월리)', roadAddrPart1: '제주특별자치도 제주시 애월읍 애월해안로 1', admCd: '5011025021', rnMgtSn: '501104335094', udrtYn: '0', buldMnnm: '1', buldSlno: '0' };
  const AT = { entX: '889462.854', entY: '1497445.884', bdNm: '' };

  it('no keys (either one): 503, nothing asked', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    for (const env of [{}, { JUSO_SEARCH_KEY: 'sk' }, { JUSO_COORD_KEY: 'ck' }]) {
      const res = await onRequestPost({ request: req('애월해안로 1'), env });
      expect([res.status, res.headers.get('X-Geo-Reason'), res.headers.get('Cache-Control')]).toEqual([503, 'no-key', 'no-store']);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it('from another site: 403; bad body: 400; nothing asked', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect((await onRequestPost({ request: req('애월', { 'Sec-Fetch-Site': 'cross-site' }), env: KEYS })).status).toBe(403);
    expect((await onRequestPost({ request: req(''), env: KEYS })).status).toBe(400);
    const raw = new Request('https://x.test/api/addr', { method: 'POST', body: 'addr=애월', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Sec-Fetch-Site': 'same-origin' } });
    expect((await onRequestPost({ request: raw, env: KEYS })).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it('검색 (its key, the address) then 좌표제공 (its key, the codes found): the public address and point, not kept by the browser', async () => {
    const asked: URL[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(new URL(url));
      return url.includes('addrLinkApi') ? ok([FOUND]) : ok([AT]);
    });
    const res = await onRequestPost({ request: req('제주특별자치도 제주시 애월읍 애월해안로 1'), env: KEYS });
    expect([res.status, res.headers.get('Cache-Control')]).toEqual([200, 'no-store']);
    const body = (await res.json()) as { addr: string; lat: number; lng: number };
    expect(body.addr).toBe('제주특별자치도 제주시 애월읍 애월해안로 1');
    expect(Math.abs(body.lat - 33.4631) + Math.abs(body.lng - 126.3105)).toBeLessThan(4e-6);
    expect(asked.map((u) => `${u.origin}${u.pathname}`)).toEqual(['https://business.juso.go.kr/addrlink/addrLinkApi.do', 'https://business.juso.go.kr/addrlink/addrCoordApi.do']);
    expect(Object.fromEntries(asked[0].searchParams)).toEqual({ confmKey: 'sk', currentPage: '1', countPerPage: '1', keyword: '제주특별자치도 제주시 애월읍 애월해안로 1', resultType: 'json' });
    expect(Object.fromEntries(asked[1].searchParams)).toEqual({ confmKey: 'ck', admCd: '5011025021', rnMgtSn: '501104335094', udrtYn: '0', buldMnnm: '1', buldSlno: '0', resultType: 'json' });
  });

  it('nothing found (no juso, a refused word, no point): 404; a key refused (E0001, E0014): 503; a failure: 502', async () => {
    vi.stubGlobal('fetch', async () => ok([]));
    expect((await onRequestPost({ request: req('없는 주소'), env: KEYS })).status).toBe(404);
    vi.stubGlobal('fetch', async () => err('E0006'));
    expect((await onRequestPost({ request: req('애월'), env: KEYS })).status).toBe(404);
    vi.stubGlobal('fetch', async (url: string) => (url.includes('addrLinkApi') ? ok([FOUND]) : ok([{ entX: '', entY: '' }])));
    expect((await onRequestPost({ request: req('애월해안로 1'), env: KEYS })).status).toBe(404);
    for (const code of ['E0001', 'E0014']) {
      vi.stubGlobal('fetch', async () => err(code));
      const res = await onRequestPost({ request: req('애월해안로 1'), env: KEYS });
      expect([res.status, res.headers.get('X-Geo-Reason')]).toEqual([503, `bad-key ${code}`]);
    }
    vi.stubGlobal('fetch', async (url: string) => (url.includes('addrLinkApi') ? ok([FOUND]) : err('E0001')));
    expect((await onRequestPost({ request: req('애월해안로 1'), env: KEYS })).status).toBe(503);
    vi.stubGlobal('fetch', async () => new Response('', { status: 500 }));
    expect((await onRequestPost({ request: req('애월해안로 1'), env: KEYS })).status).toBe(502);
    vi.stubGlobal('fetch', async () => {
      throw new Error('연결 끊김 — network');
    });
    const res = await onRequestPost({ request: req('애월해안로 1'), env: KEYS });
    expect([res.status, res.headers.get('X-Geo-Reason')]).toEqual([502, 'network']);
  });
});
