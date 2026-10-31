// 자동 지역's 오늘 판 and map links (plans/nationwide-app.md 5, U12·U13): 비 소식 by the 시군구 centre's KMA grid (no point
// of the device leaves it), the sun at that centre without a basis, and a map search scoped by the 시군구's short name.
// Switch on only (npm run test:nation).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { kmaGrid } from '../functions/_lib/kma';
import { fetchRain, type Fetch } from '../src/effects';
import { sunPoint } from '../src/home';
import { kakaoUrl, naverSearchUrl } from '../src/links';
import type { Spot } from '../src/pick';
import { NATION, loadNation } from '../src/release';

const file = (f: string) => readFileSync(resolve(__dirname, `../data/nation/${f}.json`), 'utf8');
const 강릉시 = { lat: 37.77063, lng: 128.89712 }; // the index's centre of 51150
const spot = (name: string, sgg: string, p = 강릉시) => ({ id: 'nt-1', name, reason: '', mood: 'walk', lat: p.lat, lng: p.lng, sgg }) as unknown as Spot;

describe.runIf(NATION)('자동 지역: 오늘 판 and map links (switch on)', () => {
  beforeAll(async () => {
    vi.stubGlobal('fetch', (url: string) => {
      const m = /^\/nation\/(\w+)\.json\?v=\w+$/.exec(url);
      return Promise.resolve(m ? { ok: true, json: () => Promise.resolve(JSON.parse(file(m[1]))) } : { ok: false, status: 404 });
    });
    expect(await loadNation()).toBe(true);
    vi.unstubAllGlobals();
  });

  it('비 소식 for a 시군구 asks by the grid of its centre; a 동네 slug as before', async () => {
    const urls: string[] = [];
    const f: Fetch = async (url) => (urls.push(url), { ok: true, status: 200, json: async () => ({ rain: true }) });
    expect(await fetchRain('51150', f)).toBe(true);
    expect(await fetchRain('aewol', f)).toBe(true);
    const g = kmaGrid(강릉시.lat, 강릉시.lng);
    expect(urls).toEqual([`/api/rain?grid=${g.nx},${g.ny}`, '/api/rain?area=aewol']);
    // a code the index lacks: nothing asked
    expect(await fetchRain('99999', f)).toBeNull();
    expect(urls).toHaveLength(2);
  });

  it('the sun without a basis: the 시군구 centre, else 서울시청', () => {
    expect(sunPoint(null, 'nation', '51150')).toEqual(강릉시);
    expect(sunPoint(null, 'nation', null)).toEqual({ lat: 37.5663, lng: 126.9779 });
    expect(sunPoint({ key: 'x', point: { lat: 1, lng: 2 }, isPoint: true, from: '' }, 'nation', '51150')).toEqual({ lat: 1, lng: 2 });
  });

  it("a map search is scoped by the 시군구's short name, unless the name already says it", () => {
    expect(decodeURIComponent(kakaoUrl(spot('경포해변', '51150')))).toBe('https://map.kakao.com/link/search/강릉 경포해변');
    expect(decodeURIComponent(naverSearchUrl(spot('강릉 중앙시장', '51150')))).toBe('https://map.naver.com/p/search/강릉 중앙시장');
    // 서울 중구: the 구 is what the name would say
    expect(decodeURIComponent(naverSearchUrl(spot('명동성당', '11140', { lat: 37.5633, lng: 126.9873 })))).toBe('https://map.naver.com/p/search/명동성당 서울 중구');
  });
});
