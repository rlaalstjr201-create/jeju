// 자동 지역 지역 판정 (plans/nationwide-app.md 1.1, U6): a point goes to its 검수한 곳 by the boundary, else to the 시군구
// of the nearest of the 시군구 points (ADR-0104: a few k-means points of each 시군구's places) within 35 km (부산·제주's left
// out), else an island's 시군구 within 25 km, else nowhere (한국 밖 only where inKorea says so). The index is the shipped one.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { destOf } from '../src/region/busan';
import { DEST } from '../src/region/dest';
import { ISLANDS, SGG_MAX_KM, filesFor, inKorea, parseIndex, regionOf } from '../src/region/nation';
import { NATION, areaOfPoint, loadNation, nationSpots, openAreasOf, released, releasedDestOf, sggOf, sggShort } from '../src/region/release';

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

  // ADR-0102: a 시군구 a 검수한 곳 covers (DEST.gangwon.sgg) is that destination's, and which of them it is; its neighbours
  // stay 자동 지역
  it('강원: 강릉역·정동진·주문진·속초·춘천역·양양·진부(평창) → gangwon, each its 시군구; 동해역·홍천 → their own 시군구', () => {
    const cur = { gangwon: DEST.gangwon.sgg };
    const pts = [[37.7643, 128.8996, '51150'], [37.6907, 129.0344, '51150'], [37.8925, 128.8256, '51150'], [38.2047, 128.5918, '51210'], [37.8846, 127.7166, '51110'], [38.0754, 128.6189, '51830'], [37.6355, 128.5636, '51760']] as const;
    for (const [lat, lng, sgg] of pts) expect(regionOf({ lat, lng }, ix.sgg, destOf, cur)).toEqual({ k: 'dest', dest: 'gangwon', sgg });
    expect(regionOf({ lat: 37.4985, lng: 129.124 }, ix.sgg, destOf, cur)).toEqual({ k: 'auto', sgg: '51170' });
    expect(regionOf({ lat: 37.6971, lng: 127.8888 }, ix.sgg, destOf, cur)).toEqual({ k: 'auto', sgg: '51720' });
  });

  // ADR-0104 (predeploy review 4 m-1): with the median point alone, 평창's 대관령 went to 강릉 and 평창읍 to 영월
  it('넓은 군: 대관령양떼목장·횡계·선자령·평창군청·진부·봉평·월정사 → 평창, 남이섬 → 춘천 (센터 하나일 때는 강릉·영월·가평)', () => {
    const cur = { gangwon: DEST.gangwon.sgg };
    const pts = { 대관령양떼목장: [37.6889, 128.7522], 횡계: [37.6727, 128.7098], 선자령: [37.6955, 128.7552], 평창군청: [37.3707, 128.3903], 진부: [37.6355, 128.5636], 봉평: [37.6134, 128.3609], 월정사: [37.7317, 128.5926] };
    for (const [k, [lat, lng]] of Object.entries(pts)) expect(regionOf({ lat, lng }, ix.sgg, destOf, cur), k).toEqual({ k: 'dest', dest: 'gangwon', sgg: '51760' });
    expect(regionOf({ lat: 37.7911, lng: 127.5254 }, ix.sgg, destOf, cur)).toEqual({ k: 'dest', dest: 'gangwon', sgg: '51110' });
  });

  it('다른 도의 경계 근처: 산정호수 → 포천시, 두물머리 → 양평군, 땅끝마을 → 해남군 (센터 하나일 때는 철원·하남·완도); 문경새재·도담삼봉·노고단·중산리·광한루는 그대로', () => {
    const pts = { 산정호수: [38.0688, 127.3126, '포천시'], 두물머리: [37.5337, 127.3165, '양평군'], 땅끝마을: [34.2988, 126.5269, '해남군'], 문경새재: [36.7631, 128.0768, '문경시'], 도담삼봉: [36.9997, 128.3436, '단양군'], 노고단: [35.2955, 127.5309, '구례군'], 지리산중산리: [35.2829, 127.7336, '산청군'], 광한루: [35.4031, 127.3808, '남원시'] } as const;
    for (const [k, [lat, lng, name]] of Object.entries(pts)) expect(nameOf(at(lat, lng)), k).toBe(name);
  });

  it('시군구 점(ADR-0104): 모든 행에 1~8개, 그 시군구 곳 가운데 자기 시군구로 나오는 몫이 90% 넘음', () => {
    expect(ix.sgg.every((s) => s.a && s.a.length >= 1 && s.a.length <= 8)).toBe(true);
    const places = Object.keys(ix.files).flatMap((f) => JSON.parse(readFileSync(resolve(__dirname, `../data/nation/${f}.json`), 'utf8')) as { lat: number; lng: number; sgg: string }[]);
    const own = places.filter((p) => { const r = at(p.lat, p.lng); return r?.k === 'auto' && r.sgg === p.sgg; }).length;
    expect(own / places.length).toBeGreaterThan(0.9);
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
    // with points (ADR-0104) the nearest point counts, not the median point
    const two = [{ ...one[0], a: [{ lat: 37.0, lng: 128.0 }, north(30)] }, { ...one[0], c: '51760', n: '평창군', lat: north(50).lat, a: [north(50)] }];
    expect(regionOf(north(39), two, () => null)).toEqual({ k: 'auto', sgg: '51150' });
    expect(regionOf(north(46), two, () => null)).toEqual({ k: 'auto', sgg: '51760' });
  });

  it('a 시군구 a 검수한 곳 names (DEST[d].sgg, plans/nationwide-app.md 1.3) is that destination', () => {
    expect(regionOf({ lat: 37.7643, lng: 128.8996 }, ix.sgg, destOf, { busan: ['51150'] })).toEqual({ k: 'dest', dest: 'busan', sgg: '51150' });
  });
});

