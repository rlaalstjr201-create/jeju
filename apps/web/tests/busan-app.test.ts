// @vitest-environment jsdom
// 부산 in the app (plans/busan.md S5, specs/busan.md 1.3·1.4·3.5·5·6, B3·B5·B10·B11): with the switch on only
// (npm run test:busan); the Jeju side of every one of these is the rest of the suite, unchanged.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocateError } from '../src/app';
import { kakaoUrl, naverDirectionsUrl, placeUrl } from '../src/links';
import type { Point, Spot } from '../src/pick';
import { BUSAN } from '../src/release';
import { KEYS, createStore, destKey, parseRegion, parseStay } from '../src/store';
import { fileSpots } from './fixtures';
import { $, $$, cardIds, flush, render, reset, settle, tap } from './harness';

const busanRaw = JSON.parse(readFileSync(resolve(__dirname, '../public/spots-busan.json'), 'utf8')) as Spot[];
const 해운대 = { lat: 35.1587, lng: 129.1604 };
const 동문시장 = { lat: 33.5122, lng: 126.5272 };
const wait = async () => {
  for (let i = 0; i < 4; i++) await flush();
  await settle();
};
function mount(o: { dest?: 'jeju' | 'busan'; at?: Point | 'outside'; storage?: Record<string, unknown>; busan?: Spot[] } = {}) {
  if (o.dest) localStorage.setItem(KEYS.dest, JSON.stringify(o.dest));
  for (const [k, v] of Object.entries(o.storage ?? {})) localStorage.setItem(k, JSON.stringify(v));
  const asked: string[] = [];
  const app = render({
    loadSpots: (d) => (asked.push(d), Promise.resolve(d === 'busan' ? (o.busan ?? busanRaw) : fileSpots)),
    locate: () => (o.at === 'outside' ? Promise.reject(new LocateError('outside')) : Promise.resolve(o.at ?? 동문시장)),
  });
  return { app, asked };
}
const busanIds = () => cardIds().every((id) => id?.startsWith('bs-'));

