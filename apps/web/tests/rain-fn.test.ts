// 비 소식 함수 (ADR-0076, plans/home-refresh.md U4): grid, issuance time, POP window, and the handler's answers.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AREAS } from '../src/areas';
import { BUSAN_AREAS } from '../src/busan';
import { parseIndex } from '../src/nation';
import { NATION_GRIDS } from '../functions/_lib/grids';
import { areaBySlug, baseTime, kmaGrid, maxPop } from '../functions/_lib/kma';
import { onRequestGet } from '../functions/api/rain';

/** An instant given as KST wall time. */
const at = (iso: string) => Date.parse(`${iso}+09:00`);

describe('격자 (기상청 LCC)', () => {
  it('the 15 areas map to a pinned grid table, all inside the Jeju part of the grid', () => {
    const table = Object.fromEntries(AREAS.map((a) => [a.slug, Object.values(kmaGrid(a.lat, a.lng)).join(',')]));
    expect(table).toMatchInlineSnapshot(`
      {
        "aewol": "50,37",
        "andeok": "49,33",
        "daejeong": "48,32",
        "gujeju": "53,38",
        "gujwa": "58,38",
        "hallim": "48,36",
        "hangyeong": "47,34",
        "jocheon": "55,38",
        "jungmun": "51,33",
        "namwon": "55,34",
        "pyoseon": "58,35",
        "seogwipo": "53,33",
        "seongsan": "60,37",
        "sinjeju": "52,38",
        "udo": "60,38",
      }
    `);
    for (const a of AREAS) {
      const { nx, ny } = kmaGrid(a.lat, a.lng);
      expect(nx, a.slug).toBeGreaterThanOrEqual(46);
      expect(nx, a.slug).toBeLessThanOrEqual(62);
      expect(ny, a.slug).toBeGreaterThanOrEqual(31);
      expect(ny, a.slug).toBeLessThanOrEqual(41);
    }
  });
  it('the agency\'s published points: 제주시 (제주시청) → (53,38), 서귀포시 → (52,33); 구제주 is in 제주시청\'s cell', () => {
    expect(kmaGrid(33.4996, 126.5312)).toEqual({ nx: 53, ny: 38 });
    expect(kmaGrid(33.2507, 126.5125)).toEqual({ nx: 52, ny: 33 });
    const g = areaBySlug('gujeju')!;
    expect(kmaGrid(g.lat, g.lng)).toEqual({ nx: 53, ny: 38 });
    // 서귀포 시내's centre (올레시장, 126.5338) lies 0.2 cells east of that point's cell: the neighbouring (53,33).
    const s = areaBySlug('seogwipo')!;
    expect(kmaGrid(s.lat, s.lng)).toEqual({ nx: 53, ny: 33 });
  });
});

describe('발표 시각 (KST, +10분부터)', () => {
  it('02:09 → the previous day 2300; 02:10 → 0200; 23:15 → 2300; 01:00 on the 1st → last day of the month', () => {
    expect(baseTime(at('2026-10-03T02:09'))).toEqual({ base_date: '20261002', base_time: '2300' });
    expect(baseTime(at('2026-10-03T02:10'))).toEqual({ base_date: '20261003', base_time: '0200' });
    expect(baseTime(at('2026-10-03T23:15'))).toEqual({ base_date: '20261003', base_time: '2300' });
    expect(baseTime(at('2026-10-03T14:09'))).toEqual({ base_date: '20261003', base_time: '1100' });
    expect(baseTime(at('2026-10-01T01:00'))).toEqual({ base_date: '20260930', base_time: '2300' });
  });
});

const body = (items: unknown[], code = '00') => ({ response: { header: { resultCode: code }, body: { items: { item: items } } } });
const pop = (fcstDate: string, fcstTime: string, v: string | number) => ({ category: 'POP', fcstDate, fcstTime, fcstValue: String(v) });

