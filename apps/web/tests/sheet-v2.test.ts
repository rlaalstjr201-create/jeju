// @vitest-environment jsdom
// 기준 시트 2판 (ADR-0103, specs/sheet-v2.md): 「여행지 | 내 위치」 and 주소·숙소 검색. The nation build only (npm run
// test:nation); `--mode busan`·`--mode jeju` keep the sheet as it was (app.test.ts, busan-app.test.ts).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeNation } from '../src/nation';
import { NATION, loadNation } from '../src/release';
import { KEYS, destKey } from '../src/store';
import type { GeoHit } from '../src/types';
import { fileSpots } from './fixtures';
import { $, $$, current, flush, render, reset, settle, tap } from './harness';

const file = (f: string) => readFileSync(resolve(__dirname, `../data/nation/${f}.json`), 'utf8');
const 동문시장 = { lat: 33.5122, lng: 126.5272 };
const 애월 = { name: '애월 게스트하우스', addr: '제주특별자치도 제주시 애월읍 애월해안로 1', lat: 33.4631, lng: 126.3105 };
const 해운대 = { name: '해운대해수욕장', addr: '부산 해운대구 우동', lat: 35.1587, lng: 129.1604 };
const 속초 = { name: '속초해수욕장', addr: '강원 속초시 조양동', lat: 38.1906, lng: 128.6014 };
const wait = async () => {
  for (let i = 0; i < 4; i++) await flush();
  await settle();
};
type Answer = { status: number; hits?: GeoHit[] } | 'throw';
function mount(o: { dest?: string; answer?: Answer } = {}) {
  if (o.dest) localStorage.setItem(KEYS.dest, JSON.stringify(o.dest));
  const asked: string[] = [];
  render({
    loadSpots: (d, sgg) => Promise.resolve(d === 'nation' || d === 'gangwon' ? normalizeNation(JSON.parse(file('51')), [], sgg) : fileSpots),
    locate: () => Promise.resolve(동문시장),
    fetch: (url: string) => {
      if (!url.startsWith('/api/geo')) return Promise.resolve({ ok: false, status: 204, json: () => Promise.resolve(null) });
      asked.push(decodeURIComponent(url.slice('/api/geo?q='.length)));
      const a = o.answer ?? { status: 200, hits: [애월] };
      if (a === 'throw') return Promise.reject(new Error('offline'));
      return Promise.resolve({ ok: a.status === 200, status: a.status, json: () => Promise.resolve({ hits: a.hits ?? [] }) });
    },
  });
  return { asked };
}
const pressed = (sel: string) => $$(sel).filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.seg ?? b.dataset.dest);
async function search(words: string) {
  const q = $<HTMLInputElement>('#sheet .addr-q');
  q.value = words;
  q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await wait();
}

