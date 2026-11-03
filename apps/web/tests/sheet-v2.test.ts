// @vitest-environment jsdom
// 기준 시트 2판 (ADR-0103, specs/sheet-v2.md): 「여행지 | 내 위치」 and 주소·숙소 검색. The nation build only (npm run
// test:nation); `--mode busan`·`--mode jeju` keep the sheet as it was (app.test.ts, busan-app.test.ts).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeNation } from '../src/nation';
import { NATION, loadNation } from '../src/release';
import type * as Release from '../src/release';
import { KEYS, destKey } from '../src/store';
import type { GeoHit } from '../src/types';
import { fileSpots } from './fixtures';
import { $, $$, current, flush, render, reset, settle, tap } from './harness';

// the 자동 지역's part not coming (no connection), for one test: loadNation answers false
const nationFails = vi.hoisted(() => ({ on: false }));
vi.mock('../src/release', async (orig) => {
  const m = await orig<typeof Release>();
  return { ...m, loadNation: () => (nationFails.on ? Promise.resolve(false) : m.loadNation()) };
});

const file = (f: string) => readFileSync(resolve(__dirname, `../data/nation/${f}.json`), 'utf8');
const 동문시장 = { lat: 33.5122, lng: 126.5272 };
const 애월 = { name: '애월 게스트하우스', addr: '제주특별자치도 제주시 애월읍 애월해안로 1', lat: 33.4631, lng: 126.3105 };
const 해운대 = { name: '해운대해수욕장', addr: '부산 해운대구 우동', lat: 35.1587, lng: 129.1604 };
const 속초 = { name: '속초해수욕장', addr: '강원 속초시 조양동', lat: 38.1906, lng: 128.6014 };
/** an address answer with no building name: its name is the address, `addr` empty */
const 이름만 = { name: '제주특별자치도 제주시 한림읍 한림리 1', addr: '', lat: 33.4139, lng: 126.2672 };
const north = (p: { lat: number }) => Math.round((p.lat + 0.0002) * 1e6) / 1e6;
const wait = async () => {
  for (let i = 0; i < 4; i++) await flush();
  await settle();
};
type Answer = { status: number; hits?: GeoHit[] } | 'throw';
/** /api/addr (the 도로명주소 API, ADR-0103 Amendment 2): `near` — the public point 0.0002° north of Kakao's (about 22 m); `far`
 * — 2 km away; a status — no answer */
