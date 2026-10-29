// 자동 지역 지역 판정 (plans/nationwide-app.md 1.1, U6): a point goes to its 검수한 곳 by the boundary, else to the nearest
// 시군구 centre within 35 km (부산·제주's left out), else nowhere (한국 밖). The index is the shipped one.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { destOf } from '../src/busan';
import { SGG_MAX_KM, filesFor, parseIndex, regionOf } from '../src/nation';
import { NATION, loadNation, nationSpots, openAreasOf, released, releasedDestOf, sggOf, sggShort } from '../src/release';

const ix = parseIndex(JSON.parse(readFileSync(resolve(__dirname, '../data/nation/index.json'), 'utf8')))!;
const at = (lat: number, lng: number) => regionOf({ lat, lng }, ix.sgg, destOf);
const nameOf = (r: ReturnType<typeof at>) => (r?.k === 'auto' ? ix.sgg.find((s) => s.c === r.sgg)?.n : r?.k === 'dest' ? r.dest : null);

describe('regionOf', () => {
  it('성산 → 제주; B4: 부산 안 5점 → 부산 (해운대, 김해공항, 가덕도 …), 밖 5점 → their own 시군구', () => {
    expect(at(33.4584, 126.9426)).toEqual({ k: 'dest', dest: 'jeju' });
    const inside = { 해운대해수욕장: [35.1587, 129.1604], 김해국제공항: [35.1795, 128.9382], 가덕도대항: [35.0186, 128.8255], 일광해수욕장: [35.2601, 129.2335], 범어사: [35.2836, 129.0686] };
    for (const [k, [lat, lng]] of Object.entries(inside)) expect(at(lat, lng), k).toEqual({ k: 'dest', dest: 'busan' });
    const outside = { 김해시청: [35.2285, 128.8894, '김해시'], 양산시청: [35.335, 129.0372, '양산시'], 울산시청: [35.5396, 129.3114, '남구'], 창원시청: [35.228, 128.6811, '창원시 성산구'], 거제장승포: [34.8687, 128.7256, '거제시'] } as const;
    for (const [k, [lat, lng, name]] of Object.entries(outside)) expect(nameOf(at(lat, lng)), k).toBe(name);
  });

  it('강릉역 → 강릉시, 울릉도 → 울릉군 (자동 지역)', () => {
    expect(at(37.7643, 128.8996)).toEqual({ k: 'auto', sgg: '51150' });
    expect(at(37.4844, 130.9057)).toEqual({ k: 'auto', sgg: '47940' });
  });

  it('한국 밖은 null: 쓰시마, 도쿄, a broken point', () => {
    expect(at(34.2031, 129.2887)).toBeNull();
    expect(at(35.6812, 139.7671)).toBeNull();
    expect(at(Number.NaN, 127)).toBeNull();
  });

  it(`${SGG_MAX_KM} km from the nearest centre is still in; past it, out. 부산·제주 centres never count`, () => {
    const one = [{ c: '51150', n: '강릉시', s: '51', lat: 37.0, lng: 128.0, f: '51' }];
    const north = (km: number) => ({ lat: 37.0 + km / ((6371 * Math.PI) / 180), lng: 128.0 });
    expect(regionOf(north(34.9), one, () => null)).toEqual({ k: 'auto', sgg: '51150' });
    expect(regionOf(north(35.1), one, () => null)).toBeNull();
    expect(regionOf(north(1), [{ ...one[0], c: '26110' }, { ...one[0], c: '50110' }], () => null)).toBeNull();
  });

  it('a 시군구 a 검수한 곳 names (DEST[d].sgg, plans/nationwide-app.md 1.3) is that destination', () => {
    expect(regionOf({ lat: 37.7643, lng: 128.8996 }, ix.sgg, destOf, { busan: ['51150'] })).toEqual({ k: 'dest', dest: 'busan' });
  });
});

describe('자동 지역 몫 (src/nation-part.ts)', () => {
  const 강릉역 = { lat: 37.7643, lng: 128.8996 };
  afterEach(() => void vi.unstubAllGlobals());

  it.runIf(!NATION)('switch off: never asked for, never open', async () => {
    expect(await loadNation()).toBe(false);
    expect(released('nation')).toBe(false);
    expect(releasedDestOf(강릉역)).toBeNull();
  });

  it.runIf(NATION)('switch on: the index read, the 시군구 open, a point placed, each file asked for once', async () => {
    const asked: string[] = [];
    vi.stubGlobal('fetch', (url: string) => {
      asked.push(url);
      const m = /^\/nation\/(\w+)\.json\?v=\w+$/.exec(url);
      const body = m ? readFileSync(resolve(__dirname, `../data/nation/${m[1]}.json`), 'utf8') : null;
      return Promise.resolve(body ? new Response(body) : new Response('', { status: 404 }));
    });
    expect(released('nation')).toBe(false);
    expect(await loadNation()).toBe(true);
    expect(released('nation')).toBe(true);
    expect(openAreasOf('nation')).toHaveLength(ix.sgg.length);
    expect(releasedDestOf(강릉역)).toBe('nation');
    expect(sggOf(강릉역)).toBe('51150');
    expect(releasedDestOf({ lat: 35.1587, lng: 129.1604 })).toBe('busan');
    expect(sggShort('51150')).toBe('강릉');
    const a = (await nationSpots('51150')) as { id: string; sgg: string }[];
    await nationSpots('51210');
    expect(a.length).toBeGreaterThan(100);
    expect(a.every((x) => x.id.startsWith('nt-'))).toBe(true);
    expect(asked.filter((u) => u.startsWith('/nation/51.json'))).toHaveLength(1);
  });
});

describe('filesFor', () => {
  it('its own file first, then the files of 시군구 within 40 km, 3 at most', () => {
    expect(filesFor('51150', ix.sgg)).toEqual(['51']);
    expect(filesFor('11110', ix.sgg)).toEqual(['11', '41', '28']);
    expect(filesFor('36110', ix.sgg)[0]).toBe('36110');
    expect(filesFor('99999', ix.sgg)).toEqual([]);
  });
});