describe.runIf(BUSAN)('부산 (switch on)', () => {
  beforeEach(() => {
    reset();
    Element.prototype.scrollIntoView ??= () => undefined; // jsdom has no layout
  });
  afterEach(reset);

  it('B3 부산 홈: 여차나:부산, the title, 부산 인기 without a position, 한국관광공사 credit, no 다른 동네 tiles, only the Busan file asked for', async () => {
    const { asked } = mount({ dest: 'busan' });
    await wait();
    expect($('.logo .rg').textContent).toBe(':부산');
    expect(document.title).toBe('여차나:부산 · P를 위한 여행동반자');
    expect($('[data-mood="rest"] .ex').textContent).toMatch(/^부산 인기: /);
    expect($('#homeMore .credit').textContent).toBe('정보·사진: 한국관광공사');
    expect($$('#homeMore a[href^="/jeju/"]')).toEqual([]);
    expect($('#results > .credit').textContent).toBe('정보·사진: 한국관광공사');
    expect(($('#results > .landing') as HTMLElement).hidden).toBe(true);
    expect(asked).toEqual(['busan']);
  });

  it('B3 GPS 해운대: 내 위치 근처, Busan cards; B11 coordinate directions, searches scoped to 부산', async () => {
    mount({ dest: 'busan', at: 해운대 });
    await wait();
    await tap('[data-mood="walk"]');
    await wait();
    expect($('#basis > span').textContent).toBe('내 위치 근처');
    expect(cardIds()).toHaveLength(3);
    expect(busanIds()).toBe(true);
    const spot = busanRaw.find((s) => s.id === cardIds()[0])!;
    expect($('#cards .card .go').getAttribute('href')).toContain(`${spot.lng},${spot.lat}`);
    const noKakao = busanRaw.find((s) => !s.kakaoPlaceId && !/부산/.test(s.name))!;
    for (const url of [placeUrl(noKakao, 'naver'), kakaoUrl(noKakao)]) {
      expect(decodeURIComponent(url)).toContain('부산');
      expect(decodeURIComponent(url)).not.toContain('제주');
    }
    expect(naverDirectionsUrl(noKakao, 'car')).toContain('/directions/');
  });

  it('B5 자동 전환: 제주·내 위치 + a fix in 해운대 → 부산 and the status line; 제주·애월 + 해운대 → stays 제주', async () => {
    const { asked } = mount({ dest: 'jeju', at: 해운대 });
    await wait();
    await tap('[data-mood="walk"]');
    await wait();
    expect($('.logo .rg').textContent).toBe(':부산');
    expect($('#status').textContent).toContain('지금 계신 부산으로 바꿨어요.');
    expect(busanIds()).toBe(true);
    expect(asked).toEqual(['jeju', 'busan']);
    expect(localStorage.getItem(KEYS.dest)).toBe('"busan"');
    reset();
    mount({ dest: 'jeju', at: 해운대, storage: { 'jeju.basis': 'region', 'jeju.region': '애월' } });
    await wait();
    await tap('[data-mood="walk"]');
    await wait();
    expect($('.logo .rg').textContent).toBe(':제주');
    expect(cardIds().some((id) => id?.startsWith('bs-'))).toBe(false);
  });

  it('B5 기준 시트에서 부산을 고르면 지역 고르기와 부산 동네 칸; a GPS read in Jeju does not bring Jeju back', async () => {
    mount({ dest: 'jeju', at: 동문시장 });
    await wait();
    await tap('#basis');
    expect($$('#sheet [data-dest]').map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['제주', 'true'],
      ['부산', 'false'],
    ]);
    await tap('#sheet [data-dest="busan"]');
    await wait();
    expect($('#basis > span').textContent).toBe('지역 고르기');
    expect($$('#sheet [data-area]').map((b) => b.dataset.area)).toEqual(['다대포', '송도·감천', '원도심', '영도', '부산역·초량', '서면', '동래·금정', '오륙도·용호', '광안리', '센텀', '해운대', '송정·기장']);
    await tap('#sheet [data-action="close"].sheet-close');
    await tap('[data-mood="walk"]');
    await wait();
    expect($('.logo .rg').textContent).toBe(':부산');
    expect($('#cards .notice-t').textContent).toBe('지금은 부산 밖이에요.');
    await tap('#cards [data-area="광안리"]');
    await wait();
    expect($('#basis > span').textContent).toBe('광안리 근처');
    expect(busanIds()).toBe(true);
    // each destination keeps its own 동네 (ADR-0097)
    expect([localStorage.getItem('jeju.region.busan'), localStorage.getItem('jeju.basis.busan'), localStorage.getItem('jeju.region')]).toEqual(['"광안리"', '"region"', null]);
  });

  it('B10 부산에 저장한 곳: kept when Jeju is in use, one line under the saved list, which opens Busan’s', async () => {
    mount({ dest: 'busan', at: 해운대 });
    await wait();
    await tap('[data-mood="walk"]');
    await wait();
    const id = cardIds()[0]!;
    await tap($$('#cards .heart')[0]);
    await tap('#basis');
    await tap('#sheet [data-dest="jeju"]');
    await wait();
    expect(localStorage.getItem(KEYS.savedV2)).toContain(id);
    await tap('#sheet .sheet-close');
    await tap('#results .settings');
    await wait();
    const line = $('#savedView [data-action="other-dest"]');
    expect(line.textContent).toBe('부산에 저장한 곳 1곳');
    await tap(line);
    await wait();
    expect($('.logo .rg').textContent).toBe(':부산');
    expect(cardIds()).toEqual([id]);
  });

  it('photo-less Busan places: no photo box from the start (no <img src="">)', async () => {
    mount({ dest: 'busan', at: 해운대, busan: busanRaw.map((s) => ({ ...s, image: '' })) });
    await wait();
    await tap('[data-mood="walk"]');
    await wait();
    expect(cardIds()).toHaveLength(3);
    expect($$('#cards .card img')).toEqual([]);
    expect($$('#cards .card.noimg')).toHaveLength(3);
  });

  it('탭 숨김: a destination with fewer than 3 places for 체험 hides that tab (spec 5절); 3 or more shows it', async () => {
    const few = busanRaw.filter((s) => !(s.mood === 'new' && s.sub === 'do')).concat(busanRaw.filter((s) => s.mood === 'new' && s.sub === 'do' && s.book).slice(0, 2));
    mount({ dest: 'busan', at: 해운대, busan: few });
    await wait();
    await tap('[data-mood="new"]');
    await wait();
    expect(($('[data-sub="do"]') as HTMLElement).hidden).toBe(true);
    expect(($('[data-sub="sight"]') as HTMLElement).hidden).toBe(false);
    reset();
    mount({ dest: 'busan', at: 해운대 });
    await wait();
    await tap('[data-mood="new"]');
    await wait();
    expect(($('[data-sub="do"]') as HTMLElement).hidden).toBe(false);
  });
});

describe('저장소 키 (ADR-0097)', () => {
  beforeEach(reset);
  it('basis, region and 숙소 are kept per destination: Jeju’s keys as before, Busan’s with .busan', () => {
    expect(destKey(KEYS.region, 'jeju')).toBe('jeju.region');
    expect(destKey(KEYS.stay, 'busan')).toBe('jeju.stay.busan');
    const store = createStore(localStorage, sessionStorage);
    store.setRegion('애월');
    store.useDest('busan');
    store.setRegion('해운대');
    store.setBasis('region');
    expect([localStorage.getItem('jeju.region'), localStorage.getItem('jeju.region.busan'), localStorage.getItem('jeju.basis')]).toEqual(['"애월"', '"해운대"', null]);
    store.useDest('jeju');
    expect(store.place()).toEqual({ basis: 'gps', region: '애월', stay: null });
    store.setDest('busan');
    expect(store.dest()).toBe('busan');
  });
  it('a region or 숙소 is its destination’s own (another destination’s reads as none)', () => {
    expect(parseRegion('서귀포', 'jeju')).toBe('서귀포시내');
    expect(parseStay({ ...동문시장, area: '구제주', source: 'gps' }, 'busan')).toBeNull();
    expect(parseStay({ ...해운대, source: 'link' }, 'jeju')).toBeNull();
    if (BUSAN) {
      expect(parseRegion('애월', 'busan')).toBeNull();
      expect(parseRegion('해운대', 'busan')).toBe('해운대');
      expect(parseStay({ ...해운대, source: 'link' }, 'busan')).toEqual({ ...해운대, area: '해운대', source: 'link' });
    }
  });
});