type Pub = 'near' | 'far' | number;
const PUBLIC = '(공공) ';
const kakaoOf = (addr: string) => [애월, 해운대, 속초, 이름만].find((h) => (h.addr || h.name) === addr);
function mount(o: { dest?: string; answer?: Answer; hold?: Promise<void>; pub?: Pub; pubHold?: Promise<void> } = {}) {
  if (o.dest) localStorage.setItem(KEYS.dest, JSON.stringify(o.dest));
  const asked: string[] = [];
  const picked: string[] = [];
  render({
    loadSpots: (d, sgg) => Promise.resolve(d === 'nation' || d === 'gangwon' ? normalizeNation(JSON.parse(file('51')), [], sgg) : fileSpots),
    locate: () => Promise.resolve(동문시장),
    fetch: async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
      if (url === '/api/addr') {
        expect([init?.method, init?.headers?.['Content-Type']]).toEqual(['POST', 'application/json']);
        const addr = (JSON.parse(init!.body!) as { addr: string }).addr;
        picked.push(addr);
        await o.pubHold;
        const pub = o.pub ?? 'near';
        const k = kakaoOf(addr)!;
        if (typeof pub === 'number') return { ok: false, status: pub, json: () => Promise.resolve(null) };
        const at = { addr: PUBLIC + addr, lat: Math.round((k.lat + (pub === 'near' ? 0.0002 : 0.018)) * 1e6) / 1e6, lng: k.lng };
        return { ok: true, status: 200, json: () => Promise.resolve(at) };
      }
      if (!url.startsWith('/api/geo')) return { ok: false, status: 204, json: () => Promise.resolve(null) };
      // the words in a POST body only, never in the URL (m-5)
      expect([url, init?.method, init?.headers?.['Content-Type']]).toEqual(['/api/geo', 'POST', 'application/json']);
      asked.push((JSON.parse(init!.body!) as { q: string }).q);
      await o.hold;
      const a = o.answer ?? { status: 200, hits: [애월] };
      if (a === 'throw') throw new Error('offline');
      return { ok: a.status === 200, status: a.status, json: () => Promise.resolve({ hits: a.hits ?? [] }) };
    },
  });
  return { asked, picked };
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

  it('여행지 | 내 위치: 내 위치 on GPS (no chips); 여행지 shows the chips 제주·부산·강원·다른 곳 (제주 pressed), 내 위치 then closes the sheet on the home', async () => {
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
    expect($$('#sheet .chips [data-dest]').map((b) => b.textContent)).toEqual(['제주', '부산', '강원', '서울', '다른 곳']);
    expect(pressed('#sheet .chips [data-dest]')).toEqual(['jeju']);
    expect(document.activeElement).toBe($('#sheet .chips [data-dest="jeju"]'));
    expect(current().state()).toMatchObject({ basis: 'gps', dest: 'jeju' }); // nothing changes until a chip is picked
    // on the home, 내 위치 then is 내 위치 picked (ADR-0110 Amendment 2): the chips and the sheet go, the position is read
    await tap('#sheet [data-seg="gps"]');
    expect($('#sheet .chips')).toBeNull();
    expect(current().state()).toMatchObject({ destPick: false, overlay: null });
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

  it('ADR-0110: 내 위치 picked again on the home with no position yet reads it then (the sheet closed, the position known)', async () => {
    mount({ dest: 'jeju' });
    await wait();
    expect(current().state().origin).toBeNull();
    await tap('#basis');
    await tap('#sheet [data-seg="gps"]');
    await wait();
    expect(current().state()).toMatchObject({ basis: 'gps', overlay: null, origin: { key: 'gps' } });
  });

  it('ADR-0110 Amendment 2: 여행지 opened first and then 내 위치, on the home: the position is read all the same', async () => {
    mount({ dest: 'jeju' });
    await wait();
    await tap('#basis');
    await tap('#sheet [data-seg="pick"]');
    expect(current().state()).toMatchObject({ destPick: true, overlay: 'basis' });
    await tap('#sheet [data-seg="gps"]');
    await wait();
    expect(current().state()).toMatchObject({ basis: 'gps', destPick: false, overlay: null, origin: { key: 'gps' } });
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

  it('주소·숙소: searched on Enter (only the words), the answers as rows; one picked is found again by its address in the public API, whose point is the 숙소 and the basis (source addr), kept', async () => {
    const { asked, picked } = mount({ dest: 'jeju', answer: { status: 200, hits: [애월, 해운대] } });
    await wait();
    await tap('#basis');
    expect($('#sheet [data-basis="stay"] .nm').textContent).toBe('주소·숙소');
    const q = $<HTMLInputElement>('#sheet .addr-q');
    expect([q.type, q.getAttribute('aria-label'), q.getAttribute('maxlength')]).toEqual(['search', '주소나 숙소 이름 검색', '40']);
    // a name or an address: no spelling underline, no capital or correction (n-3)
    expect([q.getAttribute('spellcheck'), q.getAttribute('autocapitalize'), q.getAttribute('autocorrect')]).toEqual(['false', 'off', 'off']);
    expect($('#sheet .addr-go').getAttribute('aria-label')).toBe('검색');
    await search('  애월   게스트하우스 ');
    expect(asked).toEqual(['애월 게스트하우스']);
    expect($$('#sheet .hit-row [data-hit]').map((b) => [b.querySelector('.nm')!.textContent, b.querySelector('.lm')!.textContent])).toEqual([
      [애월.name, 애월.addr],
      [해운대.name, 해운대.addr],
    ]);
    expect($('#sheet .addr-err').hidden).toBe(true);
    expect($('#sheet .addr-live').textContent).toBe('2곳 찾았어요.');
    await tap('#sheet [data-hit="0"]');
    await wait();
    expect(picked).toEqual([애월.addr]);
    // the public point, never Kakao's, in the state and on the device
    expect(current().state()).toMatchObject({ dest: 'jeju', basis: 'stay', overlay: null, stay: { lat: north(애월), lng: 애월.lng, area: '애월', source: 'addr' } });
    expect($('#basis > span').textContent).toBe('숙소 근처');
    expect(JSON.parse(localStorage.getItem(KEYS.stay)!)).toEqual({ lat: north(애월), lng: 애월.lng, area: '애월', source: 'addr' });
    expect(localStorage.getItem(KEYS.basis)).toBe('"stay"');
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
    expect(current().state()).toMatchObject({ dest: 'busan', basis: 'stay', stay: { lat: north(해운대), source: 'addr' } });
    expect($('.logo .rg').textContent).toBe(':부산');
    expect(JSON.parse(localStorage.getItem(destKey(KEYS.stay, 'busan'))!)).toMatchObject({ lat: north(해운대), source: 'addr' });
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
    // told politely, once: the seen line is not a second live region (m-4)
    expect([$('#sheet .addr-live').getAttribute('role'), $('#sheet .addr-live').textContent, $('#sheet .addr-err').getAttribute('role')]).toEqual(['status', '검색을 쓸 수 없어요.', null]);
    expect($$('#sheet .hit-row')).toHaveLength(0);
    reset();
    mount({ dest: 'jeju', answer: { status: 200, hits: [] } });
    await wait();
    await tap('#basis');
    await search('없는 곳');
    expect($('#sheet .addr-err').textContent).toBe('찾는 곳이 없어요. 다른 이름으로 검색해 주세요.');
    expect($('#sheet .addr-live').textContent).toBe('찾는 곳이 없어요. 다른 이름으로 검색해 주세요.');
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

  it('검색 pressed: the focus stays on it while asking (aria-disabled, aria-busy, not disabled); a second press asks nothing', async () => {
    let answerNow = () => undefined as void;
    const hold = new Promise<void>((r) => (answerNow = r));
    const { asked } = mount({ dest: 'jeju', hold, answer: { status: 200, hits: [애월] } });
    await wait();
    await tap('#basis');
    $<HTMLInputElement>('#sheet .addr-q').value = '애월';
    const go = $<HTMLButtonElement>('#sheet .addr-go');
    go.focus();
    await tap(go);
    expect([go.disabled, go.getAttribute('aria-disabled'), go.getAttribute('aria-busy')]).toEqual([false, 'true', 'true']);
    expect(document.activeElement).toBe(go);
    expect($('#sheet .addr-live').textContent).toBe('');
    await tap(go);
    expect(asked).toEqual(['애월']);
    answerNow();
    await wait();
    expect(document.activeElement).toBe($('#sheet .addr-go'));
    expect([go.getAttribute('aria-disabled'), go.getAttribute('aria-busy')]).toEqual([null, null]);
    expect($('#sheet .addr-live').textContent).toBe('1곳 찾았어요.');
  });

  it('40 characters counted as the server does: an emoji is one, never cut in half', async () => {
    const { asked } = mount({ dest: 'jeju' });
    await wait();
    await tap('#basis');
    await search(`${'가'.repeat(39)}😀😀`);
    expect(asked).toEqual([`${'가'.repeat(39)}😀`]);
  });

  it('Esc in the search box with words in it empties the box and keeps the sheet; Esc again closes it', async () => {
    mount({ dest: 'jeju' });
    await wait();
    await tap('#basis');
    const q = $<HTMLInputElement>('#sheet .addr-q');
    q.value = '애월';
    q.focus();
    q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flush();
    expect([q.value, current().state().overlay, document.activeElement === q]).toEqual(['', 'basis', true]);
    q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait();
    expect(current().state().overlay).toBeNull();
  });

  // 카카오 로컬의 주소·좌표는 실시간으로만 (ADR-0103 Amendment 2): with no public point, Kakao's for this visit and nothing saved
  it.each<[string, Pub]>([
    ['no key for the public API (503)', 503],
    ['not found there (404)', 404],
    ['its point more than 1 km from Kakao\'s', 'far'],
  ])('%s: Kakao\'s point is the 숙소 for this visit only — nothing saved, the sheet stays and says so', async (_, pub) => {
    localStorage.setItem(KEYS.basis, JSON.stringify('gps'));
    const { picked } = mount({ dest: 'jeju', pub, answer: { status: 200, hits: [이름만] } });
    await wait();
    await tap('#basis');
    await search('한림리 1');
    await tap('#sheet [data-hit="0"]');
    await wait();
    expect(picked).toEqual([이름만.name]); // no address line: the name, which is the address
    expect(current().state()).toMatchObject({ dest: 'jeju', basis: 'stay', overlay: 'basis', stay: { lat: 이름만.lat, lng: 이름만.lng, source: 'addr' } });
    expect($('#sheet .addr-err').textContent).toBe('이번에만 이곳을 숙소로 써요. 주소를 확인하지 못해 저장하지 않았어요.');
    expect($('#sheet .addr-live').textContent).toBe('이번에만 이곳을 숙소로 써요. 주소를 확인하지 못해 저장하지 않았어요.');
    expect($('#sheet [data-basis="stay"]').getAttribute('aria-pressed')).toBe('true');
    expect($$('#sheet .hit-row')).toHaveLength(0);
    expect(localStorage.getItem(KEYS.stay)).toBeNull();
    expect(localStorage.getItem(KEYS.basis)).toBe('"gps"');
    expect(Object.values({ ...localStorage }).some((v) => v.includes(String(이름만.lat)))).toBe(false);
  });

  it('검색 again while a picked answer is being found (n-b): nothing is asked, and the answer lands as it would', async () => {
    let answerNow = () => undefined as void;
    const pubHold = new Promise<void>((r) => (answerNow = r));
    const { asked, picked } = mount({ dest: 'jeju', pubHold, answer: { status: 200, hits: [애월, 해운대] } });
    await wait();
    await tap('#basis');
    await search('애월');
    await tap('#sheet [data-hit="0"]');
    await wait();
    expect(picked).toEqual([애월.addr]);
    await search('해운대');
    await tap('#sheet .addr-go');
    expect(asked).toEqual(['애월']);
    answerNow();
    await wait();
    expect(current().state()).toMatchObject({ dest: 'jeju', basis: 'stay', overlay: null, stay: { lat: north(애월), source: 'addr' } });
  });

  it("an answer outside Jeju with the 자동 지역's part not coming: 「검색하지 못했어요…」, not 「장소 자료가 없어요」; the basis unchanged", async () => {
    mount({ dest: 'jeju', answer: { status: 200, hits: [해운대] } });
    await wait();
    await tap('#basis');
    await search('해운대');
    nationFails.on = true;
    try {
      await tap('#sheet [data-hit="0"]');
      await wait();
    } finally {
      nationFails.on = false;
    }
    expect($('#sheet .addr-err').textContent).toBe('검색하지 못했어요. 연결을 확인하고 다시 검색해 주세요.');
    expect(current().state()).toMatchObject({ dest: 'jeju', basis: 'gps', overlay: 'basis' });
    expect($$('#sheet .hit-row')).toHaveLength(1);
  });
});
