// @vitest-environment jsdom
// 강원 (ADR-0102, plans/nationwide-app.md 1.3): 강릉 is a 검수한 곳 now — a GPS read there, the 인기 칸, a device that had it
// as the 자동 지역 and the 기준 시트 all open `gangwon`, with its own list (reasons, all five moods), while the other 강원
// 시군구 stay 자동 지역. With the switch on only (npm run test:nation).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeSpots } from '../src/data';
import { DEST } from '../src/dest';
import { apply } from '../src/i18n/apply';
import { EN } from '../src/i18n/en';
import { normalizeNation } from '../src/nation';
import type { Point } from '../src/pick';
import { NATION, loadNation } from '../src/release';
import { KEYS, createStore, destKey } from '../src/store';
import { contextOf } from '../src/track';
import { fileSpots } from './fixtures';
import { $, $$, cardIds, current, flush, render, reset, settle, tap } from './harness';

const nationFile = (f: string) => readFileSync(resolve(__dirname, `../data/nation/${f}.json`), 'utf8');
const gangwonRaw = JSON.parse(readFileSync(resolve(__dirname, '../data/gangwon/spots-gangwon.json'), 'utf8')) as Record<string, unknown>[];
const 강릉역 = { lat: 37.7643, lng: 128.8996 };
const 속초해수욕장 = { lat: 38.1906, lng: 128.6014 };
const 서울시청 = { lat: 37.5663, lng: 126.9779 };
const wait = async () => {
  for (let i = 0; i < 4; i++) await flush();
  await settle();
};
function mount(o: { dest?: string; sgg?: string; at?: Point; granted?: boolean } = {}) {
  if (o.dest) localStorage.setItem(KEYS.dest, JSON.stringify(o.dest));
  if (o.sgg) localStorage.setItem(KEYS.sgg, JSON.stringify(o.sgg));
  const asked: string[] = [];
  render({
    ...(o.granted ? { geoPermission: () => Promise.resolve('granted' as const) } : {}),
    loadSpots: (d, sgg) => {
      asked.push(sgg ? `${d}:${sgg}` : d);
      // the 자동 지역's list as nation-part gives it: 강릉's records left to 강원
      return Promise.resolve(d === 'nation' ? normalizeNation(JSON.parse(nationFile('51')), DEST.gangwon.sgg, sgg) : d === 'gangwon' ? gangwonRaw : fileSpots);
    },
    locate: () => Promise.resolve(o.at ?? 강릉역),
  });
  return { asked };
}
const byId = (id: string | null | undefined) => normalizeSpots(gangwonRaw).find((s) => s.id === id);

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
    expect(asked).toEqual(['jeju', 'gangwon']);
    expect(cardIds()).toHaveLength(3);
    expect(cardIds().every((id) => !!byId(id))).toBe(true);
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
    expect(asked).toEqual(['gangwon']);
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
    expect(asked).toEqual(['gangwon']);
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

  it('기준 시트: 여행지 row 제주·부산·강릉·다른 곳; 강릉 pressed → its 동네 index is 강원\'s 시군구, 강릉시 among them; 속초시 → 자동 지역 속초; 강릉시 again → 강원', async () => {
    const { asked } = mount({ dest: 'jeju', at: { lat: 33.5122, lng: 126.5272 } });
    await wait();
    await tap('#basis');
    expect($$('#sheet [data-dest]').map((b) => b.dataset.dest)).toEqual(['jeju', 'busan', 'gangwon', 'nation']);
    expect($('#sheet [data-dest="gangwon"] .nm').textContent).toBe('강릉');
    await tap('#sheet [data-dest="gangwon"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', basis: 'region', region: null });
    expect($('#areas-basis-nation').textContent).toBe('강원');
    expect($$('#sheet .areas [data-area]').map((b) => b.dataset.area)).toEqual(expect.arrayContaining(['51150', '51210']));
    await tap('#sheet [data-area="51150"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', basis: 'region', region: '51150' });
    expect($('#basis > span').textContent).toBe('강릉시 근처');
    await tap('#basis');
    expect($('#sheet [data-area="51150"]').getAttribute('aria-pressed')).toBe('true');
    await tap('#sheet [data-area="51210"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'nation', sgg: '51210', basis: 'region', region: '51210' });
    expect($('.logo .rg').textContent).toBe(':속초');
    await tap('#basis');
    await tap('#sheet [data-area="51150"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', basis: 'region', region: '51150' });
    expect($('.logo .rg').textContent).toBe(':강릉');
    expect(asked).toEqual(['jeju', 'gangwon', 'nation:51210']);
  });

  it('GPS in 속초 from 강원: the 자동 지역 (속초 is not checked yet); the 자동 지역 list never has 강릉\'s records', async () => {
    const { asked } = mount({ dest: 'gangwon', at: 속초해수욕장 });
    await wait();
    await tap('[data-mood="walk"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'nation', sgg: '51210' });
    expect(asked).toEqual(['gangwon', 'nation:51210']);
    const spots = current().state().spots as { sgg?: string }[];
    expect(spots.some((s) => s.sgg === '51150')).toBe(false);
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
  });
});