describe('POP 파싱 — 지금 시간대부터 3시간 안 최댓값', () => {
  const now = at('2026-10-03T14:20');
  it('takes the max over the 14:00…17:00 slots, ignoring other hours and other categories', () => {
    const items = [
      pop('20261003', '1300', 100),
      pop('20261003', '1400', 20),
      pop('20261003', '1600', 70),
      pop('20261003', '1700', 30),
      pop('20261003', '1800', 90),
      { category: 'TMP', fcstDate: '20261003', fcstTime: '1500', fcstValue: '99' },
    ];
    expect(maxPop(body(items), now)).toBe(70);
  });
  it('crosses midnight', () => {
    expect(maxPop(body([pop('20261003', '2300', 10), pop('20261004', '0100', 60)]), at('2026-10-03T23:30'))).toBe(60);
  });
  it('null for a non-OK result, a missing item list, junk values, or no slot in the window', () => {
    expect(maxPop(body([pop('20261003', '1500', 80)], '03'), now)).toBeNull();
    expect(maxPop({ response: { header: { resultCode: '00' }, body: {} } }, now)).toBeNull();
    expect(maxPop(null, now)).toBeNull();
    expect(maxPop(body([pop('20261003', '1500', 'x')]), now)).toBeNull();
    expect(maxPop(body([pop('20261004', '1500', 80)]), now)).toBeNull();
  });
});

describe('onRequestGet', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  const req = (q: string) => new Request(`https://app.test/api/rain${q}`);

  it('a missing or unknown area → 400 (nothing fetched)', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    for (const q of ['', '?area=', '?area=seoul', '?area=애월']) {
      expect((await onRequestGet({ request: req(q), env: { KMA_SERVICE_KEY: 'k' } })).status, q).toBe(400);
    }
    expect(f).not.toHaveBeenCalled();
  });
  it('no key → 204 no-store (nothing fetched)', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const res = await onRequestGet({ request: req('?area=aewol'), env: {} });
    expect(res.status).toBe(204);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-Rain-Reason')).toBe('no-key');
    expect(f).not.toHaveBeenCalled();
  });
  it('upstream success → 200 JSON with edge-only s-maxage=1800 (browsers keep nothing); asks for the area\'s grid and the right issuance', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at('2026-10-03T14:20'));
    const f = vi.fn(async (_u: string) => new Response(JSON.stringify(body([pop('20261003', '1500', 60), pop('20261003', '1600', 30)]))));
    vi.stubGlobal('fetch', f);
    const res = await onRequestGet({ request: req('?area=seogwipo'), env: { KMA_SERVICE_KEY: 'a+b/c==' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=1800');
    expect(await res.json()).toEqual({ area: 'seogwipo', pop: 60, rain: true, base: '202610031400', from: '기상청' });
    const u = new URL(f.mock.calls[0][0]);
    expect(u.origin + u.pathname).toBe('https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      serviceKey: 'a+b/c==', dataType: 'JSON', numOfRows: '1000', pageNo: '1', base_date: '20261003', base_time: '1400', nx: '53', ny: '33',
    });
  });
  it('the 인코딩 key pasted instead of the 디코딩 one is decoded first, so it is not encoded twice', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at('2026-10-03T14:20'));
    const f = vi.fn(async (_u: string) => new Response(JSON.stringify(body([pop('20261003', '1500', 10)]))));
    vi.stubGlobal('fetch', f);
    const res = await onRequestGet({ request: req('?area=aewol'), env: { KMA_SERVICE_KEY: ' a%2Bb%2Fc%3D%3D ' } });
    expect(res.status).toBe(200);
    expect(new URL(f.mock.calls[0][0]).searchParams.get('serviceKey')).toBe('a+b/c==');
  });
  it('upstream error (HTTP error, XML error body, non-OK resultCode, network failure) → 204 no-store, the reason in X-Rain-Reason and never the key', async () => {
    const answers: [() => Promise<Response>, string][] = [
      [async () => new Response('down', { status: 502 }), 'http 502'],
      [
        async () =>
          new Response(JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR', returnAuthMsg: '등록되지 않은 서비스키', returnReasonCode: '30' } } }), { status: 403 }),
        'http 403 gw',
      ],
      [
        async () =>
          new Response('<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>'),
        'gw SERVICE_KEY_IS_NOT_REGISTERED_ERROR',
      ],
      [async () => new Response(JSON.stringify(body([], '03'))), 'result 03 x'],
      [
        async () => {
          throw new TypeError('network');
        },
        'network',
      ],
    ];
    for (const [a, why] of answers) {
      vi.stubGlobal('fetch', vi.fn(a));
      const res = await onRequestGet({ request: req('?area=aewol'), env: { KMA_SERVICE_KEY: 'secret-key' } });
      expect(res.status).toBe(204);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(res.headers.get('X-Rain-Reason'), why).toMatch(new RegExp(`^${why.split(' ').slice(0, 2).join(' ')}`));
      expect([...res.headers].join(' ')).not.toContain('secret-key');
    }
  });
});

