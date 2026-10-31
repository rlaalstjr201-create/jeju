// @vitest-environment jsdom
// 자동 지역 on screen (plans/nationwide-app.md 4, U10): the 이름 줄 and title by 시군구, no 쉬기·유명한 데, no empty reason, the
// 고르는 방식 line, the credit, no 둘러보기, and the 기준 시트's 다른 곳 with its 시도 → 시군구 index. Switch on only.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { apply } from '../src/i18n/apply';
import { EN } from '../src/i18n/en';
import { normalizeNation } from '../src/nation';
import type { Point } from '../src/pick';
import { NATION, loadNation } from '../src/release';
import { KEYS } from '../src/store';
import { fileSpots } from './fixtures';
import { $, $$, cardIds, current, flush, render, reset, settle, tap, destSide } from './harness';

const file = (f: string) => readFileSync(resolve(__dirname, `../data/nation/${f}.json`), 'utf8');
const raw = (f: string) => JSON.parse(file(f)) as unknown;
const 동해역 = { lat: 37.4985, lng: 129.124 };
const wait = async () => {
  for (let i = 0; i < 4; i++) await flush();
  await settle();
};
function mount(o: { dest?: string; sgg?: string; at?: Point } = {}) {
  if (o.dest) localStorage.setItem(KEYS.dest, JSON.stringify(o.dest));
  if (o.sgg) localStorage.setItem(KEYS.sgg, JSON.stringify(o.sgg));
  const asked: string[] = [];
  render({
    loadSpots: (d, sgg) => (asked.push(sgg ? `${d}:${sgg}` : d), Promise.resolve(d === 'nation' ? normalizeNation(raw(sgg!.startsWith('52') ? '52' : '51'), [], sgg) : fileSpots)),
    locate: () => Promise.resolve(o.at ?? 동해역),
  });
  return { asked };
}

describe.runIf(NATION)('자동 지역 on screen (switch on)', () => {
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
    Element.prototype.scrollIntoView ??= () => undefined;
  });
  afterEach(() => reset());

  it('이름 줄 and title by 시군구; 쉬기 (rules v2, ADR-0105) but no 유명한 데; a card without reason has no reason line; #how, credit, no 둘러보기', async () => {
    mount({ dest: 'nation', sgg: '51170' });
    await wait();
    expect($('.logo .rg').textContent).toBe(':동해');
    expect(document.title).toBe('여차나:동해 · P를 위한 여행동반자');
    const hidden = (m: string) => $(`[data-mood="${m}"]`).closest('li')!.hidden;
    expect(hidden('famous')).toBe(true);
    expect(['rest', 'walk', 'new', 'food'].map(hidden)).toEqual([false, false, false, false]);
    await tap('[data-mood="walk"]');
    await wait();
    expect(cardIds()).toHaveLength(3);
    expect($$('#cards .reason')).toHaveLength(0);
    expect($('#how').textContent).toBe('공공 데이터로 가까운 순으로 골랐어요.');
    expect($('#results > .credit').textContent).toBe('정보·사진: 한국관광공사');
    expect($('#results > .landing').hidden).toBe(true);
  });

  it('no reason line, so each row card keeps its own trip even when the two are the same (no 「둘 다」 on 아니면)', async () => {
    mount({ dest: 'nation', sgg: '51170' });
    await wait();
    await tap('[data-mood="any"]');
    await wait();
    expect($('#cards .alt').textContent).toBe('아니면');
    expect($$('#cards .card.row .meta .travel').map((t) => t.textContent)).toEqual(['차로 약 5분', '차로 약 5분']);
  });

  it('기준 시트: 다른 곳 pressed; its index is the 시도 in use, 다른 시도 lists them, 전북 → 전주시 완산구 is the list from then on', async () => {
    const { asked } = mount({ dest: 'nation', sgg: '51170' });
    await wait();
    await tap('#basis');
    await destSide();
    expect($('#sheet [data-dest="nation"]').getAttribute('aria-pressed')).toBe('true');
    expect($('#sheet [data-dest="nation"] .nm').textContent).toBe('다른 곳');
    expect($('#areas-basis-nation').textContent).toBe('강원');
    expect($$('#sheet .areas [data-area]').map((b) => b.dataset.area)).toContain('51210');
    await tap('#sheet [data-sido=""]');
    expect($('#areas-basis-nation').textContent).toBe('다른 시도');
    expect($$('#sheet [data-sido]').map((b) => b.querySelector('.nm')!.textContent)).not.toContain('부산');
    await tap('#sheet [data-sido="52"]');
    await tap('#sheet [data-area="52111"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'nation', sgg: '52111', basis: 'region', region: '52111' });
    expect($('.logo .rg').textContent).toBe(':전주');
    expect(asked).toEqual(['nation:51170', 'nation:52111']);
  });

  it('제주 device: the sheet offers 다른 곳, and pressing it opens 서울 (the 자동 지역 시군구 nearest 서울시청: 서대문구, since 중구 is 서울 검수한 곳, ADR-0106) to pick from', async () => {
    mount({ dest: 'jeju' });
    await wait();
    await tap('#basis');
    await destSide();
    await tap('#sheet [data-dest="nation"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'nation', sgg: '11410', basis: 'region' });
    expect($('#areas-basis-nation').textContent).toBe('서울');
  });

  // last: another language's words stay in the tables for the rest of this file
  it('in English: its words with its part, the 시도 named in English, a line that the 시군구 stay Korean', async () => {
    await apply('en', EN, document, Promise.resolve({}));
    mount({ dest: 'nation', sgg: '51170' });
    await wait();
    await tap('#basis');
    await destSide();
    expect($('#sheet [data-dest="nation"] .nm').textContent).toBe('Somewhere else');
    expect($('#areas-basis-nation').textContent).toBe('GangwonPlace names are shown in Korean.');
    expect($$('#sheet [data-area] .nm').map((b) => b.textContent)).toContain('강릉시');
    await tap('#sheet [data-sido=""]');
    expect($$('#sheet [data-sido] .nm').map((b) => b.textContent)).toContain('Jeonbuk');
  });
});
