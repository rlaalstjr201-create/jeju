// 시작 화면 (specs/busan.md 1.1·1.2, ADR-0096, plans/busan.md S5): index.html's inline decision and cover, run in a page of
// their own (jsdom, scripts on), and src/start.ts taking the cover over.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import type { GeoPermission } from '../src/effects';
import { LocateError } from '../src/effects';
import type { Point } from '../src/pick';
import { BUSAN, NATION, loadBusan, loadNation } from '../src/release';
import { mountStart } from '../src/start';
import type { NoOrigin } from '../src/types';

const source = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
// the switched-on build's page: the blocks kept, the markers gone (vite.config.ts busanBlock); no app script
const page = source.replace(/<!--\/?busan-->/g, '').replace(/<script type="module"[^>]*><\/script>/, '');
const HANGUL = /[가-힣]/;

interface Opened {
  dom: JSDOM;
  w: Window & { __dest?: string; __destBy?: string; __ycT?: string[]; __startPick?: string; __startTap?: number };
  doc: Document;
}
function open(path = '/', storage: Record<string, unknown> = {}, referrer?: string): Opened {
  const url = `https://yeochana.test${path}`;
  // storage first (same origin), then the page itself
  const seed = new JSDOM('', { url });
  seed.window.localStorage.clear();
  for (const [k, v] of Object.entries(storage)) seed.window.localStorage.setItem(k, JSON.stringify(v));
  const kept = { ...seed.window.localStorage };
  const dom = new JSDOM(page, {
    url,
    referrer,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(win: Window) {
      win.localStorage.clear();
      for (const [k, v] of Object.entries(kept)) win.localStorage.setItem(k, v as string);
    },
  });
  return { dom, w: dom.window as unknown as Opened['w'], doc: dom.window.document };
}

describe('1.1 여행지를 정하는 순서 (index.html 첫 인라인)', () => {
  const cases: [string, string, Record<string, unknown>, string | undefined, string | null, string | null][] = [
    ['새 브라우저', '/', {}, undefined, null, null],
    ['언어만 바꾼 링크', '/?lang=en', {}, undefined, null, null],
    ['부산 동네 링크', '/?area=gwangalli', {}, undefined, 'busan', 'link'],
    ['제주 동네 링크', '/?area=aewol', {}, undefined, 'jeju', 'link'],
    ['?area=here (m8)', '/?area=here', {}, undefined, 'jeju', 'link'],
    ['부산 숙소 링크(후보, 앱이 확정)', '/?stay=35.1587,129.1604&src=demo', {}, undefined, 'busan', 'link'],
    ['제주 숙소 링크', '/?stay=33.45,126.5', {}, undefined, 'jeju', 'link'],
    ['키만 있는 링크', '/?mood=walk', {}, undefined, 'jeju', 'link'],
    ['/jeju/** 에서 넘어옴', '/', {}, 'https://yeochana.test/jeju/aewol/', 'jeju', 'link'],
    ['다른 사이트에서 넘어옴', '/', {}, 'https://search.example/?q=x', null, null],
    ['기억한 여행지', '/', { 'jeju.dest': 'busan' }, undefined, 'busan', 'kept'],
    ['이전 기기(저장만)', '/', { 'jeju.saved.v2': [] }, undefined, 'jeju', 'old'],
    ['링크가 기억보다 먼저', '/?area=haeundae', { 'jeju.dest': 'jeju' }, undefined, 'busan', 'link'],
    ['브라우저로 열기의 여행지(n4)', '/?lang=en&dest=busan', {}, undefined, 'busan', 'link'],
    ['브라우저로 열기의 여행지, 제주', '/?dest=jeju', {}, undefined, 'jeju', 'link'],
    // plans/nationwide-app.md 4: any short word goes to the app, which checks it against its DEST (an unknown one: Jeju)
    ['모르는 여행지 값', '/?dest=seoul', {}, undefined, 'seoul', 'link'],
    ['자동 지역 링크', '/?dest=nation&area=51150', {}, undefined, 'nation', 'link'],
    ['기억한 자동 지역', '/', { 'jeju.dest': 'nation' }, undefined, 'nation', 'kept'],
    ['기억값이 낱말이 아님(그 키가 있으니 이전 기기)', '/', { 'jeju.dest': 'x1' }, undefined, 'jeju', 'old'],
  ];
  for (const [name, path, storage, referrer, dest, by] of cases)
    it(`${name}: ${dest ?? '시작 화면'}`, () => {
      const { w, doc } = open(path, storage, referrer);
      expect([w.__dest ?? null, w.__destBy ?? null]).toEqual([dest, by]);
      expect(doc.documentElement.classList.contains('yc-start')).toBe(dest === null);
      expect(!!doc.getElementById('ycStart')).toBe(dest === null);
    });
});

