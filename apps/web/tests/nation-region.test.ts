// 자동 지역 지역 판정 (plans/nationwide-app.md 1.1, U6): a point goes to its 검수한 곳 by the boundary, else to the nearest
// 시군구 centre within 35 km (부산·제주's left out), else an island's 시군구 within 25 km, else nowhere (한국 밖 only where
// inKorea says so). The index is the shipped one.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { destOf } from '../src/busan';
import { DEST } from '../src/dest';
import { ISLANDS, SGG_MAX_KM, filesFor, inKorea, parseIndex, regionOf } from '../src/nation';
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

  // ADR-0102: a 시군구 a 검수한 곳 covers (DEST.gangwon.sgg) is that destination's; its neighbours stay 자동 지역
  it('강원: 강릉역·정동진·주문진 → gangwon; 동해역·속초·진부(평창) → their own 시군구', () => {
    const cur = { gangwon: DEST.gangwon.sgg };
    for (const [lat, lng] of [[37.7643, 128.8996], [37.6907, 129.0344], [37.8925, 128.8256]]) expect(regionOf({ lat, lng }, ix.sgg, destOf, cur)).toEqual({ k: 'dest', dest: 'gangwon' });
    expect(regionOf({ lat: 37.4985, lng: 129.124 }, ix.sgg, destOf, cur)).toEqual({ k: 'auto', sgg: '51170' });
    expect(regionOf({ lat: 38.2047, lng: 128.5918 }, ix.sgg, destOf, cur)).toEqual({ k: 'auto', sgg: '51210' });
    expect(regionOf({ lat: 37.6355, lng: 128.5636 }, ix.sgg, destOf, cur)).toEqual({ k: 'auto', sgg: '51760' });
  });

  it('한국 밖은 null: 쓰시마, 도쿄, a broken point', () => {
    expect(at(34.2031, 129.2887)).toBeNull();
    expect(at(35.6812, 139.7671)).toBeNull();
    expect(at(Number.NaN, 127)).toBeNull();
  });

  // predeploy review M-1: islands past 35 km from every centre are their own 시군구's (ISLANDS); 추자도 is Jeju's
  it('섬: 독도 → 울릉군, 백령도·대청도·연평도 → 옹진군, 흑산도·홍도·가거도 → 신안군, 거문도 → 여수시, 추자도 → 제주', () => {
    const isles = {
      독도: [37.2417, 131.8647, '울릉군'],
      백령도: [37.9665, 124.6766, '옹진군'],
      대청도: [37.83, 124.71, '옹진군'],
      연평도: [37.6667, 125.6983, '옹진군'],
      흑산도: [34.6838, 125.436, '신안군'],
      홍도: [34.68, 125.19, '신안군'],
      가거도: [34.0727, 125.115, '신안군'],
      거문도: [34.029, 127.309, '여수시'],
      어청도: [36.1197, 125.9787, '군산시'],
      여서도: [33.988, 126.923, '완도군'],
    } as const;
    for (const [k, [lat, lng, name]] of Object.entries(isles)) expect(nameOf(at(lat, lng)), k).toBe(name);
    expect(at(33.9612, 126.2985)).toEqual({ k: 'dest', dest: 'jeju' }); // 추자도 (상추자)
    expect(at(33.1182, 126.2669)).toEqual({ k: 'dest', dest: 'jeju' }); // 마라도
    // an island's point is tried only where no centre is near: the mainland is as it was
    expect(nameOf(at(37.4844, 130.9057))).toBe('울릉군');
    expect(ISLANDS.every((i) => ix.sgg.some((s) => s.c === i.c))).toBe(true);
  });

  it('inKorea (drawn wide): every 시군구 centre, every 자동 지역 place, Jeju\'s and Busan\'s places and the islands are in; 쓰시마, 후쿠오카, 도쿄, 베이징, 상하이, 블라디보스토크 are not', () => {
    const korea = { 독도: [37.2417, 131.8647], 울릉도: [37.4844, 130.9057], 백령도: [37.9665, 124.6766], 연평도: [37.6667, 125.6983], 가거도: [34.0727, 125.115], 마라도: [33.1182, 126.2669], 거문도: [34.029, 127.309], 추자도: [33.9612, 126.2985], 서울시청: [37.5663, 126.9779], 우도: [33.5, 126.95] };
    for (const [k, [lat, lng]] of Object.entries(korea)) expect(inKorea({ lat, lng }), k).toBe(true);
    const abroad = { 쓰시마: [34.2031, 129.2887], 후쿠오카: [33.5902, 130.4017], 도쿄: [35.6812, 139.7671], 베이징: [39.9042, 116.4074], 상하이: [31.2304, 121.4737], 블라디보스토크: [43.1155, 131.8855], 오키: [36.2, 133.3] };
    for (const [k, [lat, lng]] of Object.entries(abroad)) expect(inKorea({ lat, lng }), k).toBe(false);
    expect(inKorea({ lat: Number.NaN, lng: 127 })).toBe(false);
    expect(ix.sgg.filter((s) => !inKorea(s)).map((s) => s.n)).toEqual([]);
    const places = Object.keys(ix.files).flatMap((f) => JSON.parse(readFileSync(resolve(__dirname, `../data/nation/${f}.json`), 'utf8')) as { id: string; lat: number; lng: number }[]);
    expect(places.length).toBeGreaterThan(1000);
    expect(places.filter((s) => !inKorea(s)).map((s) => s.id)).toEqual([]);
    for (const f of ['spots.json', 'spots-busan.json']) {
      const list = JSON.parse(readFileSync(resolve(__dirname, `../public/${f}`), 'utf8')) as { id: string; lat: number; lng: number }[];
      expect(list.filter((s) => !inKorea(s)).map((s) => s.id), f).toEqual([]);
    }
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
  const 동해역 = { lat: 37.4985, lng: 129.124 };
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
    // 강릉 is 강원's (ADR-0102): its 동네, not the 자동 지역's, and opened with the same part
    expect(openAreasOf('nation')).toHaveLength(ix.sgg.length - 1);
    expect(openAreasOf('gangwon').map((a) => [a.name, a.label, a.group])).toEqual([['51150', '강릉시', 'gangwon']]);
    expect(released('gangwon')).toBe(true);
    expect(releasedDestOf(강릉역)).toBe('gangwon');
    expect(sggOf(강릉역)).toBeNull();
    expect(releasedDestOf(동해역)).toBe('nation');
    expect(sggOf(동해역)).toBe('51170');
    expect(releasedDestOf({ lat: 35.1587, lng: 129.1604 })).toBe('busan');
    expect(sggShort('51150')).toBe('강릉');
    const a = (await nationSpots('51170')) as { id: string; sgg: string }[];
    await nationSpots('51210');
    expect(a.length).toBeGreaterThan(100);
    expect(a.every((x) => x.id.startsWith('nt-'))).toBe(true);
    // 강릉's records in 51.json are left to 강원's own list
    expect(a.some((x) => x.sgg === '51150')).toBe(false);
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