describe('자동 지역 몫 (src/region/nation-part.ts)', () => {
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
    // 강릉·속초·춘천·양양·평창 are 강원's (ADR-0102 Amendment 2·3·4): its 동네, not the 자동 지역's, and opened with the same
    // part
    expect(openAreasOf('nation')).toHaveLength(ix.sgg.length - 5 - 25); // and 서울's 25 구 (ADR-0106)
    expect(openAreasOf('gangwon').map((a) => [a.name, a.label, a.group])).toEqual([
      ['51110', '춘천시', 'gangwon'],
      ['51150', '강릉시', 'gangwon'],
      ['51210', '속초시', 'gangwon'],
      ['51760', '평창군', 'gangwon'],
      ['51830', '양양군', 'gangwon'],
    ]);
    expect(released('gangwon')).toBe(true);
    expect(releasedDestOf(강릉역)).toBe('gangwon');
    expect(sggOf(강릉역)).toBeNull();
    expect(releasedDestOf(동해역)).toBe('nation');
    expect(sggOf(동해역)).toBe('51170');
    expect(releasedDestOf({ lat: 35.1587, lng: 129.1604 })).toBe('busan');
    // 강원's 동네 of a point is the 시군구 regionOf says (ADR-0104): 횡계 is 평창's though 강릉's centre is nearer
    expect(areaOfPoint({ lat: 37.6727, lng: 128.7098 }, 'gangwon').name).toBe('51760');
    expect(areaOfPoint({ lat: 37.3707, lng: 128.3903 }).name).toBe('51760');
    expect(areaOfPoint(강릉역, 'gangwon').name).toBe('51150');
    expect(sggShort('51150')).toBe('강릉');
    const a = (await nationSpots('51170')) as { id: string; sgg: string }[];
    await nationSpots('51210');
    expect(a.length).toBeGreaterThan(100);
    expect(a.every((x) => x.id.startsWith('nt-'))).toBe(true);
    // 강릉's (속초's, 춘천's, 양양's, 평창's) records in 51.json are left to 강원's own list
    expect(a.some((x) => DEST.gangwon.sgg!.includes(x.sgg))).toBe(false);
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
