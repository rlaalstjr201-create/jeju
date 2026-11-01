// @vitest-environment jsdom
// 서울 (ADR-0106): 종로·중구·용산·성동·광진·동대문·중랑·성북·강북·도봉·노원·은평·서대문·마포·양천 are a 검수한 곳 now — a GPS read there and a device that had one as
// the 자동 지역 open `seoul` at that 구, with its own list (reasons, all five moods) and name, while the other 구 (강남 …) stay
// 자동 지역. The build's
// `area` is the app's short name of each 구. With the switch on only (npm run test:nation), but for the last block.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeSpots } from '../src/data';
import { DEST } from '../src/dest';
import { normalizeNation, sggShorts } from '../src/nation';
import { pool, type Point, type Spot } from '../src/pick';
import { NATION, loadNation } from '../src/release';
import { KEYS } from '../src/store';
import { fileSpots } from './fixtures';
import { $, cardIds, current, flush, render, reset, settle, tap } from './harness';
import { SEOUL_GU, areaOf } from '../scripts/curated/rounds.mjs';

const nationFile = (f: string) => readFileSync(resolve(__dirname, `../data/nation/${f}.json`), 'utf8');
const seoulRaw = JSON.parse(readFileSync(resolve(__dirname, '../data/seoul/spots-seoul.json'), 'utf8')) as Record<string, unknown>[];
const 경복궁 = { lat: 37.5796, lng: 126.977 };
const 강남구청 = { lat: 37.5172, lng: 127.0473 }; // 강남구: still the 자동 지역 (its Kakao match not done)
const 광화문광장 = { lat: 37.5725, lng: 126.9769 }; // the 자동 지역 index names 서울 중구 here, 경복궁 (종로) 600 m north
const wait = async () => {
  for (let i = 0; i < 4; i++) await flush();
  await settle();
};
function mount(o: { dest?: string; sgg?: string; at?: Point } = {}) {
  if (o.dest) localStorage.setItem(KEYS.dest, JSON.stringify(o.dest));
  if (o.sgg) localStorage.setItem(KEYS.sgg, JSON.stringify(o.sgg));
  const asked: string[] = [];
  render({
    loadSpots: (d, sgg) => {
      asked.push(sgg ? `${d}:${sgg}` : d);
      return Promise.resolve(d === 'nation' ? normalizeNation(JSON.parse(nationFile('11')), [...DEST.gangwon.sgg!, ...DEST.seoul.sgg!], sgg) : d === 'seoul' ? seoulRaw : fileSpots);
    },
    locate: () => Promise.resolve(o.at ?? 경복궁),
  });
  return { asked };
}
const byId = (id: string | null | undefined) => normalizeSpots(seoulRaw).find((s) => s.id === id) as (Spot & { area?: string }) | undefined;

describe.runIf(NATION)('서울 (switch on)', () => {
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

  it('제주 device, a GPS read at 경복궁: moves to 서울 at 종로 (its own list), 여차나:종로, all five moods with reasons', async () => {
    const { asked } = mount({ dest: 'jeju', at: 경복궁 });
    await wait();
    await tap('[data-mood="famous"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'seoul', sgg: '11110', basis: 'gps' });
    expect($('.logo .rg').textContent).toBe(':종로');
    expect(localStorage.getItem(KEYS.dest)).toBe('"seoul"');
    expect(asked).toEqual(['jeju', 'seoul:11110']);
    expect(cardIds()).toHaveLength(3);
    expect(cardIds().every((id) => byId(id)?.famous)).toBe(true);
    const hidden = (m: string) => $(`[data-mood="${m}"]`).closest('li')!.hidden;
    expect(['rest', 'walk', 'new', 'famous', 'food'].map(hidden)).toEqual([false, false, false, false, false]);
  });

  it('a GPS read at 광화문광장 opens 서울 중구 by name, its list every checked 구 by reach: 경복궁 (종로) is a candidate (Amendment 2)', async () => {
    const { asked } = mount({ dest: 'seoul', at: 광화문광장 });
    await wait();
    await tap('[data-mood="new"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'seoul', sgg: '11140', basis: 'gps' });
    expect($('.logo .rg').textContent).toBe(':서울 중구');
    expect(asked.at(-1)).toBe('seoul:11140');
    const spots = current().state().spots!;
    expect(new Set(spots.map((s) => (s as Spot & { area?: string }).area)).size).toBe(DEST.seoul.sgg!.length);
    expect(pool(spots, 광화문광장, 'new').some((c) => c.spot.id === 'nt-126508')).toBe(true);
  });

  it('a device that had 종로 as the 자동 지역 (jeju.dest nation, jeju.sgg 11110): opens 서울, and keeps it', async () => {
    const { asked } = mount({ dest: 'nation', sgg: '11110', at: 경복궁 });
    await wait();
    expect(current().state().dest).toBe('seoul');
    expect(localStorage.getItem(KEYS.dest)).toBe('"seoul"');
    expect(asked).toEqual(['seoul:11110']);
  });

  it('a GPS read at 강남구청 (강남구, not checked yet) stays 자동 지역', async () => {
    mount({ dest: 'nation', at: 강남구청 });
    await wait();
    await tap('[data-mood="walk"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'nation', sgg: '11680' });
  });
});

describe('서울 출하 파일 (ADR-0106 2)', () => {
  it('each 구 `area` is the app’s short name of that 구 (sggShorts), and the file holds only 구 in DEST.seoul.sgg', () => {
    const ix = JSON.parse(nationFile('index')) as Parameters<typeof sggShorts>[0];
    const short = sggShorts(ix);
    for (const code of Object.keys(SEOUL_GU)) expect(areaOf(code)).toBe(short[`11${code}`]);
    const areas = new Set(seoulRaw.map((r) => r.area));
    expect([...areas].sort()).toEqual(DEST.seoul.sgg!.map((c) => short[c]).sort());
  });
});
