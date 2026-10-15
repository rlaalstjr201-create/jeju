// Shared jsdom harness: static index.html + mountApp with the real spots.json.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mountApp, type App, type Deps } from '../src/app';
import { dayOf } from '../src/dates';
import { pickCards, type Button, type Point, type Reach, type Tab } from '../src/pick';
import { ORIGINS, fileSpots, realSpots } from './fixtures';

export const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
export const css = readFileSync(resolve(__dirname, '../src/style.css'), 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>')).replace(/<script[\s\S]*?<\/script>/g, '');

export const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T;
export const $$ = (s: string) => [...document.querySelectorAll<HTMLElement>(s)];
export const flush = () => new Promise((r) => setTimeout(r, 0));
/** After the next frame is painted (jsdom runs frame callbacks on a timer): what the app does once a frame is drawn
 * (render.ts afterPaint) has run by then. */
export const painted = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));
export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Let a history.back() the app made land (jsdom delivers popstate a few tasks later). */
export const settle = async () => {
  for (let i = 0; i < 6; i++) await wait(5);
};

let app: App | null = null;
export let clock = 0;
export const advance = (ms = 1000) => (clock += ms);

// jsdom has no layout: scrolling is a no-op here (the app calls it on every screen change).
window.scrollTo = (() => undefined) as typeof window.scrollTo;

export function render(deps: Partial<Deps> = {}): App {
  app?.destroy();
  document.body.innerHTML = body;
  app = mountApp(document, {
    loadSpots: () => Promise.resolve(fileSpots),
    locate: () => Promise.resolve(ORIGINS.제주시),
    storage: window.localStorage,
    session: window.sessionStorage,
    now: () => clock,
    // `long` (the 지역으로 고르기 escape) is off unless a test asks for it: a real-time 30ms timer fired
    // during a busy run's awaits and made exact status checks flaky (QA 2026-09-30, S02).
    delays: { slow: 0, long: 10_000, settle: 300 },

    ...deps,
  });
  return app;
}
export function reset() {
  app?.destroy();
  app = null;
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '');
}
export const current = () => app!;

/** A deliberate tap: the test clock moves past the double-tap guards before and after it, so the next
 * click (tap() or a bare .click()) is a separate tap, not the 2nd half of a double tap. */
export async function tap(sel: string | HTMLElement) {
  advance();
  const e = typeof sel === 'string' ? $(sel) : sel;
  if (!e) throw new Error(`nothing to tap: ${String(sel)}`);
  (e as HTMLElement).click();
  await flush();
  await flush();
  advance();
}

/** Cards in the section on screen (results or saved list) — hidden sections don't count. */
export const cardIds = () => $$('main > section:not([hidden]) .card:not(.ghost)').map((e) => e.getAttribute('data-id'));
const nameById = new Map(realSpots.map((s) => [s.id, s.name] as const));
/** Names of the cards on screen (by id: the name is drawn with its "(별칭)" part split off, see app.test.ts). */
export const cardNames = (): string[] => cardIds().map((id) => nameById.get(id!) ?? String(id));
/** The mood whose results are on screen ([] on the first screen / saved list). */
export const shownMood = () => {
  if ($('#results').hidden) return [];
  const t = $('#crumb').textContent;
  return $$('button[data-mood]')
    // a mood row's name is its own span: the row also says 「예: …」 once the data is in (ADR-0075 3)
    .filter((b) => (b.querySelector('.label') ?? b).textContent === t)
    .map((b) => b.dataset.mood);
};
/** What a first pick shows (default range 차로 30분 unless given). */
/** The day the app picks for (지금 = today in Jeju, from the real clock unless a test passes `today`): 오일장 rank
 * by it (ADR-0066). */
export const today = () => dayOf(new Date());
export const expectedNames = (o: Point, b: Button, sub?: Tab, reach?: Reach) => pickCards(realSpots, o, b, {}, sub, reach, false, today()).cards.map((c) => c.spot.name);

/** A promise with its resolve/reject exposed. */
export function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