describe('부산 12동네 (plans/busan.md S6, B12)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('every Busan slug is taken (no switch in the function), Jeju slugs still resolve to the Jeju areas', () => {
    for (const a of BUSAN_AREAS) expect(areaBySlug(a.slug), a.slug).toBe(a);
    for (const a of AREAS) expect(areaBySlug(a.slug), a.slug).toBe(a);
  });
  it('the grid table: 해운대 is the agency\'s 해운대구 cell (99,75), all inside the Busan part of the grid', () => {
    const table = Object.fromEntries(BUSAN_AREAS.map((a) => [a.slug, Object.values(kmaGrid(a.lat, a.lng)).join(',')]));
    expect(table).toMatchInlineSnapshot(`
      {
        "centum": "99,76",
        "choryang": "97,74",
        "dadaepo": "96,73",
        "dongnae": "98,78",
        "gamcheon": "97,74",
        "gwangalli": "99,75",
        "haeundae": "99,75",
        "nampo": "97,74",
        "seomyeon": "98,75",
        "songjeong": "100,76",
        "yeongdo": "97,74",
        "yongho": "99,74",
      }
    `);
  });
  it('/api/rain?area=haeundae answers (200) or 204, asking for 해운대\'s cell', async () => {
    const f = vi.fn(async (_u: string) => new Response('{"response":{"header":{"resultCode":"03","resultMsg":"NO_DATA"}}}'));
    vi.stubGlobal('fetch', f);
    const res = await onRequestGet({ request: new Request('https://app.test/api/rain?area=haeundae'), env: { KMA_SERVICE_KEY: 'k' } });
    expect(res.status).toBe(204);
    const u = new URL(f.mock.calls[0][0]);
    expect([u.searchParams.get('nx'), u.searchParams.get('ny')]).toEqual(['99', '75']);
  });
});