describe('1.2 시작 화면 (index.html 바디 인라인)', () => {
  it('a dialog over the home, the big button focused; the home stays in the DOM, nothing asked for', () => {
    const { doc } = open('/');
    const box = doc.getElementById('ycStart')!;
    expect(box.getAttribute('role')).toBe('dialog');
    expect(box.getAttribute('aria-modal')).toBe('true');
    expect(doc.getElementById(box.getAttribute('aria-labelledby')!)!.textContent).toBe('어디서 여행 중이에요?');
    expect(doc.activeElement?.id).toBe('ycGps');
    expect(box.textContent).toContain('내 위치로 시작하기');
    expect(box.textContent).toContain('누르면 위치를 물어요. 위치는 기기 밖으로 보내지 않아요.');
    expect([...box.querySelectorAll('[data-dest]')].map((b) => b.textContent)).toEqual(['제주', '부산']);
    expect(doc.querySelector('#home h1')?.textContent).toBe('지금 뭐 하고 싶어요?');
    expect(doc.body.firstElementChild).toBe(box);
    expect(doc.getElementById('app')?.hidden).toBe(false);
  });
  it('a destination pressed before the app runs is kept (jeju.dest, __startPick) and said (yc:dest)', () => {
    const { w, doc } = open('/');
    let heard = '';
    doc.addEventListener('yc:dest', (e) => (heard = (e as CustomEvent<string>).detail));
    (doc.querySelector('[data-dest="busan"]') as HTMLElement).click();
    expect([w.__startPick, heard, w.localStorage.getItem('jeju.dest')]).toEqual(['busan', 'busan', '"busan"']);
    (doc.getElementById('ycGps') as HTMLElement).click();
    expect(w.__startTap).toBe(1);
  });
  it('the big button says 위치 확인 중… at once when pressed before the app runs (n3), and takes no second press', () => {
    const { w, doc } = open('/');
    let heard = 0;
    doc.addEventListener('yc:start-gps', () => heard++);
    const big = doc.getElementById('ycGps') as HTMLButtonElement;
    big.click();
    big.click();
    expect([big.textContent, big.disabled, w.__startTap, heard]).toEqual(['위치 확인 중…', true, 1, 1]);
  });
  for (const lang of ['en', 'zh-Hans', 'ja'])
    it(`${lang}: the cover in that language, no Korean (B13)`, () => {
      const { doc } = open(`/?lang=${lang}`);
      expect(doc.documentElement.lang).toBe(lang);
      const box = doc.getElementById('ycStart')!;
      const words = [box.textContent, ...(doc.defaultView as Opened['w']).__ycT!].join(' ');
      expect(HANGUL.test(words)).toBe(false);
    });
  it('the page without the switch has neither script (the build takes the blocks out)', () => {
    const off = source.replace(/<!--busan-->[\s\S]*?<!--\/busan-->/g, '');
    expect(off).not.toMatch(/yc-start|ycStart|jeju\.dest/);
  });
});

