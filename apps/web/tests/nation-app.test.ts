// @vitest-environment jsdom
// 자동 지역 in the app (plans/nationwide-app.md U9): its 시군구's list, a GPS read that moves there (or to another 시군구),
// the device's choice and a 브라우저로 열기 link. With the switch on only (npm run test:nation); the screens are U10's.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeNation } from '../src/nation';
import type { Point } from '../src/pick';
import { LocateError } from '../src/app';
import { NATION, loadNation, outsideAt } from '../src/release';
import type { OutsideAt } from '../src/types';
import { homeOrigin } from '../src/state';
import { KEYS } from '../src/store';
import { fileSpots } from './fixtures';
import { cardIds, current, flush, render, reset, settle, tap } from './harness';

const file = (f: string) => readFileSync(resolve(__dirname, `../data/nation/${f}.json`), 'utf8');
const raw51 = JSON.parse(file('51')) as unknown;
const 강릉역 = { lat: 37.7643, lng: 128.8996 };
const 속초해수욕장 = { lat: 38.1906, lng: 128.6014 };
const 동문시장 = { lat: 33.5122, lng: 126.5272 };
const wait = async () => {
  for (let i = 0; i < 4; i++) await flush();
  await settle();
};
function mount(o: { dest?: string; sgg?: string; at?: Point; search?: string } = {}) {
  if (o.dest) localStorage.setItem(KEYS.dest, JSON.stringify(o.dest));
  if (o.sgg) localStorage.setItem(KEYS.sgg, JSON.stringify(o.sgg));
  if (o.search) {
    window.history.replaceState(null, '', `/${o.search}`);
    Object.assign(window, { __dest: 'jeju', __destBy: 'link' });
  }
  const asked: string[] = [];
  render({
    loadSpots: (d, sgg) => (asked.push(sgg ? `${d}:${sgg}` : d), Promise.resolve(d === 'nation' ? normalizeNation(raw51, [], sgg) : fileSpots)),
    locate: () => Promise.resolve(o.at ?? 강릉역),
  });
  return { asked };
}
const ntIds = () => cardIds().length > 0 && cardIds().every((id) => id?.startsWith('nt-'));

