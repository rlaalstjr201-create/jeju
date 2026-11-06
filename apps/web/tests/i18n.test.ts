// @vitest-environment jsdom
// ADR-0093 (specs/i18n.md): the language chosen before the app runs, the other languages' tables, and a page with no
// Korean words left once one of them is in.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import { NATION_COPY } from '../src/region/nation-part';
import { COPY, MOOD_LABEL, PLACE } from '../src/copy';
import { DAY_TEXT, longDay, shortDay } from '../src/dates';
import { apply, localDays, type Lang } from '../src/i18n/apply';
import { EN } from '../src/i18n/en';
import { JA } from '../src/i18n/ja';
import { ZH } from '../src/i18n/zh-Hans';
import { fileSpots } from './fixtures';
import { $, $$, flush, html, render, reset, tap } from './harness';

const LANGS: [string, Lang][] = [
  ['en', EN],
  ['zh-Hans', ZH],
  ['ja', JA],
];
const HANGUL = /[가-힣]/;

/** index.html's first script, run with this address, kept value and browser languages: the <html> it leaves. */
function choose(search: string, kept: string | null, languages: string[]) {
  const script = html.match(/<script>(\(function\(w,h\)[\s\S]*?)<\/script>/)![1];
  const store = new Map<string, string>(kept ? [['lang', kept]] : []);
  const h = { lang: 'ko', className: '' };
  const localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
  const window: { localStorage: typeof localStorage; __suggest?: string } = { localStorage };
  runInNewContext(script, { window, document: { documentElement: h }, location: { search }, navigator: { languages, language: languages[0] } });
  return { lang: h.lang, hidden: h.className.includes('l10n'), kept: store.get('lang') ?? null, suggest: window.__suggest ?? null };
}

describe('the language (ADR-0093 2, Amendment 7)', () => {
  it("the browser's languages never switch the page (a crawler without them gets Korean); they only pick the one language offered", () => {
    const korean = { lang: 'ko', hidden: false, kept: null };
    expect(choose('', null, ['ko-KR', 'en-US'])).toEqual({ ...korean, suggest: null });
    expect(choose('', null, ['en-KR', 'en'])).toEqual({ ...korean, suggest: null });
    expect(choose('', null, ['en-US', 'ko'])).toEqual({ ...korean, suggest: null });
    expect(choose('', null, ['en-US'])).toEqual({ ...korean, suggest: 'en' });
    expect(choose('', null, ['zh-CN', 'en'])).toEqual({ ...korean, suggest: 'zh-Hans' });
    expect(choose('', null, ['zh-TW'])).toEqual({ ...korean, suggest: 'zh-Hans' });
    expect(choose('', null, ['ja-JP'])).toEqual({ ...korean, suggest: 'ja' });
    expect(choose('', null, ['fr-FR', 'ja'])).toEqual({ ...korean, suggest: 'ja' });
    expect(choose('', null, ['fr-FR'])).toEqual({ ...korean, suggest: 'en' });
    expect(choose('', null, [])).toEqual({ ...korean, suggest: null });
    // a choice already made (× keeps Korean) is never asked again
    expect(choose('', 'ko', ['en-US'])).toEqual({ ...korean, kept: 'ko', suggest: null });
  });

  it('?lang= first, and it is kept on this device; then the kept one; a value it does not know is ignored', () => {
    expect(choose('?lang=ja', null, ['ko-KR'])).toEqual({ lang: 'ja', hidden: true, kept: 'ja', suggest: null });
    for (const zh of ['zh', 'zh-CN', 'zh-SG', 'zh-Hans']) expect(choose(`?lang=${zh}`, null, ['ko-KR']).kept).toBe('zh-Hans');
    expect(choose('?lang=zh-TW', null, ['ko-KR']).lang).toBe('ko');
    expect(choose('?mood=walk&lang=zh-Hans', null, ['ko-KR']).lang).toBe('zh-Hans');
    expect(choose('?lang=ko', 'en', ['en-US'])).toEqual({ lang: 'ko', hidden: false, kept: 'ko', suggest: null });
    expect(choose('', 'en', ['ko-KR']).lang).toBe('en');
    expect(choose('?lang=fr', null, ['ko-KR'])).toEqual({ lang: 'ko', hidden: false, kept: null, suggest: null });
  });

  it('Korean leaves the page as it is: no other lang, nothing hidden', () => {
    expect(choose('', null, ['ko-KR'])).toEqual({ lang: 'ko', hidden: false, kept: null, suggest: null });
  });
});

describe('the tables (ADR-0093 5)', () => {
  it("every language fills every word of the Korean tables, and none is left in Korean", () => {
    for (const [, w] of LANGS) {
      expect(Object.keys(w.copy).sort()).toEqual(Object.keys(COPY).sort());
      expect(Object.keys(w.mood).sort()).toEqual(Object.keys(MOOD_LABEL).sort());
      // the words themselves (the keys are the Korean tables' own: area names, islands)
      const values = (v: unknown): string[] => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(values) : []);
      expect(values(w).filter((s) => HANGUL.test(s))).toEqual([]);
    }
  });

  it('자동 지역 (plans/nationwide-app.md 8): its words in every language, every 시도 of the index named', () => {
    const ix = JSON.parse(readFileSync(resolve(__dirname, '../data/nation/index.json'), 'utf8')) as { sido: { c: string }[]; sgg: { s: string }[] };
    const sido = ix.sido.filter((x) => ix.sgg.some((g) => g.s === x.c)).map((x) => x.c).sort();
    for (const [, w] of LANGS) {
      expect(Object.keys(w.nation).sort()).toEqual(Object.keys(NATION_COPY).sort());
      expect(Object.keys(w.nation.sido).sort()).toEqual(sido);
      expect(w.nation.koNames).not.toBe('');
    }
  });

  it("every page word lands on index.html, the same keys in every language", () => {
    document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
    const keys = Object.keys(EN.page).sort();
    for (const [, w] of LANGS) {
      expect(Object.keys(w.page).sort()).toEqual(keys);
      for (const k of keys) expect(document.querySelectorAll(k.split('@')[0]).length, k).toBeGreaterThan(0);
    }
  });

  it("dates and clock times: the phone's own locale format, always in Korea time; Korean as before (owner, 2026-10-17)", () => {
    const day = '2026-10-17';
    const at = 17 * 60 + 58;
    expect(DAY_TEXT.clock(at, day)).toBe('17:58');
    expect(longDay(day)).toBe('10월 17일 토요일');
    expect(shortDay(day)).toBe('10월 17일');
    const us = localDays('en', ['en-US']);
    expect(us.clock(at, day)).toMatch(/^5:58\sPM$/);
    expect(us.long(10, 17, 6, day)).toBe('Sat, Oct 17');
    const gb = localDays('en', ['en-GB', 'fr-FR']);
    expect(gb.clock(at, day)).toBe('17:58');
    expect(gb.long(10, 17, 6, day)).toBe('Sat 17 Oct');
    expect(gb.short(10, 17, day)).toBe('17 Oct');
    // a browser in another language than the page: the page's own language
    expect(localDays('en', ['fr-FR']).clock(at, day)).toMatch(/^5:58\sPM$/);
    expect(localDays('ja', ['ja-JP']).clock(at, day)).toBe('17:58');
    expect(localDays('ja', ['ja-JP']).long(10, 17, 6, day)).toBe('10月17日(土)');
    expect(localDays('zh-Hans', ['zh-CN']).long(10, 17, 6, day)).toBe('10月17日周六');
    // Taiwan's locale is not taken for the Simplified page
    expect(localDays('zh-Hans', ['zh-TW']).long(10, 17, 6, day)).toBe('10月17日周六');
    // Korea time whatever the machine's zone: 00:30 in Jeju on the 17th, the 17th
    expect(gb.clock(30, day)).toBe('0:30');
    expect(gb.short(10, 17, day)).toBe('17 Oct');
  });

  it('their words read in their own order (examples)', () => {
    expect(EN.travel.drive('From here', '12 min')).toBe('From here, about 12 min by car');
    expect(EN.travel.tag.exec('From here, about 12 min by car')![0]).toBe('about 12 min by car');
    expect(JA.travel.drive('ここから', '12分')).toBe('ここから車で約12分');
    expect(ZH.travel.walk('从住处', '8分钟')).toBe('从住处步行约8分钟');
    const rule = { days: [5, 10, 15, 20, 25, 30], label: '5·10일' };
    expect(EN.market.days(rule)).toBe('Opens on dates ending in 5 or 0');
    expect(JA.market.days(rule)).toBe('市の日：5と0のつく日');
    expect(ZH.market.days(rule)).toBe('逢5、10日开市');
  });
});