describe.runIf(NATION)('기준 시트 2판 (ADR-0103)', () => {
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
  afterEach(reset);

  it('여행지 | 내 위치: 내 위치 on GPS (no chips); 여행지 shows the chips 제주·부산·강원·다른 곳 (제주 pressed), 내 위치 hides them again', async () => {
    mount({ dest: 'jeju' });
    await wait();
    await tap('#basis');
    expect($$('#sheet [data-seg]').map((b) => b.textContent)).toEqual(['여행지', '내 위치']);
    expect(pressed('#sheet [data-seg]')).toEqual(['gps']);
    expect($('#sheet .chips')).toBeNull();
    // the first focus stays on 언제, as before (the toggle is not where a choice is made each time)
    expect(document.activeElement?.getAttribute('data-when')).toBe('now');
    await tap('#sheet [data-seg="pick"]');
    expect(pressed('#sheet [data-seg]')).toEqual(['pick']);
    expect($$('#sheet .chips [data-dest]').map((b) => b.textContent)).toEqual(['제주', '부산', '강원', '다른 곳']);
    expect(pressed('#sheet .chips [data-dest]')).toEqual(['jeju']);
    expect(document.activeElement).toBe($('#sheet .chips [data-dest="jeju"]'));
    expect(current().state()).toMatchObject({ basis: 'gps', dest: 'jeju' }); // nothing changes until a chip is picked
    await tap('#sheet [data-seg="gps"]');
    expect($('#sheet .chips')).toBeNull();
    expect(pressed('#sheet [data-seg]')).toEqual(['gps']);
    expect(current().state().overlay).toBe('basis');
  });

  it('a chip picked: that 여행지 (부산, 지역 고르기 and its 동네); 내 위치 then is 지금 있는 곳 — the basis GPS, the sheet closed', async () => {
    mount({ dest: 'jeju' });
    await wait();
    await tap('#basis');
    await tap('#sheet [data-seg="pick"]');
    await tap('#sheet .chips [data-dest="busan"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'busan', basis: 'region' });
    expect(pressed('#sheet [data-seg]')).toEqual(['pick']);
    expect(pressed('#sheet .chips [data-dest]')).toEqual(['busan']);
    await tap('#sheet [data-seg="gps"]');
    await wait();
    expect(current().state()).toMatchObject({ basis: 'gps', overlay: null });
  });

  it('a 지역 basis opens on 여행지 with its chips; the chip in use goes down to its 동네', async () => {
    mount({ dest: 'jeju' });
    await wait();
    await tap('#basis');
    await tap('#sheet [data-area="애월"]');
    await wait();
    await tap('#basis');
    expect(pressed('#sheet [data-seg]')).toEqual(['pick']);
    expect(pressed('#sheet .chips [data-dest]')).toEqual(['jeju']);
    await tap('#sheet .chips [data-dest="jeju"]');
    await flush();
    expect(document.activeElement).toBe($('#sheet .areas .opt'));
    expect(current().state()).toMatchObject({ dest: 'jeju', basis: 'region', region: '애월', overlay: 'basis' });
  });

  it('the name line opens the sheet on 여행지, its chips shown', async () => {
    mount({ dest: 'jeju' });
    await wait();
    $('#logo').focus();
    await tap('#logo');
    expect(pressed('#sheet [data-seg]')).toEqual(['pick']);
    expect(document.activeElement).toBe($('#sheet .chips [data-dest="jeju"]'));
  });

  it('주소·숙소: searched on Enter (only the words), the answers as rows; one picked is the 숙소 and the basis (source addr), kept', async () => {
    const { asked } = mount({ dest: 'jeju', answer: { status: 200, hits: [애월, 해운대] } });
    await wait();
    await tap('#basis');
    expect($('#sheet [data-basis="stay"] .nm').textContent).toBe('주소·숙소');
    const q = $<HTMLInputElement>('#sheet .addr-q');
    expect([q.type, q.getAttribute('aria-label'), q.getAttribute('maxlength')]).toEqual(['search', '주소나 숙소 이름 검색', '40']);
    expect($('#sheet .addr-go').getAttribute('aria-label')).toBe('검색');
    await search('  애월   게스트하우스 ');
    expect(asked).toEqual(['애월 게스트하우스']);
    expect($$('#sheet .hit-row [data-hit]').map((b) => [b.querySelector('.nm')!.textContent, b.querySelector('.lm')!.textContent])).toEqual([
      [애월.name, 애월.addr],
      [해운대.name, 해운대.addr],
    ]);
    expect($('#sheet .addr-err').hidden).toBe(true);
    await tap('#sheet [data-hit="0"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'jeju', basis: 'stay', overlay: null, stay: { lat: 애월.lat, lng: 애월.lng, area: '애월', source: 'addr' } });
    expect($('#basis > span').textContent).toBe('숙소 근처');
    expect(JSON.parse(localStorage.getItem(KEYS.stay)!)).toMatchObject({ lat: 애월.lat, source: 'addr' });
    // back in the sheet: 애월 숙소, checked
    await tap('#basis');
    expect($('#sheet [data-basis="stay"] .lm').textContent).toBe('애월 숙소');
    expect($('#sheet [data-basis="stay"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('an answer in another 여행지 moves there (부산, 강원 속초) with the 숙소 there', async () => {
    mount({ dest: 'jeju', answer: { status: 200, hits: [해운대, 속초] } });
    await wait();
    await tap('#basis');
    await search('해수욕장');
    await tap('#sheet [data-hit="0"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'busan', basis: 'stay', stay: { lat: 해운대.lat, source: 'addr' } });
    expect($('.logo .rg').textContent).toBe(':부산');
    expect(JSON.parse(localStorage.getItem(destKey(KEYS.stay, 'busan'))!)).toMatchObject({ lat: 해운대.lat, source: 'addr' });
    expect(localStorage.getItem(KEYS.stay)).toBeNull(); // Jeju's own 숙소 untouched
    await tap('#basis');
    await search('해수욕장');
    await tap('#sheet [data-hit="1"]');
    await wait();
    expect(current().state()).toMatchObject({ dest: 'gangwon', sgg: '51210', basis: 'stay', stay: { area: '51210', source: 'addr' } });
    expect($('.logo .rg').textContent).toBe(':속초');
  });

  it('no key on the server (503): 「검색을 쓸 수 없어요.」; none found; the request failing', async () => {
    mount({ dest: 'jeju', answer: { status: 503 } });
    await wait();
    await tap('#basis');
    await tap('#sheet .addr-go'); // nothing typed: nothing asked
    expect($('#sheet .addr-err').hidden).toBe(true);
    await search('애월');
    expect($('#sheet .addr-err').textContent).toBe('검색을 쓸 수 없어요.');
    expect($('#sheet .addr-err').hidden).toBe(false);
    expect($$('#sheet .hit-row')).toHaveLength(0);
    reset();
    mount({ dest: 'jeju', answer: { status: 200, hits: [] } });
    await wait();
    await tap('#basis');
    await search('없는 곳');
    expect($('#sheet .addr-err').textContent).toBe('찾는 곳이 없어요. 다른 이름으로 검색해 주세요.');
    reset();
    mount({ dest: 'jeju', answer: 'throw' });
    await wait();
    await tap('#basis');
    await search('애월');
    expect($('#sheet .addr-err').textContent).toBe('검색하지 못했어요. 연결을 확인하고 다시 검색해 주세요.');
  });

  it('what was typed and the answers stay when 언제 is picked (the sheet rebuilt), and are gone when it is opened again', async () => {
    mount({ dest: 'jeju', answer: { status: 200, hits: [애월] } });
    await wait();
    await tap('#basis');
    await search('애월');
    await tap('#sheet [data-when]:not([data-when="now"])');
    expect($<HTMLInputElement>('#sheet .addr-q').value).toBe('애월');
    expect($$('#sheet .hit-row')).toHaveLength(1);
    await tap('#sheet .sheet-close');
    await wait();
    await tap('#basis');
    expect($$('#sheet .hit-row')).toHaveLength(0);
  });
});