// 자동 지역 (plans/nationwide-app.md 5, U2): ?grid=<nx>,<ny> asks for one cell; ?area= is as it was, to the byte.
describe('격자로 묻기 ?grid=', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  const req = (q: string) => new Request(`https://app.test/api/rain${q}`);
  const ok = () => vi.fn(async (_u: string) => new Response(JSON.stringify(body([pop('20261003', '1500', 70)]))));
  /** a stand-in for caches.default that records the keys asked for and put */
  const edgeCache = () => {
    const keys: string[] = [];
    const put: [string, Response][] = [];
    vi.stubGlobal('caches', { default: { match: async (r: Request) => (keys.push(r.url), undefined), put: async (r: Request, res: Response) => void put.push([r.url, res]) } });
    return { keys, put };
  };

  it('a 시군구 centre\'s cell (강릉시 93,132) → 200 { grid, pop, rain, base, from }, asking for that cell, cached under g<nx>-<ny>', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at('2026-10-03T14:20'));
    const f = ok();
    vi.stubGlobal('fetch', f);
    const c = edgeCache();
    const res = await onRequestGet({ request: req('?grid=93,132'), env: { KMA_SERVICE_KEY: 'k' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=1800');
    expect(await res.text()).toBe('{"grid":"93,132","pop":70,"rain":true,"base":"202610031400","from":"기상청"}');
    const u = new URL(f.mock.calls[0][0]);
    expect([u.searchParams.get('nx'), u.searchParams.get('ny')]).toEqual(['93', '132']);
    expect(c.keys).toEqual(['https://rain.cache/g93-132/202610031400']);
    expect(c.put.map(([k]) => k)).toEqual(['https://rain.cache/g93-132/202610031400']);
  });

  // predeploy review m-1: only the cells the app sends, its 시군구 centres' (functions/_lib/grids.ts); else 400 and no call
  // on the agency's daily quota
  it('every 시군구 centre\'s cell is asked for; a cell inside the grid that is none of theirs → 400, nothing fetched', async () => {
    const ix = parseIndex(JSON.parse(readFileSync(resolve(__dirname, '../data/nation/index.json'), 'utf8')))!;
    const cells = ix.sgg.map((s) => kmaGrid(s.lat, s.lng));
    expect(cells.every((g) => NATION_GRIDS.has(`${g.nx},${g.ny}`))).toBe(true);
    expect(NATION_GRIDS.size).toBeGreaterThan(150);
    expect(NATION_GRIDS.size).toBeLessThanOrEqual(ix.sgg.length);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at('2026-10-03T14:20'));
    const f = ok();
    vi.stubGlobal('fetch', f);
    for (const g of cells.slice(0, 5)) expect((await onRequestGet({ request: req(`?grid=${g.nx},${g.ny}`), env: { KMA_SERVICE_KEY: 'k' } })).status).toBe(200);
    expect(f).toHaveBeenCalledTimes(5);
    f.mockClear();
    for (const q of ['?grid=1,1', '?grid=149,253', '?grid=53,38', '?grid=60,1']) {
      expect(NATION_GRIDS.has(q.slice(6)), q).toBe(false);
      expect((await onRequestGet({ request: req(q), env: { KMA_SERVICE_KEY: 'k' } })).status, q).toBe(400);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it('a cell outside the grid, a decimal, a negative, a leading zero or junk → 400, nothing fetched', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    for (const q of ['?grid=', '?grid=0,1', '?grid=1,0', '?grid=150,10', '?grid=10,254', '?grid=60.5,127', '?grid=-1,127', '?grid=060,127', '?grid=60', '?grid=60,127,1', '?grid=60%2C127%20', '?grid=a,b', '?grid=33.45,126.57']) {
      expect((await onRequestGet({ request: req(q), env: { KMA_SERVICE_KEY: 'k' } })).status, q).toBe(400);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it('an area wins over a grid; an unknown area with a good grid is still 400', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at('2026-10-03T14:20'));
    const f = ok();
    vi.stubGlobal('fetch', f);
    const res = await onRequestGet({ request: req('?area=seogwipo&grid=92,131'), env: { KMA_SERVICE_KEY: 'k' } });
    expect(await res.json()).toEqual({ area: 'seogwipo', pop: 70, rain: true, base: '202610031400', from: '기상청' });
    const u = new URL(f.mock.calls[0][0]);
    expect([u.searchParams.get('nx'), u.searchParams.get('ny')]).toEqual(['53', '33']);
    for (const q of ['?area=seoul&grid=92,131', '?area=&grid=92,131']) {
      expect((await onRequestGet({ request: req(q), env: { KMA_SERVICE_KEY: 'k' } })).status, q).toBe(400);
    }
  });

  it('the 15 Jeju slugs: the answer, the cell asked for and the cache key are what they were, byte for byte', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at('2026-10-03T14:20'));
    for (const a of AREAS) {
      const f = ok();
      vi.stubGlobal('fetch', f);
      const c = edgeCache();
      const res = await onRequestGet({ request: req(`?area=${a.slug}`), env: { KMA_SERVICE_KEY: 'k' } });
      expect(await res.text(), a.slug).toBe(`{"area":"${a.slug}","pop":70,"rain":true,"base":"202610031400","from":"기상청"}`);
      const { nx, ny } = kmaGrid(a.lat, a.lng);
      const u = new URL(f.mock.calls[0][0]);
      expect([u.searchParams.get('nx'), u.searchParams.get('ny')], a.slug).toEqual([String(nx), String(ny)]);
      expect(c.keys, a.slug).toEqual([`https://rain.cache/${a.slug}/202610031400`]);
    }
  });
});
