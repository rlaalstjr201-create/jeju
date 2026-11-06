// @vitest-environment jsdom
// 강원 (ADR-0102, plans/nationwide-app.md 1.3): 강릉·속초·춘천 (Amendment 2)·양양 (Amendment 3)·평창 (Amendment 4) are a
// 검수한 곳 now — a GPS read there, the 인기 칸, a device that had one as the 자동 지역 and the 기준 시트 all open `gangwon` at
// that 시군구, with that 시군구's own list (reasons, all five moods) and name, while the other 강원 시군구 (홍천 …) stay 자동
// 지역. With the switch on only (npm run test:nation).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeSpots } from '../src/pick/data';
import { DEST } from '../src/region/dest';
import { apply } from '../src/i18n/apply';
import { EN } from '../src/i18n/en';
import { normalizeNation } from '../src/region/nation';
import type { Point, Spot } from '../src/pick/pick';
import { LocateError } from '../src/effects';
import { NATION, loadNation } from '../src/region/release';
import { rainArea } from '../src/state';
import { KEYS, createStore, destKey } from '../src/store';
import { contextOf } from '../src/usage/track';
import { fileSpots } from './fixtures';
import { $, $$, cardIds, current, flush, render, reset, settle, tap, destSide } from './harness';

const nationFile = (f: string) => readFileSync(resolve(__dirname, `../data/nation/${f}.json`), 'utf8');
const gangwonRaw = JSON.parse(readFileSync(resolve(__dirname, '../data/gangwon/spots-gangwon.json'), 'utf8')) as Record<string, unknown>[];
const 강릉역 = { lat: 37.7643, lng: 128.8996 };
const 속초해수욕장 = { lat: 38.1906, lng: 128.6014 };
const 춘천역 = { lat: 37.8846, lng: 127.7166 };
const 양양시외버스터미널 = { lat: 38.0754, lng: 128.6189 };
const 진부 = { lat: 37.6355, lng: 128.5636 }; // 평창
const 홍천 = { lat: 37.6971, lng: 127.8888 };
const 서울시청 = { lat: 37.5663, lng: 126.9779 };
const SGG_KEY = 'jeju.sgg.gangwon';
const wait = async () => {
  for (let i = 0; i < 4; i++) await flush();
  await settle();
};
function mount(o: { dest?: string; sgg?: string; at?: Point; granted?: boolean; userAgent?: string } = {}) {
  if (o.dest) localStorage.setItem(KEYS.dest, JSON.stringify(o.dest));
  if (o.sgg) localStorage.setItem(KEYS.sgg, JSON.stringify(o.sgg));
  const asked: string[] = [];
  render({
    ...(o.granted ? { geoPermission: () => Promise.resolve('granted' as const) } : {}),
    ...(o.userAgent ? { userAgent: o.userAgent } : {}),
    loadSpots: (d, sgg) => {
      asked.push(sgg ? `${d}:${sgg}` : d);
      // the 자동 지역's list as nation-part gives it: 강릉's records left to 강원
      return Promise.resolve(d === 'nation' ? normalizeNation(JSON.parse(nationFile('51')), DEST.gangwon.sgg, sgg) : d === 'gangwon' ? gangwonRaw : fileSpots);
    },
    locate: () => Promise.resolve(o.at ?? 강릉역),
  });
  return { asked };
}
const byId = (id: string | null | undefined) => normalizeSpots(gangwonRaw).find((s) => s.id === id) as (Spot & { area?: string }) | undefined;
/** the 시군구 each of the list in use is (its `area`) */
const areasInUse = () => [...new Set((current().state().spots ?? []).map((s) => (s as { area?: string }).area))];