describe.runIf(NATION)('자동 지역 (switch on)', () => {
  // as main.ts does before the mount where the 자동 지역 is in play (src/release.ts loadNation): the index from the shipped file
  beforeAll(async () => {
    vi.stubGlobal('fetch', (url: string) => {
      const m = /^\/nation\/(\w+)\.json\?v=\w+$/.exec(url);
      return Promise.resolve(m ? { ok: true, json: () => Promise.resolve(JSON.parse(file(m[1]))) } : { ok: false, status: 404 });
    });
    expect(await loadNation()).toBe(true);
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    reset();
    Element.prototype.scrollIntoView ??= () => undefined; // jsdom has no layout
  });
  afterEach(() => {
    reset();
    window.history.replaceState(null, '', '/');
    delete (window as { __dest?: unknown }).__dest;
    delete (window as { __destBy?: unknown }).__destBy;
  });

  it('a device that chose it: its 시군구 (jeju.sgg) list only; 아무거나 → 3 of its places, no 먹기; 쉬기 is 아무거나', async () => {
    const { asked } = mount({ dest: 'nation', sgg: '51150' });
    await wait();
    expect(current().state()).toMatchObject({ dest: 'nation', sgg: '51150' });
    await tap('[data-mood="any"]');
    await wait();
    expect(cardIds()).toHaveLength(3);
    expect(ntIds()).toBe(true);
    const spots = current().state().spots!;
    expect(cardIds().map((id) => spots.find((s) => s.id === id)!.mood)).not.toContain('food');
    await tap('[data-mood="rest"]');
    await wait();
    expect(current().state().mood).toBe('any');
    expect(asked).toEqual(['nation:51150']);
  });

  it('내 위치 not read yet: the home speaks for the kept 시군구 (a weak start), and a position read is still asked for', async () => {
    let reads = 0;
    localStorage.setItem(KEYS.dest, '"nation"');
    localStorage.setItem(KEYS.sgg, '"51150"');
    render({ loadSpots: (_, sgg) => Promise.resolve(normalizeNation(raw51, [], sgg)), locate: () => (reads++, new Promise<Point>(() => undefined)), geoPermission: () => Promise.resolve('granted') });
    await wait();
    expect(homeOrigin(current().state())?.key).toBe('near:51150');
    expect(reads).toBe(1);
  });

  it('GPS in another 시군구 (강릉 → 속초): its list, the 시군구 kept on the device; the same 시군구 again asks nothing more', async () => {
    const { asked } = mount({ dest: 'nation', sgg: '51150', at: 속초해수욕장 });
    await wait();
    await tap('[data-mood="walk"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'nation', sgg: '51210' });
    expect(ntIds()).toBe(true);
    expect(localStorage.getItem(KEYS.sgg)).toBe('"51210"');
    await tap('[data-mood="new"]');
    await wait();
    expect(asked).toEqual(['nation:51150', 'nation:51210']);
  });

  it('제주 device, a GPS read in 강릉: moves to the 자동 지역 (its 시군구), and back to 제주 with a read in Jeju', async () => {
    const at = { p: 강릉역 as Point };
    const asked: string[] = [];
    localStorage.setItem(KEYS.dest, '"jeju"');
    render({ loadSpots: (d, sgg) => (asked.push(sgg ? `${d}:${sgg}` : d), Promise.resolve(d === 'nation' ? normalizeNation(raw51, [], sgg) : fileSpots)), locate: () => Promise.resolve(at.p) });
    await wait();
    await tap('[data-mood="walk"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'nation', sgg: '51150', destNote: 'nation' });
    expect(ntIds()).toBe(true);
    expect([localStorage.getItem(KEYS.dest), localStorage.getItem(KEYS.sgg)]).toEqual(['"nation"', '"51150"']);
    at.p = 동문시장;
    await tap('[data-mood="new"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'jeju', mood: 'new', destNote: 'jeju' });
    expect(cardIds().some((id) => id?.startsWith('nt-'))).toBe(false);
    expect(asked).toEqual(['jeju', 'nation:51150']);
  });

  it('브라우저로 열기 (`dest=nation&area=<시군구>`): that 시군구; a code the index lacks keeps the one on the device', async () => {
    mount({ search: '?dest=nation&area=51210' });
    await wait();
    expect(current().state()).toMatchObject({ dest: 'nation', sgg: '51210' });
    reset();
    mount({ sgg: '51150', search: '?dest=nation&area=99999' });
    await wait();
    expect(current().state()).toMatchObject({ dest: 'nation', sgg: '51150' });
  });

  it('KakaoTalk in the 자동 지역: 브라우저로 열기 hands over its 시군구 (`dest=nation&area=`), which opens it above', async () => {
    localStorage.setItem(KEYS.dest, '"nation"');
    localStorage.setItem(KEYS.sgg, '"51150"');
    render({
      loadSpots: (d, sgg) => Promise.resolve(d === 'nation' ? normalizeNation(raw51, [], sgg) : fileSpots),
      userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 KAKAOTALK 10.8.0',
    });
    await wait();
    const url = new URL(document.querySelector('#homeNote a[data-action="inapp-open"]')!.getAttribute('href')!).searchParams.get('url')!;
    expect(new URL(url).search).toBe('?dest=nation&area=51150');
  });

  // predeploy review M-1·m-2: 「한국 밖」 only outside Korea; a position in Korea with no 시군구 near says nothing about where
  // it is; Jeju's and Busan's own 「~ 밖」 words stay theirs
  const 도쿄 = { lat: 35.6812, lng: 139.7671 };
  const 서해 = { lat: 35.5, lng: 125.5 }; // a boat in the Yellow Sea, ~100 km off 부안: in Korea's wide drawing, no 시군구 near
  const stayErr = async (o: { dest: string; sgg?: string; at: Point }) => {
    reset();
    mount({ dest: o.dest, sgg: o.sgg, at: o.at });
    await wait();
    await tap('#basis');
    await tap('#sheet [data-basis="stay"]');
    await tap('#sheet [data-action="stay-here"]');
    await wait();
    return document.querySelector('#sheet .form-err')!.textContent;
  };
  it('숙소 by GPS: 도쿄 → 한국 밖; 서해 → no data (자동 지역) or 제주 밖 (제주); 강릉 from 제주 → 제주 밖; 동문시장 from the 자동 지역 → 제주에 있어요', async () => {
    expect(outsideAt(도쿄)).toBe('abroad');
    expect(outsideAt(서해)).toBe('nodata');
    expect(await stayErr({ dest: 'nation', sgg: '51150', at: 도쿄 })).toBe('지금은 한국 밖이에요. 아래에서 숙소 동네를 골라 주세요.');
    expect(await stayErr({ dest: 'nation', sgg: '51150', at: 서해 })).toBe('이 근처는 아직 장소 자료가 없어요. 아래에서 숙소 동네를 골라 주세요.');
    expect(await stayErr({ dest: 'jeju', at: 서해 })).toBe('지금은 제주 밖이에요. 아래에서 숙소 동네를 골라 주세요.');
    expect(await stayErr({ dest: 'jeju', at: 강릉역 })).toBe('지금은 제주 밖이에요. 아래에서 숙소 동네를 골라 주세요.');
    expect(await stayErr({ dest: 'jeju', at: 도쿄 })).toBe('지금은 한국 밖이에요. 아래에서 숙소 동네를 골라 주세요.');
    expect(await stayErr({ dest: 'nation', sgg: '51150', at: 동문시장 })).toBe('지금은 제주에 있어요. 아래에서 숙소 동네를 골라 주세요.');
  });

  it('내 위치 outside (main.ts locate: LocateError with where it was): 한국 밖 only abroad; no data in the 자동 지역; 제주 밖 on Jeju', async () => {
    const notice = async (dest: string, at?: OutsideAt) => {
      reset();
      localStorage.setItem(KEYS.dest, JSON.stringify(dest));
      localStorage.setItem(KEYS.sgg, '"51150"');
      render({ loadSpots: (d, sgg) => Promise.resolve(d === 'nation' ? normalizeNation(raw51, [], sgg) : fileSpots), locate: () => Promise.reject(new LocateError('outside', at)) });
      await wait();
      await tap('[data-mood="walk"]');
      await wait();
      return document.querySelector('#cards .notice-t')!.textContent;
    };
    expect(await notice('nation', 'abroad')).toBe('지금은 한국 밖이에요.');
    expect(await notice('nation', 'nodata')).toBe('이 근처는 아직 장소 자료가 없어요.');
    expect(await notice('jeju', 'abroad')).toBe('지금은 한국 밖이에요.');
    expect(await notice('jeju', 'nodata')).toBe('지금은 제주 밖이에요.');
    expect(await notice('jeju')).toBe('지금은 제주 밖이에요.');
  });

  it('nation kept but no 시군구 known: Jeju for this visit, the choice left on the device', async () => {
    const { asked } = mount({ dest: 'nation' });
    await wait();
    expect(current().state().dest).toBe('jeju');
    expect(localStorage.getItem(KEYS.dest)).toBe('"nation"');
    expect(asked).toEqual(['jeju']);
  });
});
