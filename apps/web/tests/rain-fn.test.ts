// 비 소식 함수 (ADR-0076, plans/home-refresh.md U4): grid, issuance time, POP window, and the handler's answers.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AREAS } from '../src/areas';
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
  it('upstream error (HTTP error, XML error body, non-OK resultCode, network failure) → 204 no-store', async () => {
    const answers = [
      async () => new Response('down', { status: 502 }),
      async () => new Response('<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg></cmmMsgHeader></OpenAPI_ServiceResponse>'),
      async () => new Response(JSON.stringify(body([], '03'))),
      async () => {
        throw new TypeError('network');
      },
    ];
    for (const a of answers) {
      vi.stubGlobal('fetch', vi.fn(a));
      const res = await onRequestGet({ request: req('?area=aewol'), env: { KMA_SERVICE_KEY: 'k' } });
      expect(res.status).toBe(204);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    }
  });
});
