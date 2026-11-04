// @vitest-environment jsdom
// 오늘 근처에서 하는 것 (ADR-0112): 서울's home, 지금, with a basis — the list asked for once (no position in the request),
// at most 2 on the home with their why line, up to 6 in the sheet; nothing elsewhere, on a 204, for another day or in date
// mode. With the switch on only (npm run test:nation): 서울 opens with the 자동 지역's part.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cultureItems, type SeoulRow } from '../functions/_lib/culture-filter';
import { DEST } from '../src/dest';
import type { Fetch } from '../src/effects';
import { normalizeNation } from '../src/nation';
import { NATION, loadNation } from '../src/release';
import { KEYS } from '../src/store';
import rows from './fixtures/seoul-culture-20261104.json';
import { fileSpots } from './fixtures';
import { $, $$, current, flush, render, reset, settle, tap } from './harness';

const DAY = '2026-11-04';
const items = cultureItems(rows as SeoulRow[], DAY);
const nationFile = (f: string) => readFileSync(resolve(__dirname, `../data/nation/${f}.json`), 'utf8');
const seoulRaw = JSON.parse(readFileSync(resolve(__dirname, '../data/seoul/spots-seoul.json'), 'utf8')) as Record<string, unknown>[];
const 경복궁 = { lat: 37.5796, lng: 126.977 };
const 제주시 = { lat: 33.4996, lng: 126.5312 };
const at1400 = () => new Date(`${DAY}T14:00:00+09:00`);

/** /api/culture answers `culture` (a status, or the body); everything else is a 204. Remembers what it was asked. */
function cultureFetch(culture: number | { day: string; items: unknown[] }) {
  const urls: string[] = [];
  const f: Fetch = async (url) => {
    urls.push(url);
    if (!url.startsWith('/api/culture')) return { ok: false, status: 204, json: async () => null };
    if (typeof culture === 'number') return { ok: culture === 200, status: culture, json: async () => null };
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(culture)) };
  };
  return { f, urls, asked: () => urls.filter((u) => u.startsWith('/api/culture')) };
}
const wait = async () => {
  for (let i = 0; i < 6; i++) await flush();
  await settle();
};
function mount(fetch: Fetch, o: { dest?: string; at?: { lat: number; lng: number }; when?: string } = {}) {
  localStorage.setItem(KEYS.dest, JSON.stringify(o.dest ?? 'seoul'));
  if (o.when) localStorage.setItem(KEYS.when, JSON.stringify(o.when));
  render({
    loadSpots: (d, sgg) => Promise.resolve(d === 'nation' ? normalizeNation(JSON.parse(nationFile('11')), [...DEST.gangwon.sgg!, ...DEST.seoul.sgg!], sgg) : d === 'seoul' ? seoulRaw : fileSpots),
    locate: () => Promise.resolve(o.at ?? 경복궁),
    geoPermission: async () => 'granted',
    today: at1400,
    fetch,
  });
}
const block = () => $('#culture');
const picks = (box: Element) => [...box.querySelectorAll<HTMLAnchorElement>('.cult a.mk')];

describe.runIf(NATION)('오늘 근처에서 하는 것 (switch on)', () => {
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

  it('서울 at 14:00: one ask without a position; the home shows at most 2 with why lines, the sheet up to 6', async () => {
    const c = cultureFetch({ day: DAY, items });
    mount(c.f);
    await wait();
    expect(current().state()).toMatchObject({ dest: 'seoul', view: 'home', when: 'now' });
    expect(c.asked()).toEqual(['/api/culture?city=seoul']);
    // no coordinates, no 구 in the request
    expect(c.asked()[0]).not.toMatch(/\d+\.\d+|lat|lng|grid|sgg|gu=/);
    const home = picks(block());
    expect(home.length).toBeGreaterThan(0);
    expect(home.length).toBeLessThanOrEqual(2);
    for (const a of home) {
      expect(a.querySelector('.nm')!.textContent).not.toBe('');
      const metas = [...a.querySelectorAll('.meta')].map((m) => m.textContent!);
      expect(metas).toHaveLength(2);
      expect(metas[1]).toMatch(/^(걸어서|차로) 약 \d+분$/);
      expect(a.getAttribute('href')).toMatch(/^https:\/\/map\.naver\.com\/p\/directions\/-\//);
      expect(a.getAttribute('href')).not.toContain('126.977,37.5796');
    }
    expect(home[0].querySelector('.meta')!.textContent).toMatch(/요일까지|오늘|지금 열림|시작|무료/);
    expect(block().querySelector('h2')!.textContent).toBe('오늘 근처에서 하는 것');
    expect(block().querySelector('.cult-src')!.textContent).toBe('정보: 서울시 문화행사(서울 열린데이터광장)');

    await tap('#culture [data-action="culture-more"]');
    expect(current().state().overlay).toBe('culture');
    const sheet = $('#sheet .sheet');
    expect(sheet.querySelector('h2')!.textContent).toBe('오늘 근처에서 하는 것');
    const list = picks(sheet);
    expect(list.length).toBeGreaterThan(home.length);
    expect(list.length).toBeLessThanOrEqual(6);
    for (const a of list) expect(a.querySelectorAll('.meta').length).toBeGreaterThanOrEqual(1);
    expect(list.slice(0, home.length).map((a) => a.querySelector('.nm')!.textContent)).toEqual(home.map((a) => a.querySelector('.nm')!.textContent));
    await tap('#sheet [data-action="close"]');
    await wait();
    expect(current().state().overlay).toBeNull();
    // asked once a day: other draws do not ask again
    document.dispatchEvent(new Event('visibilitychange'));
    await wait();
    expect(c.asked()).toHaveLength(1);
  });

  it('not 서울 (제주): never asked, no block', async () => {
    const c = cultureFetch({ day: DAY, items });
    mount(c.f, { dest: 'jeju', at: 제주시 });
    await wait();
    expect(current().state().dest).toBe('jeju');
    expect(c.asked()).toEqual([]);
    expect(block()).toBeNull();
  });

  it('a 204: no block', async () => {
    const c = cultureFetch(204);
    mount(c.f);
    await wait();
    expect(c.asked()).toHaveLength(1);
    expect(block()).toBeNull();
    expect($$('.cult')).toEqual([]);
  });

  it("another day's list: no block", async () => {
    const c = cultureFetch({ day: '2026-11-03', items });
    mount(c.f);
    await wait();
    expect(c.asked()).toHaveLength(1);
    expect(block()).toBeNull();
  });

  it('date mode (내일): not asked, no block', async () => {
    const c = cultureFetch({ day: DAY, items });
    mount(c.f, { when: '2026-11-05' });
    await wait();
    expect(current().state().when).toBe('2026-11-05');
    expect(c.asked()).toEqual([]);
    expect(block()).toBeNull();
  });

  it('back to a day picked after the block was up: the block goes', async () => {
    const c = cultureFetch({ day: DAY, items });
    mount(c.f);
    await wait();
    expect(block()).not.toBeNull();
    await tap('#basis');
    await tap('#sheet [data-when="2026-11-05"]');
    await wait();
    expect(current().state().when).toBe('2026-11-05');
    expect(block()).toBeNull();
  });
});