afterEach(reset);

describe('a page in another language (ADR-0093)', () => {
  for (const [lang, w] of LANGS) {
    it(`${lang}: the first screen, a mood's cards, the basis sheet and the saved list have no Korean UI words; the place texts are its own`, async () => {
      const spot = fileSpots.find((s) => !s.hide)!;
      const places = Object.fromEntries(fileSpots.map((s) => [s.id, [`${lang} name`, `${lang} text`]]));
      // the tables first (as main.ts does before the mount), then the page's own words on the fresh page
      await apply(lang, w, document, Promise.resolve(places));
      render();
      await apply(lang, w, document, Promise.resolve(places));
      await flush();
      // visible words only: not <noscript>, not the other languages' own names
      const words = () =>
        [...document.querySelectorAll('#app *:not(noscript):not(script), #sheet *')]
          .flatMap((e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent!.trim()))
          .concat($$('[aria-label]').map((e) => e.getAttribute('aria-label')!))
          .filter((t) => HANGUL.test(t) && t !== '한국어');
      // the place names are translated too (Amendment 2): no Korean at all, accessible names included
      const ui = words;
      expect(ui()).toEqual([]);
      await tap('[data-mood="walk"]');
      await flush();
      expect($$('#cards .card').length).toBe(3);
      expect(ui()).toEqual([]);
      await tap('#basis');
      expect(ui()).toEqual([]);
      await tap('#sheet [data-action="close"]');
      await tap('#saved');
      expect(ui()).toEqual([]);
      expect(PLACE.reason(spot)).toBe(`${lang} text`);
      expect(document.title).toBe(w.title);
      expect($('.langs [aria-current="true"]').getAttribute('hreflang')).toBe(lang);
    });
  }
});