/** src/start.ts on a page that shows the cover */
function started(o: { perm?: GeoPermission; at?: Point | NoOrigin; hold?: boolean; early?: 'jeju' | 'busan' | 'gps' }) {
  const { dom, w, doc } = open('/');
  if (o.early === 'gps') w.__startTap = 1;
  else if (o.early) w.__startPick = o.early;
  let release: () => void = () => undefined;
  const calls = { locate: 0 };
  const chosen: unknown[] = [];
  const ctl = new (dom.window as unknown as typeof globalThis).AbortController();
  const screen = mountStart(doc, {
    signal: ctl.signal,
    geo: {
      geoPermission: () => Promise.resolve(o.perm ?? 'prompt'),
      locate: () => {
        calls.locate++;
        return new Promise<Point>((ok, no) => {
          const go = () => (typeof o.at === 'string' || !o.at ? no(new LocateError((o.at as NoOrigin) ?? 'unavailable')) : ok(o.at));
          if (o.hold) release = go;
          else go();
        });
      },
    },
    choose: (...a) => chosen.push(a),
  });
  return { w, doc, screen: screen!, calls, chosen, release: () => release() };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const 성산 = { lat: 33.4584, lng: 126.9426 };
const 해운대 = { lat: 35.1587, lng: 129.1604 };

describe('start.ts', () => {
  it('prompt: nothing read on its own; the big button reads, 위치 확인 중… meanwhile, then that destination (both buttons stay)', async () => {
    const t = started({ at: 성산, hold: true });
    await tick();
    expect(t.calls.locate).toBe(0);
    (t.doc.getElementById('ycGps') as HTMLElement).click();
    await tick();
    expect(t.screen.state()).toBe('locating');
    const big = t.doc.getElementById('ycGps') as HTMLButtonElement;
    expect([big.textContent, big.disabled]).toEqual(['위치 확인 중…', true]);
    expect((t.doc.querySelector('[data-dest="busan"]') as HTMLButtonElement).disabled).toBe(false);
    t.release();
    await tick();
    expect(t.chosen).toEqual([['jeju', 'gps', null, 성산]]);
    expect(t.doc.getElementById('ycStart')).toBeNull();
    expect(t.doc.documentElement.classList.contains('yc-start')).toBe(false);
  });
  it('M4 granted: read without a press, the cover up all the while; inside → chosen, a failure → the first state, outside → its words', async () => {
    const ok = started({ perm: 'granted', at: 성산, hold: true });
    await tick();
    expect([ok.calls.locate, ok.screen.state(), !!ok.doc.getElementById('ycStart')]).toEqual([1, 'locating', true]);
    ok.release();
    await tick();
    expect(ok.chosen).toEqual([['jeju', 'gps', null, 성산]]);
    const fail = started({ perm: 'granted', at: 'unavailable' });
    await tick();
    await tick();
    expect([fail.screen.state(), fail.chosen]).toEqual(['start', []]);
    const out = started({ perm: 'granted', at: 'outside' });
    await tick();
    await tick();
    expect(out.screen.state()).toBe('outside');
    expect(out.doc.getElementById('ycMsg')!.textContent).toBe(NATION ? '지금은 한국 밖이에요. 여행지를 골라 주세요.' : '지금은 제주·부산 밖이에요. 여행지를 골라 주세요.');
  });
  it('denied, not found (다시 시도), outside: the words in the big button’s place; a destination then chosen says it was denied', async () => {
    const d = started({ at: 'denied' });
    (d.doc.getElementById('ycGps') as HTMLElement).click();
    await tick();
    await tick();
    expect(d.screen.state()).toBe('denied');
    expect((d.doc.getElementById('ycGps') as HTMLElement).hidden).toBe(true);
    expect(d.doc.getElementById('ycMsg')!.textContent).toBe('위치를 쓸 수 없어요. 여행지를 골라 주세요.');
    expect((d.doc.getElementById('ycRetry') as HTMLElement).hidden).toBe(true);
    (d.doc.querySelector('[data-dest="busan"]') as HTMLElement).click();
    expect(d.chosen).toEqual([['busan', 'pick', 'denied']]);
    const u = started({ at: 'unavailable' });
    (u.doc.getElementById('ycGps') as HTMLElement).click();
    await tick();
    await tick();
    expect(u.doc.getElementById('ycMsg')!.textContent).toBe('위치를 찾지 못했어요. 여행지를 골라 주세요.');
    expect((u.doc.getElementById('ycRetry') as HTMLElement).hidden).toBe(false);
    expect(u.doc.activeElement?.id).toBe('ycRetry');
  });
  it("the reasons come in the page's language (with Busan's part, not in the inline table)", async () => {
    const { dom, doc } = open('/?lang=ja');
    const ctl = new (dom.window as unknown as typeof globalThis).AbortController();
    mountStart(doc, { signal: ctl.signal, geo: { geoPermission: () => Promise.resolve('prompt'), locate: () => Promise.reject(new LocateError('outside')) }, choose: () => undefined });
    (doc.getElementById('ycGps') as HTMLElement).click();
    await tick();
    await tick();
    expect(doc.getElementById('ycMsg')!.textContent).toBe(NATION ? 'いまは韓国の外にいます。旅行先を選んでください。' : 'いまは済州・釜山の外にいます。旅行先を選んでください。');
  });
  it('a press before the app ran is carried out at mount', async () => {
    expect(started({ early: 'jeju' }).chosen).toEqual([['jeju', 'pick', null]]);
    const g = started({ early: 'gps', at: 성산 });
    await tick();
    await tick();
    expect(g.chosen).toEqual([['jeju', 'gps', null, 성산]]);
  });
  it.runIf(BUSAN)('switch on: a position in Busan chooses Busan', async () => {
    await loadBusan(); // main.ts asks for Busan's part before the mount while the 시작 화면 is up
    const t = started({ at: 해운대 });
    (t.doc.getElementById('ycGps') as HTMLElement).click();
    await tick();
    await tick();
    expect(t.chosen).toEqual([['busan', 'gps', null, 해운대]]);
  });
  it.runIf(NATION)('자동 지역: 인기 칸 6 under the two; one pressed chooses its 시군구; 다른 곳 → 시도 → 시군구, 뒤로 back', async () => {
    vi.stubGlobal('fetch', (url: string) => {
      const m = /^\/nation\/(\w+)\.json\?v=\w+$/.exec(url);
      return Promise.resolve(m ? { ok: true, json: () => Promise.resolve(JSON.parse(readFileSync(resolve(__dirname, `../data/nation/${m[1]}.json`), 'utf8'))) } : { ok: false, status: 404 });
    });
    expect(await loadNation()).toBe(true); // main.ts asks for it before the mount while the 시작 화면 is up
    vi.unstubAllGlobals();
    const words = (d: Document) => [...d.querySelectorAll('#ycStart button')].filter((b) => !b.closest('[hidden]') && !(b as HTMLElement).hidden).map((b) => b.textContent);
    const t = started({});
    expect(words(t.doc)).toEqual(['내 위치로 시작하기', '제주', '부산', '서울', '강릉', '경주', '전주', '여수', '속초', '다른 곳']);
    ([...t.doc.querySelectorAll('#ycStart button')].find((b) => b.textContent === '강릉') as HTMLElement).click();
    expect(t.chosen).toEqual([['nation', 'pick', null, undefined, '51150']]);
    expect(t.doc.getElementById('ycStart')).toBeNull();
    const o = started({});
    const press = (w: string) => ([...o.doc.querySelectorAll('#ycStart button')].find((b) => b.textContent === w && !b.closest('[hidden]')) as HTMLElement).click();
    press('다른 곳');
    await tick();
    await tick();
    expect(words(o.doc)).toContain('강원');
    expect(words(o.doc)).not.toContain('부산');
    expect(words(o.doc)[0]).toBe('뒤로');
    press('강원');
    expect(words(o.doc)).toContain('속초시');
    press('뒤로');
    press('뒤로');
    expect(words(o.doc)).toContain('내 위치로 시작하기');
    press('다른 곳');
    await tick();
    await tick();
    press('강원');
    press('속초시');
    expect(o.chosen).toEqual([['nation', 'pick', null, undefined, '51210']]);
    expect(o.w.__startTap).toBeUndefined(); // the cover's own handler did not take these for the big button
  });
  it.runIf(NATION)('자동 지역 in another language: the 인기 칸 in official forms, no Korean on the cover (B13); each still its 시군구', () => {
    const want: Record<string, string[]> = { en: ['Seoul', 'Gangneung', 'Gyeongju', 'Jeonju', 'Yeosu', 'Sokcho'], 'zh-Hans': ['首尔', '江陵', '庆州', '全州', '丽水', '束草'], ja: ['ソウル', '江陵', '慶州', '全州', '麗水', '束草'] };
    for (const [lang, names] of Object.entries(want)) {
      const { dom, doc } = open(`/?lang=${lang}`);
      const chosen: unknown[] = [];
      const ctl = new (dom.window as unknown as typeof globalThis).AbortController();
      mountStart(doc, { signal: ctl.signal, geo: { geoPermission: () => Promise.resolve('prompt'), locate: () => Promise.reject(new LocateError('outside')) }, choose: (...a) => chosen.push(a) });
      const tiles = [...doc.querySelectorAll<HTMLElement>('#ycStart .yc-pop button')];
      expect(tiles.map((b) => b.textContent)).toEqual(names);
      expect(tiles.every((b) => !b.lang)).toBe(true);
      expect(doc.getElementById('ycStart')!.textContent).not.toMatch(/[가-힣]/);
      tiles[1].click();
      expect(chosen).toEqual([['nation', 'pick', null, undefined, '51150']]);
    }
  });
});