describe.runIf(NATION)('강원 (switch on)', () => {
  beforeAll(async () => {
    vi.stubGlobal('fetch', (url: string) => {
      const m = /^\/nation\/(\w+)\.json\?v=\w+$/.exec(url);
      return Promise.resolve(m ? { ok: true, json: () => Promise.resolve(JSON.parse(nationFile(m[1]))) } : { ok: false, status: 404 });
    });
    expect(await loadNation()).toBe(true);
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    reset();
    Element.prototype.scrollIntoView ??= () => undefined;
  });
  afterEach(() => reset());

  it('제주 device, a GPS read in 강릉: moves to 강원 (its own list, not the 자동 지역), 여차나:강릉, kept on the device', async () => {
    const { asked } = mount({ dest: 'jeju', at: 강릉역 });
    await wait();
    await tap('[data-mood="walk"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', destNote: 'gangwon', basis: 'gps' });
    expect($('.logo .rg').textContent).toBe(':강릉');
    expect(document.title).toBe('여차나:강릉 · P를 위한 여행동반자');
    expect(localStorage.getItem(KEYS.dest)).toBe('"gangwon"');
    expect(asked).toEqual(['jeju', 'gangwon:51150']);
    expect(cardIds()).toHaveLength(3);
    expect(cardIds().every((id) => byId(id)?.area === '강릉')).toBe(true);
    expect(areasInUse()).toEqual(['강릉']);
  });

  it('on screen: all five moods (쉬기·유명한 데 too); each card has its reason; the usual #how; credit 한국관광공사; no 둘러보기', async () => {
    mount({ dest: 'gangwon', at: 강릉역 });
    await wait();
    const hidden = (m: string) => $(`[data-mood="${m}"]`).closest('li')!.hidden;
    expect(['rest', 'walk', 'new', 'famous', 'food'].map(hidden)).toEqual([false, false, false, false, false]);
    for (const m of ['rest', 'famous']) {
      await tap(`[data-mood="${m}"]`);
      await wait();
      expect(current().state().mood).toBe(m);
      expect(cardIds()).toHaveLength(3);
      const reasons = $$('#cards .reason').map((r) => r.textContent ?? '');
      expect(reasons).toHaveLength(3);
      expect(reasons.every((r) => r.length > 0)).toBe(true);
      expect(cardIds().map((id) => byId(id)!.reason.replace(/\s+/g, ' ').trim())).toEqual(reasons.map((r) => r.replace(/\s+/g, ' ').trim()));
      if (m === 'famous') expect(cardIds().every((id) => byId(id)!.famous)).toBe(true);
      expect($('#how').textContent).not.toContain('공공 데이터');
      expect($('#results > .credit').textContent).toBe('정보·사진: 한국관광공사');
      expect($('#results > .landing').hidden).toBe(true);
      await tap('#back');
      await wait();
    }
  });

  it('a device that had 강릉 as the 자동 지역 (jeju.dest nation, jeju.sgg 51150): opens 강원, and keeps it', async () => {
    const { asked } = mount({ dest: 'nation', sgg: '51150', at: 강릉역 });
    await wait();
    expect(current().state().dest).toBe('gangwon');
    expect(localStorage.getItem(KEYS.dest)).toBe('"gangwon"');
    expect(asked).toEqual(['gangwon:51150']);
  });

  it('Amendment 2: a device that had 속초 as the 자동 지역 (jeju.sgg 51210): opens 강원 at 속초, its list only, kept for 강원; the 자동 지역\'s key left as it was', async () => {
    const { asked } = mount({ dest: 'nation', sgg: '51210', at: 속초해수욕장 });
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', sgg: '51210' });
    expect($('.logo .rg').textContent).toBe(':속초');
    expect(document.title).toBe('여차나:속초 · P를 위한 여행동반자');
    expect(localStorage.getItem(KEYS.dest)).toBe('"gangwon"');
    expect(localStorage.getItem(SGG_KEY)).toBe('"51210"');
    expect(localStorage.getItem(KEYS.sgg)).toBe('"51210"');
    expect(asked).toEqual(['gangwon:51210']);
    expect(areasInUse()).toEqual(['속초']);
  });

  it('Amendment 2: a 강원 device opens at the 시군구 kept for it (춘천): 여차나:춘천, 「춘천 인기:」, its list, 비 소식 and sun at 춘천', async () => {
    localStorage.setItem(SGG_KEY, '"51110"');
    const { asked } = mount({ dest: 'gangwon', at: 춘천역 });
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', sgg: '51110', basis: 'gps' });
    expect($('.logo .rg').textContent).toBe(':춘천');
    expect(document.title).toBe('여차나:춘천 · P를 위한 여행동반자');
    expect($('[data-mood="rest"] .ex').textContent).toMatch(/^춘천 인기: /);
    expect(asked).toEqual(['gangwon:51110']);
    expect(areasInUse()).toEqual(['춘천']);
    await tap('[data-mood="walk"]');
    await wait();
    expect(cardIds()).toHaveLength(3);
    expect(cardIds().every((id) => byId(id)?.area === '춘천')).toBe(true);
    expect(rainArea(current().state())).toBe('51110');
  });

  it('Amendment 2: a 강원 device with no 시군구 kept opens at the one its basis stands on (지역 속초시)', async () => {
    localStorage.setItem(destKey(KEYS.basis, 'gangwon'), '"region"');
    localStorage.setItem(destKey(KEYS.region, 'gangwon'), '"51210"');
    mount({ dest: 'gangwon', at: 강릉역 });
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', sgg: '51210', basis: 'region', region: '51210' });
    expect($('#basis > span').textContent).toBe('속초시 근처');
    expect($('.logo .rg').textContent).toBe(':속초');
    expect(areasInUse()).toEqual(['속초']);
  });

  // predeploy review 2 m-1: the 시군구 wanted last wins, and the basis goes with it — never :속초 with 「강릉시 근처」
  it('review 2 m-1: a 강원(강릉) device with 지역 강릉시 that picked 속초시 when it was the 자동 지역 (before Amendment 2): 강원 속초, 속초시 근처, its 비 소식 and cards', async () => {
    localStorage.setItem(destKey(KEYS.basis, 'gangwon'), '"region"');
    localStorage.setItem(destKey(KEYS.region, 'gangwon'), '"51150"');
    localStorage.setItem(destKey(KEYS.basis, 'nation'), '"region"');
    localStorage.setItem(destKey(KEYS.region, 'nation'), '"51210"');
    mount({ dest: 'nation', sgg: '51210', at: 강릉역 });
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', sgg: '51210', basis: 'region', region: '51210' });
    expect($('.logo .rg').textContent).toBe(':속초');
    expect($('#basis > span').textContent).toBe('속초시 근처');
    expect(rainArea(current().state())).toBe('51210');
    expect(localStorage.getItem(destKey(KEYS.region, 'gangwon'))).toBe('"51210"');
    await tap('[data-mood="walk"]');
    await wait();
    expect(cardIds()).toHaveLength(3);
    expect(cardIds().every((id) => byId(id)?.area === '속초')).toBe(true);
  });

  it('review 2 m-1: 브라우저로 열기 at 속초 (dest=gangwon&area=51210) on a device with 지역 강릉시: 속초, 속초시 근처', async () => {
    localStorage.setItem(destKey(KEYS.basis, 'gangwon'), '"region"');
    localStorage.setItem(destKey(KEYS.region, 'gangwon'), '"51150"');
    window.history.replaceState(null, '', '/?dest=gangwon&area=51210');
    Object.assign(window, { __dest: 'gangwon', __destBy: 'link' });
    try {
      mount({ dest: 'gangwon', at: 강릉역 });
      await wait();
      expect(current().state()).toMatchObject({ dest: 'gangwon', sgg: '51210', basis: 'region', region: '51210' });
      expect($('.logo .rg').textContent).toBe(':속초');
      expect($('#basis > span').textContent).toBe('속초시 근처');
      expect(rainArea(current().state())).toBe('51210');
    } finally {
      window.history.replaceState(null, '', '/');
      delete (window as { __dest?: unknown }).__dest;
      delete (window as { __destBy?: unknown }).__destBy;
    }
  });

  it('review 2 m-1: a 숙소 in 강릉 as the basis, 춘천 the 시군구 kept: 춘천, 춘천시 근처 (the 숙소 kept; picked again, 강릉)', async () => {
    localStorage.setItem(destKey(KEYS.basis, 'gangwon'), '"stay"');
    localStorage.setItem(destKey(KEYS.stay, 'gangwon'), JSON.stringify({ ...강릉역, area: '51150', source: 'gps' }));
    localStorage.setItem(SGG_KEY, '"51110"');
    mount({ dest: 'gangwon', at: 강릉역 });
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', sgg: '51110', basis: 'region', region: '51110', stay: { area: '51150' } });
    expect($('.logo .rg').textContent).toBe(':춘천');
    expect($('#basis > span').textContent).toBe('춘천시 근처');
    expect(rainArea(current().state())).toBe('51110');
    expect(localStorage.getItem(destKey(KEYS.basis, 'gangwon'))).toBe('"region"');
    await tap('#basis');
    await tap('#sheet [data-basis="stay"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', sgg: '51150', basis: 'stay' });
    expect($('.logo .rg').textContent).toBe(':강릉');
  });

  it('review 2 m-2: a place saved in 강릉 stays in ♥ N and the saved list after moving to 속초', async () => {
    mount({ dest: 'gangwon', at: 강릉역 });
    await wait();
    await tap('[data-mood="walk"]');
    await wait();
    const id = cardIds()[0];
    ($(`.card[data-id="${id}"] .heart`) as HTMLButtonElement).click();
    await flush();
    expect($('#saved').textContent).toBe('1');
    await tap('#back');
    await wait();
    await tap('#basis');
    if (!$$('#sheet [data-area="51210"]').length) await tap('#sheet [data-action="other-area"]');
    await tap('#sheet [data-area="51210"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', sgg: '51210' });
    expect(areasInUse()).toEqual(['속초']);
    expect($('#saved').hidden).toBe(false);
    expect($('#saved').textContent).toBe('1');
    await tap('#saved');
    await wait();
    expect($$('#savedView .card').map((c) => c.getAttribute('data-id'))).toEqual([id]);
  });

  it('m-1: that device with 강릉시 as its region, location allowed, in 서울: its basis and region come along — 강원, 강릉시 근처, not the GPS', async () => {
    localStorage.setItem(destKey(KEYS.basis, 'nation'), '"region"');
    localStorage.setItem(destKey(KEYS.region, 'nation'), '"51150"');
    const { asked } = mount({ dest: 'nation', sgg: '51150', at: 서울시청, granted: true });
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', basis: 'region', region: '51150' });
    expect($('.logo .rg').textContent).toBe(':강릉');
    expect(localStorage.getItem(KEYS.dest)).toBe('"gangwon"');
    expect(localStorage.getItem(destKey(KEYS.basis, 'gangwon'))).toBe('"region"');
    expect(asked).toEqual(['gangwon:51150']);
  });

  it('m-1: that device with a 숙소 in 강릉: the 숙소 comes along (the basis too)', async () => {
    localStorage.setItem(destKey(KEYS.basis, 'nation'), '"stay"');
    localStorage.setItem(destKey(KEYS.stay, 'nation'), JSON.stringify({ ...강릉역, area: '51150', source: 'gps' }));
    mount({ dest: 'nation', sgg: '51150', at: 서울시청, granted: true });
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', basis: 'stay', stay: { ...강릉역 } });
    expect(JSON.parse(localStorage.getItem(destKey(KEYS.stay, 'gangwon'))!)).toMatchObject(강릉역);
  });

  it('m-1 store: the 자동 지역\'s keys read with 강원\'s region and 숙소 in them move to .gangwon before they are repaired away', () => {
    localStorage.setItem(destKey(KEYS.basis, 'nation'), '"stay"');
    localStorage.setItem(destKey(KEYS.region, 'nation'), '"51150"');
    localStorage.setItem(destKey(KEYS.stay, 'nation'), JSON.stringify({ ...강릉역, area: '51150', source: 'gps' }));
    const store = createStore(localStorage, null);
    store.useDest('nation');
    expect(store.place()).toEqual({ basis: 'gps', region: null, stay: null });
    expect(localStorage.getItem(destKey(KEYS.stay, 'nation'))).toBeNull();
    store.useDest('gangwon');
    expect(store.place()).toMatchObject({ basis: 'stay', region: '51150', stay: { ...강릉역 } });
    // a 강원 choice of its own is not overwritten
    localStorage.removeItem(destKey(KEYS.region, 'gangwon'));
    localStorage.setItem(destKey(KEYS.region, 'nation'), '"51150"');
    localStorage.setItem(destKey(KEYS.basis, 'nation'), '"region"');
    localStorage.setItem(destKey(KEYS.basis, 'gangwon'), '"gps"');
    store.carry();
    expect(localStorage.getItem(destKey(KEYS.region, 'gangwon'))).toBe('"51150"');
    expect(localStorage.getItem(destKey(KEYS.basis, 'gangwon'))).toBe('"gps"');
  });

  it('기준 시트: 여행지 row 제주·부산·강원·다른 곳; 강원 pressed → its 동네 index is 강원\'s 시군구 (the index\'s order, 강원\'s three among them); 속초시 → 강원 속초 (its list); 홍천군 → 자동 지역 홍천; 강릉시 → 강원 강릉', async () => {
    const { asked } = mount({ dest: 'jeju', at: { lat: 33.5122, lng: 126.5272 } });
    await wait();
    await tap('#basis');
    await destSide();
    expect($$('#sheet [data-dest]').map((b) => b.dataset.dest)).toEqual(['jeju', 'busan', 'gangwon', 'seoul', 'nation']);
    expect($('#sheet [data-dest="gangwon"] .nm').textContent).toBe('강원');
    await tap('#sheet [data-dest="gangwon"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', sgg: '51150', basis: 'region', region: null });
    expect($('#areas-basis-nation').textContent).toBe('강원');
    expect($$('#sheet .areas [data-area]').map((b) => b.dataset.area)).toEqual(expect.arrayContaining(['51110', '51150', '51210', '51830', '51760', '51720']));
    await tap('#sheet [data-area="51150"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', basis: 'region', region: '51150' });
    expect($('#basis > span').textContent).toBe('강릉시 근처');
    await tap('#basis');
    expect($('#sheet [data-area="51150"]').getAttribute('aria-pressed')).toBe('true');
    await tap('#sheet [data-area="51210"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', sgg: '51210', basis: 'region', region: '51210' });
    expect($('.logo .rg').textContent).toBe(':속초');
    expect(areasInUse()).toEqual(['속초']);
    expect(localStorage.getItem(SGG_KEY)).toBe('"51210"');
    await tap('#basis');
    expect($('#sheet [data-dest="gangwon"]').getAttribute('aria-pressed')).toBe('true');
    expect($('#sheet [data-area="51210"]').getAttribute('aria-pressed')).toBe('true');
    await tap('#sheet [data-area="51720"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'nation', sgg: '51720', basis: 'region', region: '51720' });
    expect($('.logo .rg').textContent).toBe(':홍천');
    await tap('#basis');
    await tap('#sheet [data-area="51150"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', sgg: '51150', basis: 'region', region: '51150' });
    expect($('.logo .rg').textContent).toBe(':강릉');
    expect(asked).toEqual(['jeju', 'gangwon:51150', 'gangwon:51210', 'nation:51720']);
  });

  it('Amendment 2: GPS in 속초 from 강릉: 강원 속초 (its list, its name; no note — the same destination); GPS in 홍천: the 자동 지역, whose list never has 강원\'s records', async () => {
    const at = { p: 속초해수욕장 as Point };
    const asked: string[] = [];
    localStorage.setItem(KEYS.dest, '"gangwon"');
    render({
      loadSpots: (d, sgg) => (asked.push(`${d}:${sgg}`), Promise.resolve(d === 'nation' ? normalizeNation(JSON.parse(nationFile('51')), DEST.gangwon.sgg, sgg) : gangwonRaw)),
      locate: () => Promise.resolve(at.p),
    });
    await wait();
    await tap('[data-mood="walk"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', sgg: '51210', destNote: null });
    expect($('.logo .rg').textContent).toBe(':속초');
    expect(cardIds().every((id) => byId(id)?.area === '속초')).toBe(true);
    await tap('#back');
    await wait();
    at.p = 홍천;
    await tap('[data-mood="walk"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'nation', sgg: '51720' });
    expect(asked).toEqual(['gangwon:51150', 'gangwon:51210', 'nation:51720']);
    const spots = current().state().spots as { sgg?: string }[];
    expect(spots.some((s) => DEST.gangwon.sgg!.includes(s.sgg ?? ''))).toBe(false);
    // and a read in 춘천 from there: 강원 again, at 춘천, with the note in that 시군구's name
    await tap('#back');
    await wait();
    at.p = 춘천역;
    await tap('[data-mood="walk"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', sgg: '51110', destNote: 'gangwon' });
    expect($('#status').textContent).toContain('지금 계신 춘천으로 바꿨어요.');
  });

  it('Amendment 2: 숙소 by GPS in 춘천 while in 강릉: the 시군구 follows; back to that 숙소 later from 지역 속초시: 춘천 again', async () => {
    mount({ dest: 'gangwon', at: 춘천역 });
    await wait();
    await tap('#basis');
    await tap('#sheet [data-basis="stay"]');
    await tap('#sheet [data-action="stay-here"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', sgg: '51110', basis: 'stay', stay: { area: '51110', source: 'gps' } });
    await tap('#basis');
    if (!$$('#sheet [data-area="51210"]').length) await tap('#sheet [data-action="other-area"]');
    await tap('#sheet [data-area="51210"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', sgg: '51210', basis: 'region' });
    await tap('#basis');
    await tap('#sheet [data-basis="stay"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', sgg: '51110', basis: 'stay' });
    expect($('.logo .rg').textContent).toBe(':춘천');
  });

  it('Amendment 2: outside — 「지금은 속초 밖이에요.」 by the 시군구 in use; KakaoTalk\'s 브라우저로 열기 hands over 강원\'s 시군구 (dest=gangwon&area=), which opens it', async () => {
    localStorage.setItem(KEYS.dest, '"gangwon"');
    localStorage.setItem(SGG_KEY, '"51210"');
    render({ loadSpots: () => Promise.resolve(gangwonRaw), locate: () => Promise.reject(new LocateError('outside', 'nodata')) });
    await wait();
    await tap('[data-mood="walk"]');
    await wait();
    expect($('#cards .notice-t').textContent).toBe('지금은 속초 밖이에요.');
    // a 숙소 by GPS in 홍천 (자동 지역) while in 속초
    reset();
    localStorage.setItem(SGG_KEY, '"51210"');
    mount({ dest: 'gangwon', at: 홍천 });
    await wait();
    await tap('#basis');
    await tap('#sheet [data-basis="stay"]');
    await tap('#sheet [data-action="stay-here"]');
    await wait();
    expect($('#sheet .form-err').textContent).toBe('지금은 속초 밖이에요. 아래에서 숙소 동네를 골라 주세요.');
    reset();
    localStorage.setItem(SGG_KEY, '"51210"');
    mount({ dest: 'gangwon', userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 KAKAOTALK 10.8.0' });
    await wait();
    const url = new URL(document.querySelector('#homeNote a[data-action="inapp-open"]')!.getAttribute('href')!).searchParams.get('url')!;
    expect(new URL(url).search).toBe('?dest=gangwon&area=51210');
    reset();
    window.history.replaceState(null, '', '/?dest=gangwon&area=51110');
    Object.assign(window, { __dest: 'gangwon', __destBy: 'link' });
    mount({});
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', sgg: '51110' });
    window.history.replaceState(null, '', '/');
    delete (window as { __dest?: unknown }).__dest;
    delete (window as { __destBy?: unknown }).__destBy;
  });

  it('Amendment 3: 제주 device, a GPS read in 양양: 강원 at 양양 — its list only, 여차나:양양, the note 「양양으로」, 비 소식 at 양양', async () => {
    const { asked } = mount({ dest: 'jeju', at: 양양시외버스터미널 });
    await wait();
    await tap('[data-mood="walk"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', sgg: '51830', destNote: 'gangwon', basis: 'gps' });
    expect($('.logo .rg').textContent).toBe(':양양');
    expect(document.title).toBe('여차나:양양 · P를 위한 여행동반자');
    expect($('#status').textContent).toContain('지금 계신 양양으로 바꿨어요.');
    expect(asked).toEqual(['jeju', 'gangwon:51830']);
    expect(cardIds()).toHaveLength(3);
    expect(cardIds().every((id) => byId(id)?.area === '양양')).toBe(true);
    expect(areasInUse()).toEqual(['양양']);
    expect(rainArea(current().state())).toBe('51830');
    expect(localStorage.getItem(SGG_KEY)).toBe('"51830"');
  });

  it('Amendment 3: a device that had 양양 as the 자동 지역 (jeju.sgg 51830): opens 강원 at 양양 (「양양 인기:」), kept for 강원; 브라우저로 열기 at 양양 (dest=nation&area=51830) too', async () => {
    const { asked } = mount({ dest: 'nation', sgg: '51830', at: 양양시외버스터미널 });
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', sgg: '51830' });
    expect($('.logo .rg').textContent).toBe(':양양');
    expect(localStorage.getItem(KEYS.dest)).toBe('"gangwon"');
    expect(localStorage.getItem(SGG_KEY)).toBe('"51830"');
    expect(asked).toEqual(['gangwon:51830']);
    expect(areasInUse()).toEqual(['양양']);
    expect($('[data-mood="rest"] .ex').textContent).toMatch(/^양양 인기: /);
    reset();
    window.history.replaceState(null, '', '/?dest=nation&area=51830');
    Object.assign(window, { __dest: 'nation', __destBy: 'link' });
    try {
      mount({});
      await wait();
      expect(current().state()).toMatchObject({ dest: 'gangwon', sgg: '51830' });
    } finally {
      window.history.replaceState(null, '', '/');
      delete (window as { __dest?: unknown }).__dest;
      delete (window as { __destBy?: unknown }).__destBy;
    }
  });

  it('Amendment 4: 제주 device, a GPS read in 평창 (진부): 강원 at 평창 — its list only, 여차나:평창, the note 「평창으로」, 비 소식 at 평창', async () => {
    const { asked } = mount({ dest: 'jeju', at: 진부 });
    await wait();
    await tap('[data-mood="walk"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', sgg: '51760', destNote: 'gangwon', basis: 'gps' });
    expect($('.logo .rg').textContent).toBe(':평창');
    expect(document.title).toBe('여차나:평창 · P를 위한 여행동반자');
    expect($('#status').textContent).toContain('지금 계신 평창으로 바꿨어요.');
    expect(asked).toEqual(['jeju', 'gangwon:51760']);
    expect(cardIds()).toHaveLength(3);
    expect(cardIds().every((id) => byId(id)?.area === '평창')).toBe(true);
    expect(areasInUse()).toEqual(['평창']);
    expect(rainArea(current().state())).toBe('51760');
    expect(localStorage.getItem(SGG_KEY)).toBe('"51760"');
  });

  it('Amendment 4: a device that had 평창 as the 자동 지역 (jeju.sgg 51760): opens 강원 at 평창 (「평창 인기:」), kept for 강원; 브라우저로 열기 at 평창 (dest=nation&area=51760) too', async () => {
    const { asked } = mount({ dest: 'nation', sgg: '51760', at: 진부 });
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', sgg: '51760' });
    expect($('.logo .rg').textContent).toBe(':평창');
    expect(localStorage.getItem(KEYS.dest)).toBe('"gangwon"');
    expect(localStorage.getItem(SGG_KEY)).toBe('"51760"');
    expect(asked).toEqual(['gangwon:51760']);
    expect(areasInUse()).toEqual(['평창']);
    expect($('[data-mood="rest"] .ex').textContent).toMatch(/^평창 인기: /);
    reset();
    window.history.replaceState(null, '', '/?dest=nation&area=51760');
    Object.assign(window, { __dest: 'nation', __destBy: 'link' });
    try {
      mount({});
      await wait();
      expect(current().state()).toMatchObject({ dest: 'gangwon', sgg: '51760' });
    } finally {
      window.history.replaceState(null, '', '/');
      delete (window as { __dest?: unknown }).__dest;
      delete (window as { __destBy?: unknown }).__destBy;
    }
  });

  it('사용 기록: an area basis in 강원 sends its 시군구 as sgg, never as area', () => {
    const base = { view: 'home', mood: null, sub: 'meal', newSub: 'mix', reach: 'drive30', when: 'now', today: '2026-10-30' } as const;
    expect(contextOf({ ...base, basis: 'region', region: '51150', dest: 'gangwon' })).toMatchObject({ basis: 'area', sgg: '51150', dest: 'gangwon' });
    expect(contextOf({ ...base, basis: 'region', region: '51150', dest: 'gangwon' })).not.toHaveProperty('area');
  });

  // last: another language's words stay in the tables for the rest of this file
  it('in English: 여차나 Gangneung, the results say once that the place names are Korean', async () => {
    await apply('en', EN, document, Promise.resolve({}));
    mount({ dest: 'gangwon', at: 강릉역 });
    await wait();
    expect($('.logo .rg').textContent).toBe(':Gangneung');
    expect(document.title).toBe('Yeochana:Gangneung · Your no-plan travel buddy');
    await tap('[data-mood="walk"]');
    await wait();
    expect($('#how').textContent).toMatch(/Place names are shown in Korean\.$/);
    // Amendment 2: each 시군구 by its official form, the 여행지 row's 강원 too
    reset();
    localStorage.setItem(SGG_KEY, '"51210"');
    mount({ dest: 'gangwon', at: 속초해수욕장 });
    await wait();
    expect($('.logo .rg').textContent).toBe(':Sokcho');
    expect(document.title).toBe('Yeochana:Sokcho · Your no-plan travel buddy');
    await tap('#basis');
    await destSide();
    expect($('#sheet [data-dest="gangwon"] .nm').textContent).toBe('Gangwon');
    // Amendment 3
    reset();
    localStorage.setItem(SGG_KEY, '"51830"');
    mount({ dest: 'gangwon', at: 양양시외버스터미널 });
    await wait();
    expect($('.logo .rg').textContent).toBe(':Yangyang');
    expect(document.title).toBe('Yeochana:Yangyang · Your no-plan travel buddy');
    // Amendment 4
    reset();
    localStorage.setItem(SGG_KEY, '"51760"');
    mount({ dest: 'gangwon', at: 진부 });
    await wait();
    expect($('.logo .rg').textContent).toBe(':Pyeongchang');
    expect(document.title).toBe('Yeochana:Pyeongchang · Your no-plan travel buddy');
  });

  it('every 강원 시군구 has its name in the four languages', async () => {
    const { BUSAN_COPY } = await import('../src/render');
    const { JA } = await import('../src/i18n/ja');
    const { ZH } = await import('../src/i18n/zh-Hans');
    for (const t of [BUSAN_COPY, EN.busan, JA.busan, ZH.busan]) expect(Object.keys(t.sggName).sort()).toEqual([...DEST.gangwon.sgg!, ...DEST.seoul.sgg!].sort());
  });
});
