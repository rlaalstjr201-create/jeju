// @vitest-environment jsdom
// design/qa/scenarios.md — one test per automatable row (named by id), plus the code-audit findings.
// Rows that need real layout, a real service worker or a real browser's history timing are also covered
// in tests/e2e/browser.e2e.mjs (Chromium).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AREAS, LocateError } from '../src/app';
import { islandOf, pickCards, withinReach, type Point } from '../src/pick';
import { ORIGINS, fileSpots, realSpots } from './fixtures';
import { $, $$, advance, cardIds, cardNames, css, current, deferred, expectedNames, flush, html, render, reset, settle, shownMood, tap, wait } from './harness';

const area = (n: string) => AREAS.find((a) => a.name === n)!;
const deny = () => Promise.reject(new LocateError('denied'));
const hang = () => new Promise<Point>(() => undefined);
const status = () => $('#status').textContent ?? '';
/** The 3s GPS wait (지역으로 고르기, the saved list's give-up) cut to 30ms of real time. Only for "it is there
 * after 40ms" checks — Node fires the 30ms timer first. "Not there yet" checks use fake timers (S04). */
const ESCAPE_30 = { slow: 0, long: 30, settle: 300 };
/** The mood whose results are on screen (its title). */
const pressedMoods = shownMood;
const state = () => current().state();
/** saved ids as stored (jeju.saved.v2), day by day in their order */
const storedIds = (): string[] => (JSON.parse(window.localStorage.getItem('jeju.saved.v2') ?? '[]') as { id: string }[]).map((e) => e.id);
/** Declarations of every top-level rule whose selector list includes `sel` exactly (media blocks excluded). */
const cssRule = (sel: string) => {
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}/g, '');
  let out = '';
  for (const m of flat.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (m[1].split(',').some((x) => x.trim() === sel)) out += m[2];
  }
  return out;
};

beforeEach(reset);

describe('첫 방문', () => {
  it('S01 nothing is asked on open: no GPS call, no data needed for the 5 moods, no sheet', () => {
    const locate = vi.fn(() => Promise.resolve(ORIGINS.제주시));
    render({ locate, loadSpots: () => new Promise(() => undefined) });
    expect(locate).not.toHaveBeenCalled();
    expect($$('[data-mood]')).toHaveLength(5);
    expect($('#sheet').hidden).toBe(true);
    expect($('#saved').hidden).toBe(true);
  });

  it('S02 GPS allowed: placeholder at once, "위치 확인 중…" while locating, placeholder kept while the data downloads, then 3 cards', async () => {
    const gps = deferred<Point>();
    const data = deferred<unknown>();
    render({ locate: () => gps.promise, loadSpots: () => data.promise });
    await tap('[data-mood="rest"]');
    expect($$('#cards .ghost')).toHaveLength(3);
    expect(status()).toBe('위치 확인 중…');
    expect($('#cards').getAttribute('aria-busy')).toBe('true');
    gps.resolve(ORIGINS.제주시);
    await flush();
    expect(status()).toBe(''); // no longer locating …
    expect($$('#cards .ghost')).toHaveLength(3); // … but still visibly working (audit: blank while downloading)
    expect($('#cards').getAttribute('aria-busy')).toBe('true');
    data.resolve(fileSpots);
    await flush();
    await flush();
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'rest'));
    expect($('#cards').getAttribute('aria-busy')).toBe('false');
  });

  it('S25 slow data (fixed basis): placeholder right away, never a blank pressed button', async () => {
    const data = deferred<unknown>();
    window.localStorage.setItem('jeju.region', JSON.stringify('애월'));
    window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
    render({ loadSpots: () => data.promise });
    await tap('[data-mood="walk"]');
    expect(pressedMoods()).toEqual(['walk']);
    expect($$('#cards .ghost')).toHaveLength(3);
    expect(status()).toBe(''); // not locating — no GPS involved
    data.resolve(fileSpots);
    await flush();
    await flush();
    expect(cardNames()).toEqual(expectedNames(area('애월'), 'walk'));
  });
});

describe('위치 — 거절·지연·제주 밖', () => {
  it('S03 denied: no sheet, no blame; the destination question with the 15 areas in place; label says 지역 고르기', async () => {
    render({ locate: deny });
    await tap('[data-mood="rest"]');
    expect($('#sheet').hidden).toBe(true);
    expect($('.notice-t')?.textContent).toBe('위치 권한이 꺼져 있어요.');
    expect($('.notice-b')?.textContent).toContain('동네를 고르면');
    expect($('.notice-f')?.textContent).toBe('위치를 쓰려면 브라우저 설정에서 위치 권한을 켜 주세요.');
    expect($$('#cards [data-area]').map((b) => b.textContent)).toEqual(AREAS.map((a) => a.label + a.landmark));
    expect($('#basis').textContent).toBe('지역 고르기');
    await tap('#cards [data-area="성산"]');
    expect(cardNames()).toEqual(expectedNames(area('성산'), 'rest'));
    expect($('#basis').textContent).toBe('성산 근처');
    expect(window.localStorage.getItem('jeju.region')).toBe('"성산"');
  });

  it('S04 GPS slow: after a few seconds "지역으로 고르기" appears in the same line; picking an area ends it', async () => {
    const gps = deferred<Point>();
    // The app's 3s, on a fake clock: "not yet" at 2.999s and "now" at 3s are exact, however busy the run is.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      render({ locate: () => gps.promise, delays: { slow: 0, long: 3000, settle: 300 } });
      advance();
      $('[data-mood="walk"]').click();
      await vi.advanceTimersByTimeAsync(2999);
      expect(status()).toBe('위치 확인 중…');
      expect($('#status [data-action="choose-area"]')).toBeNull();
      await vi.advanceTimersByTimeAsync(1);
      expect(status()).toBe('위치 확인 중…지역으로 고르기');
    } finally {
      vi.useRealTimers();
    }
    await tap('#status [data-action="choose-area"]');
    expect($('#sheet').hidden).toBe(false);
    await tap('#sheet [data-area="애월"]');
    expect(cardNames()).toEqual(expectedNames(area('애월'), 'walk'));
    gps.resolve(ORIGINS.서귀포); // the abandoned GPS answer arrives late
    await flush();
    await flush();
    expect(cardNames()).toEqual(expectedNames(area('애월'), 'walk'));
    expect($('#basis').textContent).toBe('애월 근처');
  });

  it('S05 permission prompt left unanswered (never settles): the way out still shows', async () => {
    render({ locate: hang, delays: ESCAPE_30 });
    await tap('[data-mood="rest"]');
    await wait(40);
    expect($('#status [data-action="choose-area"]')?.textContent).toBe('지역으로 고르기');
    expect($$('#cards .ghost')).toHaveLength(3);
  });

  it('S06 outside Jeju: one message — title and body say the same thing', async () => {
    render({ locate: () => Promise.reject(new LocateError('outside')) });
    await tap('[data-mood="new"]');
    expect($('.notice-t')?.textContent).toBe('지금은 제주 밖이에요.');
    expect($('.notice-b')?.textContent).toBe('동네를 고르면 거기서 가까운 곳을 보여 드려요.');
    expect($('#sheet').hidden).toBe(true);
    expect(document.body.textContent).not.toContain('계세요');
  });

  it('S07 denied earlier: known-denied skips GPS; the sheet says why; choosing 내 위치 again explains instead of looping', async () => {
    const locate = vi.fn(deny);
    render({ locate, geoPermission: async () => 'denied' });
    await tap('[data-mood="rest"]');
    expect(locate).not.toHaveBeenCalled();
    expect($('.notice-t')?.textContent).toBe('위치 권한이 꺼져 있어요.');
    await tap('#basis');
    expect($('#sheet [data-basis="gps"] .lm')?.textContent).toBe('위치 권한이 꺼져 있어요');
    await tap('#sheet [data-basis="gps"]'); // last attempt failed → this is a retry, not a no-op
    await settle();
    expect($('#sheet').hidden).toBe(true);
    expect($('.notice-t')?.textContent).toBe('위치 권한이 꺼져 있어요.');
    expect(locate).not.toHaveBeenCalled();
  });
});

describe('숙소', () => {
  it('S08 the basis sheet shows which 동네 the 숙소 is in (area pick, and GPS save → nearest area)', async () => {
    render();
    await tap('#basis');
    expect($('#sheet [data-basis="stay"] .lm')?.textContent).toBe('처음 한 번만 정해요');
    await tap('#sheet [data-basis="stay"]');
    await tap('#sheet [data-where="stay"][data-area="애월"]');
    await settle();
    await tap('#basis');
    expect($('#sheet [data-basis="stay"] .lm')?.textContent).toBe('애월 숙소');
    expect($('#sheet [data-basis="stay"]').getAttribute('aria-pressed')).toBe('true');

    render({ locate: () => Promise.resolve(ORIGINS['서쪽(한림)']) });
    await tap('#basis');
    await tap('#sheet [data-action="restay"]');
    await tap('#sheet [data-action="stay-here"]');
    await settle();
    await tap('#basis');
    expect($('#sheet [data-basis="stay"] .lm')?.textContent).toBe('한림 숙소');
  });

  it('S09 "지금 위치를 숙소로" fails: the button stays a button, the reason goes on its own line', async () => {
    const gps = deferred<Point>();
    render({ locate: () => gps.promise });
    await tap('#basis');
    await tap('#sheet [data-basis="stay"]');
    await tap('#sheet [data-action="stay-here"]');
    const btn = $<HTMLButtonElement>('#sheet [data-action="stay-here"]');
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('위치 확인 중…');
    gps.reject(new LocateError('denied'));
    await flush();
    await flush();
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('지금 위치를 숙소로');
    expect($('#sheet .form-err').hidden).toBe(false);
    expect($('#sheet .form-err').textContent).toBe('위치 권한이 꺼져 있어요. 아래에서 숙소 동네를 골라 주세요.');
    expect($('#basis').textContent).toBe('지역 고르기'); // known now: GPS is off, so not "내 주변
  });

  it('S10 closing the sheet while the 숙소 GPS is pending voids it: no basis change, nothing stored, other sheets untouched', async () => {
    const gps = deferred<Point>();
    window.localStorage.setItem('jeju.region', JSON.stringify('애월'));
    window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
    render({ locate: () => gps.promise });
    await tap('[data-mood="walk"]');
    const before = cardNames();
    await tap('#basis');
    await tap('#sheet [data-basis="stay"]');
    await tap('#sheet [data-action="stay-here"]');
    await tap('#sheet .sheet-close');
    await settle();
    await tap('#basis'); // a different sheet is open when the late answer lands
    gps.resolve(ORIGINS.서귀포);
    await flush();
    await flush();
    expect($('#sheet').hidden).toBe(false);
    expect($('#sheet-title').textContent).toBe('언제 어디 근처로 볼까요?');
    expect($('#basis').textContent).toBe('애월 근처');
    expect(window.localStorage.getItem('jeju.stay')).toBeNull();
    expect(cardNames()).toEqual(before);
  });
});

describe('기준과 출발지', () => {
  it('S12 the first card says where the time is measured from; the other two don\'t repeat it', async () => {
    window.localStorage.setItem('jeju.region', JSON.stringify('애월'));
    window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
    render();
    await tap('[data-mood="rest"]');
    const metas = $$('.card .travel').map((e) => e.textContent);
    // "셋 다 애월에서 …" when the three trips are the same (the rows then carry none)
    expect(metas[0]).toMatch(/^(셋 다 )?애월에서 (차로 약 \d+분|.+)$/);
    for (const m of metas.slice(1)) expect(m).not.toContain('에서');
  });

  it('S13 yesterday\'s area is still visible the next day: label + first card origin after a fresh open', async () => {
    window.localStorage.setItem('jeju.region', JSON.stringify('애월'));
    window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
    render();
    expect($('#basis').textContent).toBe('애월 근처');
    await tap('[data-mood="walk"]');
    expect($('.card .travel')?.textContent).toMatch(/^(셋 다 )?애월에서 /);
  });

  it('S14 switching basis while cards show recomputes the same mood from the new origin', async () => {
    render();
    await tap('[data-mood="new"]');
    await tap('#basis');
    await tap('#sheet [data-area="성산"]');
    expect(pressedMoods()).toEqual(['new']);
    expect(cardNames()).toEqual(expectedNames(area('성산'), 'new'));
  });

  it('audit: re-selecting the basis already in use changes nothing (area / 숙소 / 내 위치)', async () => {
    window.localStorage.setItem('jeju.region', JSON.stringify('애월'));
    window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
    render();
    await tap('[data-mood="rest"]');
    const shown = cardNames();
    await tap('#basis');
    expect($('#sheet [data-area="애월"]').getAttribute('aria-pressed')).toBe('true');
    await tap('#sheet [data-area="애월"]');
    await settle();
    expect(cardNames()).toEqual(shown);

    await tap('#basis');
    await tap('#sheet [data-basis="gps"]');
    await settle();
    const gpsCards = cardNames();
    await tap('#basis');
    await tap('#sheet [data-basis="gps"]');
    await settle();
    expect(cardNames()).toEqual(gpsCards);

    await tap('#basis');
    await tap('#sheet [data-basis="stay"]');
    await tap('#sheet [data-where="stay"][data-area="한림"]');
    await settle();
    const stayCards = cardNames();
    await tap('#basis');
    await tap('#sheet [data-basis="stay"]');
    await settle();
    expect(cardNames()).toEqual(stayCards);
    expect($('#sheet').hidden).toBe(true);
  });
});

describe('뒤로가기와 저장 목록 (history)', () => {
  async function savedOpenFromCards() {
    render();
    await tap('[data-mood="rest"]');
    await tap('.card .heart');
    await tap('[data-mood="walk"]');
    await tap($$('.card .heart')[1]);
    await tap('#saved');
    await settle();
  }

  // Changed on purpose (specs/date-mode.md): the order is the user's; only the trips follow the new basis.
  it('S15 saved list → ⇄ → area: the list stays, its trips from the new area (no bounce to mood cards)', async () => {
    await savedOpenFromCards();
    const saved = storedIds();
    await tap('#basis');
    await tap('#sheet [data-area="성산"]');
    await settle();
    expect($('#savedView').hidden).toBe(false);
    expect(pressedMoods()).toEqual([]);
    expect(cardIds()).toEqual(saved);
    expect($('#savedView .travel')?.textContent).toMatch(/^성산에서 /);
    expect(window.history.state).toMatchObject({ view: 'saved', overlay: null });
  });

  it('S16 saved list → ⇄ → 닫기: only the sheet closes; no empty entry is left', async () => {
    await savedOpenFromCards();
    const length = window.history.length;
    const entry = window.history.state;
    await tap('#basis');
    await tap('#sheet .sheet-close');
    await settle();
    expect($('#savedView').hidden).toBe(false);
    expect($('#sheet').hidden).toBe(true);
    expect(window.history.state).toEqual(entry);
    expect(window.history.length).toBe(length + 1); // the sheet entry remains only as "forward"
  });

  // The saved list has no mood buttons (SPEC §11.7 S17): the way to another mood is 돌아가기 → 바꾸기 → mood.
  it('S17 saved list → 돌아가기 → 바꾸기 → another mood: history ends on the cards entry (no dead back press)', async () => {
    await savedOpenFromCards();
    await tap('[data-mood="new"]'); // hidden under the saved list: nothing happens
    await settle();
    expect($('#savedView').hidden).toBe(false);
    expect(window.history.state).toMatchObject({ view: 'saved', depth: 2 });
    await tap('#savedView .back');
    await settle();
    await tap('#results .change');
    await settle();
    await tap('[data-mood="new"]');
    await settle();
    expect($('#savedView').hidden).toBe(true);
    expect(cardNames()).toHaveLength(3);
    expect(window.history.state).toMatchObject({ view: 'cards', overlay: null, depth: 1 });
    window.history.back();
    await settle();
    expect(cardNames()).toHaveLength(0); // one back = first screen, visibly
    expect(window.history.state).toMatchObject({ view: 'home', depth: 0 });
  });

  it('S17 (from the first screen) saved list → 돌아가기 → mood: cards at depth 1', async () => {
    window.localStorage.setItem('jeju.saved', JSON.stringify([realSpots[0].id]));
    render();
    await tap('#saved');
    await settle();
    await tap('#savedView .back');
    await settle();
    await tap('[data-mood="rest"]');
    await settle();
    expect(window.history.state).toMatchObject({ view: 'cards', depth: 1 });
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'rest'));
  });

  it('S18 reloaded with a sheet open: its entry is consumed on mount, the sheet is not shown', async () => {
    window.history.replaceState({ jeju: 1, view: 'home', overlay: null, depth: 0 }, '');
    window.history.pushState({ jeju: 1, view: 'home', overlay: 'basis', depth: 1 }, '');
    render();
    await settle();
    expect($('#sheet').hidden).toBe(true);
    expect(window.history.state).toEqual({ jeju: 1, view: 'home', overlay: null, depth: 0 });
  });

  it('S19·S20 phone back walks back one layer at a time: sheet → saved list (cards restored) → first screen', async () => {
    await savedOpenFromCards();
    const walkCards = state().cards?.list.map((c) => c.spot.name);
    await tap('#basis');
    window.history.back();
    await settle();
    expect($('#sheet').hidden).toBe(true);
    expect($('#savedView').hidden).toBe(false);
    window.history.back();
    await settle();
    expect($('#savedView').hidden).toBe(true);
    expect(cardNames()).toEqual(walkCards); // restored, not re-picked
    expect(pressedMoods()).toEqual(['walk']);
    window.history.back();
    await settle();
    expect(cardNames()).toEqual([]);
    expect(pressedMoods()).toEqual([]);
    expect($('#home').hidden).toBe(false);
    expect($$('[data-mood][aria-current="true"]').map((b) => b.dataset.mood)).toEqual(['walk']);
  });

  it('audit: re-sorting the open saved list (basis change) pushes nothing', async () => {
    await savedOpenFromCards();
    const length = window.history.length;
    await tap('#basis');
    await tap('#sheet [data-area="애월"]');
    await settle();
    await tap('#basis');
    await tap('#sheet [data-area="한경"]');
    await settle();
    expect(window.history.length).toBe(length + 1);
    expect(window.history.state).toMatchObject({ view: 'saved', depth: 2 });
  });

  it('audit: unsaving the last item while the list is open keeps ♥ visible (the toggle never vanishes)', async () => {
    window.localStorage.setItem('jeju.saved', JSON.stringify([realSpots[0].id]));
    render();
    await tap('#saved');
    await tap('#savedView .heart');
    expect($('#saved').hidden).toBe(false);
    expect($('#saved').textContent).toBe('0');
    await tap('#saved');
    expect($('#savedView').hidden).toBe(true);
    expect($('#saved').hidden).toBe(true);
  });

  it('QA r3 seed 198: saved list restored by a reload → ♥N closes it → ⇄ before the back lands: screen and entry agree', async () => {
    render();
    await tap('[data-mood="walk"]');
    await tap('.card .heart');
    await tap('#saved');
    await settle();
    render(); // reload on the saved list: what is underneath is unknown ('adopt')
    await flush();
    advance();
    $('#saved').click(); // close: back('adopt') in flight
    advance();
    $('#basis').click(); // ⇄ on the saved list before that back lands
    await settle();
    await settle();
    expect(current().state().view).toBe('cards');
    expect($('#sheet').hidden).toBe(current().state().overlay === null);
    expect(window.history.state).toMatchObject({ view: current().state().view, overlay: current().state().overlay, depth: 1 });
  });
});

describe('오프라인·목록 실패', () => {
  it('S22 offline revisit: cards still come, with one quiet line that photos won\'t show', async () => {
    let online = false;
    render({ online: () => online });
    await tap('[data-mood="rest"]');
    expect(cardNames()).toHaveLength(3);
    expect(status()).toBe('오프라인이라 사진은 안 보여요.');
    online = true;
    window.dispatchEvent(new Event('online'));
    expect(status()).toBe('');
  });

  it('S24 data failed: explained with "다시 불러오기"; the retry (or a new tap) fetches again and works', async () => {
    let calls = 0;
    render({ loadSpots: () => (++calls <= 2 ? Promise.reject(new Error('503')) : Promise.resolve(fileSpots)) });
    await flush(); // the warm-up load at mount fails (call 1)
    await tap('[data-mood="rest"]'); // call 2 fails
    expect($('.notice-t')?.textContent).toBe('목록을 불러오지 못했어요.');
    expect($('.notice .retry')?.textContent).toBe('다시 불러오기');
    await tap('.notice .retry'); // call 3 succeeds
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'rest'));
    expect(calls).toBe(3);
  });

  it('S24 offline while loading: says so', async () => {
    render({ loadSpots: () => Promise.reject(new TypeError('Failed to fetch')), online: () => false });
    await tap('[data-mood="walk"]');
    expect($('.notice-t')?.textContent).toBe('오프라인이라 목록을 불러오지 못했어요.');
  });
});

describe('저장소 값 손상 (S29)', () => {
  it('unknown basis → 내 위치, highlighted in the sheet; duplicate saved ids → counted once', async () => {
    window.localStorage.setItem('jeju.basis', JSON.stringify('teleport'));
    window.localStorage.setItem('jeju.saved', JSON.stringify([realSpots[0].id, realSpots[0].id]));
    render();
    expect($('#basis').textContent).toBe('내 위치 근처');
    expect($('#saved').textContent).toBe('1');
    await tap('#saved');
    expect(cardIds()).toEqual([realSpots[0].id]);
    await tap('#savedView .heart'); // unsave → really unsaved (was: heart off, id still stored)
    expect(storedIds()).toEqual([]);
    await tap('#saved');
    await tap('#basis');
    expect($('#sheet [data-basis="gps"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('legacy 4-region value → nearest of the 15 areas; a {0,0} 숙소 is dropped', () => {
    window.localStorage.setItem('jeju.region', JSON.stringify('동쪽'));
    window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
    render();
    expect($('#basis').textContent).toBe('성산 근처');
    window.localStorage.setItem('jeju.stay', JSON.stringify({ lat: 0, lng: 0, label: '' }));
    window.localStorage.setItem('jeju.basis', JSON.stringify('stay'));
    render();
    expect($('#basis').textContent).toBe('내 위치 근처');
  });
});

describe('섬·이름·지도 링크', () => {
  it('S33 island cards say you need a boat — never a drive time across the water', async () => {
    window.localStorage.setItem('jeju.region', JSON.stringify('우도'));
    window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
    render();
    const seen: string[] = [];
    for (const mood of ['rest', 'walk', 'new', 'any'] as const) {
      await tap(`[data-mood="${mood}"]`);
      const cards = $$('.card');
      const want = cards.map((li) => (islandOf(realSpots.find((s) => s.id === li.dataset.id)!) === '우도' ? '같은 우도 안이에요' : '본섬이라 배를 타고 나가야 해요'));
      // 3판 (§7): the first card keeps its own line; the rows' shared trip is said once on the 아니면 line
      const same = want.length === 3 && want[1] === want[2];
      expect($('#alt-trip')?.textContent ?? null).toBe(same ? `둘 다 ${want[1]}` : null);
      if (same) seen.push(want[1]);
      cards.forEach((li, i) => {
        const meta = li.querySelector('.travel')?.textContent ?? null;
        if (meta) seen.push(meta);
        if (i === 0) expect(meta).toBe(want[0]);
        else expect(meta).toBe(same ? null : want[i]);
      });
      await tap('#results .change');
      await settle();
    }
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.some((m) => m.includes('차로'))).toBe(false);
  });

  // Changed on purpose (QA 2026-09-30): "· 카카오맵" three times on one screen was the repeated meta §14
  // forbids. The first card says it in words; every card is the same whole-card link, and each link says
  // so to a screen reader ("{이름}, 카카오맵에서 보기"). ADR-0071: the words follow the chosen map app (네이버지도 first).
  it('S57 the first card says where a tap goes (네이버지도, ADR-0071 default), every card links there, no arrow glyph', async () => {
    render();
    await tap('[data-mood="walk"]');
    const cards = $$('#cards .card');
    expect(cards).toHaveLength(3);
    expect($$('#cards .card .dest').map((d) => d.textContent)).toEqual(['네이버지도']);
    expect(cards[0].querySelector('.dest')).not.toBeNull();
    for (const c of cards) {
      const a = c.querySelector<HTMLAnchorElement>('.card-link')!;
      expect(a.href).toMatch(/^https:\/\/map\.naver\.com\/p\/search\//);
      expect(a.getAttribute('aria-label')).toMatch(/, 네이버지도에서 보기$/);
    }
    // "·" is held to the trip by a no-break space; the break opportunity is after it, so no line starts with "·"
    const meta = cards[0].querySelector('.meta')!;
    expect(meta.querySelector('.sep')?.textContent).toBe(' ·');
    expect(meta.textContent).toMatch(/ · 네이버지도$/);
    expect(cssRule('.meta .dest')).toMatch(/white-space:\s*nowrap/);
    // the saved list keeps it on every row (a list sorted by distance, §6.11)
    await tap('.card .heart');
    await tap('#saved');
    expect($$('#savedView .card .dest').map((d) => d.textContent)).toEqual(['네이버지도']);
    expect($('#cards').textContent).not.toMatch(/[↗→]/);
  });
});

describe('연타·겹친 요청', () => {
  it('S35 a double tap on a mood is one tap: the first 3 are shown, not skipped', async () => {
    window.localStorage.setItem('jeju.region', JSON.stringify('애월'));
    window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
    render();
    advance();
    $('[data-mood="rest"]').click();
    await flush();
    $('[data-mood="rest"]').click(); // same instant (test clock not advanced)
    await flush();
    await flush();
    expect(cardNames()).toEqual(expectedNames(area('애월'), 'rest'));
    expect(window.history.state).toMatchObject({ view: 'cards', depth: 1 }); // one entry, not two
    // Changed on purpose (SPEC D2): coming back to the same mood brings back those 3; next 3 is its own button.
    await tap('#results .change');
    await settle();
    await tap('[data-mood="rest"]');
    expect(cardNames()).toEqual(expectedNames(area('애월'), 'rest'));
    await tap('#cards .more');
    expect(cardNames().filter((n) => expectedNames(area('애월'), 'rest').includes(n))).toEqual([]);
  });

  it('S35 "다른 3곳 보기" double tap advances once', async () => {
    render();
    await tap('[data-mood="walk"]');
    const all = pickCards(realSpots, ORIGINS.제주시, 'walk');
    const second = pickCards(realSpots, ORIGINS.제주시, 'walk', all.histories).cards.map((c) => c.spot.name);
    advance();
    $('[data-action="more"]').click();
    await flush();
    await flush();
    $('[data-action="more"]')?.click();
    await flush();
    await flush();
    expect(cardNames()).toEqual(second);
  });

  it('S36 another mood while loading: only the last tap counts', async () => {
    const first = deferred<Point>();
    let n = 0;
    render({ locate: () => (++n === 1 ? first.promise : Promise.resolve(ORIGINS.제주시)) });
    await tap('[data-mood="rest"]');
    await tap('[data-mood="new"]');
    first.resolve(ORIGINS.서귀포);
    await flush();
    await flush();
    expect(pressedMoods()).toEqual(['new']);
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'new'));
  });

  it('S37 GPS pending, area picked in the sheet, then GPS fails late: no sheet pops, the area\'s cards stay', async () => {
    const gps = deferred<Point>();
    render({ locate: () => gps.promise });
    await tap('[data-mood="rest"]');
    await tap('#basis');
    await tap('#sheet [data-area="애월"]');
    await settle();
    expect(cardNames()).toEqual(expectedNames(area('애월'), 'rest'));
    gps.reject(new LocateError('unavailable'));
    await flush();
    await flush();
    expect($('#sheet').hidden).toBe(true);
    expect($('.notice')).toBeNull();
    expect(cardNames()).toEqual(expectedNames(area('애월'), 'rest'));
    expect(pressedMoods()).toEqual(['rest']);
    expect(status()).toBe('');
  });

  it('S38 overlapping GPS requests, the older one fails late: the newer result wins', async () => {
    const first = deferred<Point>();
    let n = 0;
    render({ locate: () => (++n === 1 ? first.promise : Promise.resolve(ORIGINS.제주시)) });
    await tap('[data-mood="walk"]');
    await tap('[data-mood="rest"]');
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'rest'));
    first.reject(new LocateError('denied'));
    await flush();
    await flush();
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'rest'));
    expect($('.notice')).toBeNull();
    expect($('#basis').textContent).toBe('내 위치 근처');
  });
});

describe('하트', () => {
  it('S39 double tap on a heart = saved then unsaved (a toggle, not guarded)', async () => {
    render();
    await tap('[data-mood="rest"]');
    const h = $('.card .heart');
    h.click();
    h.click();
    await flush();
    expect(h.getAttribute('aria-pressed')).toBe('false');
    expect(storedIds()).toEqual([]);
  });

  it('S40 the first heart ever says once where saves go; later hearts don\'t', async () => {
    const delays = { slow: 0, long: 10_000, settle: 3000 };
    render({ delays });
    await tap('[data-mood="rest"]');
    await tap('.card .heart');
    const first = $('.card').dataset.id;
    expect($$('.hint').map((e) => e.closest<HTMLElement>('.card')?.dataset.id)).toEqual([first]);
    expect($('.hint').textContent).toBe('저장한 곳은 맨 위 하트 버튼에 모여요.');
    expect(window.localStorage.getItem('jeju.hintSeen')).toBe('true');
    expect($('#announce').textContent).toBe('저장한 곳은 맨 위 하트 버튼에 모여요.');
    await tap($$('.card .heart')[1]);
    expect($$('.hint')).toHaveLength(1);
    // Changed on purpose (3판 §6.13): no timer — still there 10s later; it goes with the next intent.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      vi.advanceTimersByTime(10_000);
    } finally {
      vi.useRealTimers();
    }
    expect($$('.hint')).toHaveLength(1);
    await tap('#cards .more');
    await flush();
    expect($$('.hint')).toHaveLength(0);
    render({ delays });
    await tap('[data-mood="walk"]');
    await tap('.card .heart');
    expect($$('.hint')).toHaveLength(0);
  });

  it('S42 saved ids missing from the data: ♥ N corrects itself, storage keeps them (a bad deploy can\'t wipe saves)', async () => {
    window.localStorage.setItem('jeju.saved', JSON.stringify(['gone', realSpots[0].id]));
    render();
    expect($('#saved').textContent).toBe('2');
    await flush();
    await flush();
    expect($('#saved').textContent).toBe('1');
    expect(storedIds()).toEqual(['gone', realSpots[0].id]);
  });

  it('audit: another tab\'s save shows up here (storage event) and is never overwritten', async () => {
    render();
    await tap('[data-mood="rest"]');
    const [a, b] = $$('.card').map((c) => c.dataset.id!);
    await tap('.card .heart');
    // another tab saves b (today)
    const day = state().today;
    window.localStorage.setItem('jeju.saved.v2', JSON.stringify([{ id: a, date: day, order: 0 }, { id: b, date: day, order: 1 }]));
    window.dispatchEvent(new StorageEvent('storage', { key: 'jeju.saved.v2', storageArea: window.localStorage }));
    expect($('#saved').textContent).toBe('2');
    expect($$('.card .heart').map((h) => h.getAttribute('aria-pressed'))).toEqual(['true', 'true', 'false']);
    // this tab unsaves a: b survives
    await tap('.card .heart');
    expect(storedIds()).toEqual([b]);
  });

  it('a heart tap never rebuilds the card (photo not reloaded)', async () => {
    render();
    await tap('[data-mood="rest"]');
    const img = $('.card img');
    await tap('.card .heart');
    expect($('.card img')).toBe(img);
  });
});

describe('다시 고르기', () => {
  // Changed on purpose (SPEC D2): the moods fold away on the results screen, so "again" means 바꾸기 → the
  // same mood, which brings back the 3 being compared; the next 3 come only from "다른 3곳 보기".
  it('S44 mood A → 바꾸기 → B → 바꾸기 → A brings back the A cards being compared; 다른 3곳 보기 moves on', async () => {
    render();
    await tap('[data-mood="rest"]');
    const rest1 = cardNames();
    await tap('#results .change');
    await settle();
    expect($('#home').hidden).toBe(false);
    expect($('[data-mood="rest"]').getAttribute('aria-current')).toBe('true'); // ticked: chosen last time
    await tap('[data-mood="walk"]');
    expect(pressedMoods()).toEqual(['walk']);
    await tap('#results .change');
    await settle();
    await tap('[data-mood="rest"]');
    expect(cardNames()).toEqual(rest1);
    await tap('#cards .more');
    expect(cardNames().filter((n) => rest1.includes(n))).toEqual([]);
    expect(window.history.state).toMatchObject({ view: 'cards', depth: 1 });
  });

  it('S34 audit: "다른 3곳 보기" sits after the list and moves on like a re-tap; the old far-away hint is gone', async () => {
    render();
    await tap('[data-mood="new"]');
    const first = cardNames();
    const more = $('#cards .more');
    expect(more.textContent).toBe('다른 3곳 보기');
    // 3판 (§6.6): the button sits in a sticky bar, the last child of the list, with the 1px float marker
    const bar = more.parentElement!;
    expect(bar.matches('.more-bar')).toBe(true);
    expect(bar.previousElementSibling?.matches('.card.row')).toBe(true);
    expect(bar.querySelector('.more-end')?.getAttribute('aria-hidden')).toBe('true');
    // first card large, then "아니면", then two row cards
    expect([...$('#cards').children].map((e) => e.className)).toEqual(['card lead', 'alt', 'card row', 'card row', 'more-bar']);
    expect($('#cards .alt b').textContent).toBe('아니면');
    await tap(more);
    expect(cardNames().filter((n) => first.includes(n))).toEqual([]);
    expect(document.body.textContent).not.toContain('한 번 더 누르면');
  });
});

describe('작은 화면 (S45·S46)', () => {
  // Changed on purpose (design/SPEC.md §6.6·§8): the moods fold away when results open, so the results always
  // start at the top of the page; "다른 3곳 보기" brings the heading back under the top bar only when it
  // scrolled out of view, and moves focus to it.
  it('results open at the top with focus on the heading; next 3 scroll the heading back only when it is out of view', async () => {
    const intoView = vi.fn();
    const scrollTo = vi.spyOn(window, 'scrollTo');
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: intoView, configurable: true, writable: true });
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect');
    try {
      Object.defineProperty(window, 'innerHeight', { value: 568, configurable: true });
      render();
      await tap('[data-mood="rest"]');
      expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
      expect(document.activeElement).toBe($('#crumb'));
      expect(intoView).not.toHaveBeenCalled();

      rect.mockImplementation(function (this: Element) {
        // the heading has scrolled up behind the 52px top bar (the thumb is down by the button)
        return (this.id === 'crumb' ? { top: -300, bottom: -270 } : { top: 0, bottom: 52 }) as DOMRect;
      });
      $('.card .card-link').focus();
      await tap('#cards .more');
      expect(intoView).toHaveBeenCalledWith({ block: 'start' });
      expect(intoView.mock.instances.at(-1)).toBe($('#results .head'));
      expect(document.activeElement).toBe($('#crumb'));

      intoView.mockClear();
      rect.mockImplementation(function (this: Element) {
        return (this.id === 'crumb' ? { top: 60, bottom: 90 } : { top: 0, bottom: 52 }) as DOMRect;
      });
      await tap('#cards .more');
      expect(intoView).not.toHaveBeenCalled();
    } finally {
      delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
      rect.mockRestore();
      scrollTo.mockRestore();
    }
  });

  it('closing the saved list goes back to the same scroll position; other screen changes start at the top', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo');
    try {
      render();
      await tap('[data-mood="walk"]');
      await tap('.card .heart');
      Object.defineProperty(window, 'scrollY', { value: 420, configurable: true });
      await tap('#saved');
      expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
      await tap('#savedView .back');
      expect(scrollTo).toHaveBeenLastCalledWith(0, 420);
      await tap('#results .change');
      expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
    } finally {
      Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
      scrollTo.mockRestore();
    }
  });
});

describe('새로고침·인앱 브라우저', () => {
  it('S54 reload / discarded tab: the same 3 cards come back, mood still pressed', async () => {
    render();
    await tap('[data-mood="walk"]');
    await tap('#cards .more');
    const looking = cardNames();
    render(); // reload: same history entry + sessionStorage
    await flush();
    await flush();
    expect(pressedMoods()).toEqual(['walk']);
    expect(cardNames()).toEqual(looking);
    await tap('#cards .more'); // and the rotation carries on from there
    expect(cardNames().filter((n) => looking.includes(n))).toEqual([]);
  });

  it('S54 GPS moved more than 1km since: a fresh pick instead of stale times', async () => {
    let where: Point = ORIGINS.제주시;
    render({ locate: () => Promise.resolve(where) });
    await tap('[data-mood="rest"]');
    where = ORIGINS.서귀포;
    render({ locate: () => Promise.resolve(where) });
    await flush();
    await flush();
    expect(cardNames()).toEqual(expectedNames(ORIGINS.서귀포, 'rest'));
  });

  it('S55 the saved list always says saves stay in this browser — the same two sentences for every browser (3판: no UA check)', async () => {
    window.localStorage.setItem('jeju.saved', JSON.stringify([realSpots[0].id]));
    render();
    await tap('#saved');
    expect($('#savedView .foot')?.textContent).toBe('이 브라우저에만 저장돼요. 다른 기기나 앱에서는 안 보여요.');
  });
});

describe('키보드·스크린리더', () => {
  it('S58 sheet: background inert, Tab stays inside, Esc closes and focus returns to ⇄', async () => {
    render();
    $('#basis').focus();
    await tap('#basis');
    expect($('#app').hasAttribute('inert')).toBe(true);
    const buttons = $$('#sheet button');
    buttons.at(-1)!.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(buttons[0]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(buttons.at(-1));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect($('#sheet').hidden).toBe(true);
    expect($('#app').hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe($('#basis'));
  });

  it('S59 results are announced briefly (not read out in full); heart name fixed, state only in aria-pressed', async () => {
    render();
    expect($('#cards').hasAttribute('aria-live')).toBe(false);
    await tap('[data-mood="rest"]');
    expect($('#announce').textContent).toBe('3곳 골랐어요.');
    await tap('#cards .more');
    expect($('#announce').textContent).toBe('다른 3곳 골랐어요.');
    const h = $('.card .heart');
    const name = h.getAttribute('aria-label');
    expect(name).toMatch(/ 저장$/);
    await tap(h);
    expect(h.getAttribute('aria-label')).toBe(name);
    expect(h.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('한 번에 하나 — 기분 목록이 접히는 흐름 (design/SPEC.md §6·§11)', () => {
  const region = (name: string) => {
    window.localStorage.setItem('jeju.region', JSON.stringify(name));
    window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
  };

  it('a mood folds the question away: the results say which mood, 바꾸기 goes back (one history entry, no dead back)', async () => {
    region('애월');
    render();
    expect($('#home').hidden).toBe(false);
    expect($('#results').hidden).toBe(true);
    await tap('[data-mood="walk"]');
    expect($('#home').hidden).toBe(true);
    expect($('#results').hidden).toBe(false);
    expect($('#crumb').textContent).toBe('좀 걷고 싶어');
    expect(window.history.state).toMatchObject({ view: 'cards', depth: 1 });
    await tap('#results .change');
    await settle();
    expect($('#home').hidden).toBe(false);
    expect($('#results').hidden).toBe(true);
    expect(window.history.state).toMatchObject({ view: 'home', depth: 0 });
    expect($('[data-mood="walk"]').getAttribute('aria-current')).toBe('true');
    expect($$('[data-mood][aria-current]')).toHaveLength(1);
  });

  it('♥ N then 돌아가기 in quick succession (different controls, 350ms apart) both count — each control has its own guard', async () => {
    window.localStorage.setItem('jeju.saved', JSON.stringify([realSpots[0].id]));
    render();
    advance();
    $('#saved').click();
    await flush();
    await flush();
    expect($('#savedView').hidden).toBe(false);
    advance(350); // past the 300ms double-tap window, inside the 400ms same-control guard
    $('#savedView .back').click();
    await flush();
    expect($('#savedView').hidden).toBe(true);
    expect($('#home').hidden).toBe(false);
  });

  it('S35 the 2nd tap of a double tap never lands on what the screen turned into (the card link under the finger)', async () => {
    region('애월');
    render();
    advance();
    $('[data-mood="rest"]').click();
    await flush();
    await flush();
    const link = $('.card .card-link');
    const ghost = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 });
    link.dispatchEvent(ghost); // same instant: the 2nd half of a double tap
    expect(ghost.defaultPrevented).toBe(true);
    const key = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 });
    link.dispatchEvent(key); // keyboard activation (detail 0) is never swallowed
    expect(key.defaultPrevented).toBe(false);
    advance();
    const real = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 });
    link.dispatchEvent(real); // a deliberate tap later opens the map as usual
    expect(real.defaultPrevented).toBe(false);
  });

  it('S35 a double tap on 다시 불러오기 never opens the card that replaced the notice (results and saved list)', async () => {
    const pointer = () => new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 });
    let fail = true;
    const loadSpots = () => (fail ? Promise.reject(new Error('503')) : Promise.resolve(fileSpots));
    region('애월');
    render({ loadSpots });
    await tap('[data-mood="rest"]');
    expect($('.notice .retry')).toBeTruthy();
    fail = false;
    advance();
    $('.notice .retry').dispatchEvent(pointer());
    await flush();
    await flush();
    const ghost = pointer();
    $('#cards .card-link').dispatchEvent(ghost); // same instant: the 2nd half of the double tap
    expect(ghost.defaultPrevented).toBe(true);

    reset();
    fail = true;
    region('애월');
    window.localStorage.setItem('jeju.saved', JSON.stringify([realSpots[0].id]));
    render({ loadSpots });
    await tap('#saved');
    expect($('#savedView .notice .retry')).toBeTruthy();
    fail = false;
    advance();
    $('#savedView .notice .retry').dispatchEvent(pointer());
    await flush();
    await flush();
    const ghost2 = pointer();
    $('#savedView .card-link').dispatchEvent(ghost2);
    expect(ghost2.defaultPrevented).toBe(true);
  });

  it('S35 the double-tap window runs on a monotonic clock: the device clock stepping back never freezes taps', async () => {
    region('애월');
    render({ now: undefined, delays: { slow: 0, long: 10_000, settle: 300, quiet: 20 } }); // the app's own clock
    await tap('[data-mood="rest"]');
    await wait(30); // past the double-tap window (20ms here)
    const wall = Date.now();
    const stepped = vi.spyOn(Date, 'now').mockReturnValue(wall - 60_000); // NTP / manual correction: a minute back
    try {
      const change = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 });
      $('#results .change').dispatchEvent(change);
      await settle();
      expect(change.defaultPrevented).toBe(false);
      expect($('#home').hidden).toBe(false);
    } finally {
      stepped.mockRestore();
    }
  });

  it('first card large, then 아니면, then two rows; only the first says where from; names split "(별칭)" off', async () => {
    const withAlias = realSpots.find((s) => /^(.+?)\s*[(（](.+)[)）]$/.test(s.name) && s.mood !== 'food')!;
    const others = realSpots.filter((s) => s.mood === withAlias.mood && s.id !== withAlias.id).slice(0, 2);
    // Changed on purpose (ADR-0060): the lead is the best-scored card, not the nearest — so the aliased one
    // gets the top score here.
    const spots = [{ ...withAlias, score: 5 }, ...others.map((o) => ({ ...o, score: Math.min(o.score, 4) }))];
    render({ loadSpots: () => Promise.resolve(spots), locate: () => Promise.resolve(withAlias) });
    await tap(`[data-mood="${withAlias.mood}"]`);
    const lead = $('#cards .card.lead');
    expect(lead.dataset.id).toBe(withAlias.id);
    const [, main, bracket] = /^(.+?)\s*([(（].+[)）])$/.exec(withAlias.name)!;
    expect(lead.querySelector('.alias')!.textContent).toBe(bracket);
    expect(lead.querySelector('.card-link')!.firstChild!.textContent).toBe(main);
    expect(lead.querySelector('.name')!.textContent).toBe(`${main} ${bracket}`);
    expect($$('#cards .card.row')).toHaveLength(2);
    expect($('#cards .alt').textContent).toBe('아니면');
    expect(lead.querySelector('.travel')!.textContent).toMatch(/^여기서 /);
    for (const row of $$('#cards .card.row')) expect(row.querySelector('.travel')!.textContent).not.toContain('에서');
  });

  // Changed on purpose (3판 §6.5·§6.12): two cards still get the one-word 아니면 line (only one card has none);
  // the saved list's first row says where from (no sort label any more, specs/date-mode.md), the others only
  // their trip, 카카오맵 on the first row only.
  it('two cards only: a bare 아니면; the saved list has rows only, "from" on the first trip only, 카카오맵 once', async () => {
    const two = realSpots.filter((s) => s.mood === 'walk').slice(0, 2);
    render({ loadSpots: () => Promise.resolve(two), locate: () => Promise.resolve(two[0]) });
    await tap('[data-mood="walk"]');
    expect($$('#cards .card')).toHaveLength(2);
    expect($('#cards .alt').textContent).toBe('아니면');
    expect($('#cards .card.row .meta')).not.toBeNull();
    await tap('#cards .card.lead .heart');
    await tap('#cards .card.row .heart');
    await tap('#saved');
    expect($$('#savedView .card.lead')).toHaveLength(0);
    expect($$('#savedView .card.row')).toHaveLength(2);
    expect($('#savedView .sort').textContent).toBe('');
    const trips = $$('#savedView .travel').map((t) => t.textContent);
    expect(trips[0]).toMatch(/^여기서 (차로|걸어서) 약 /);
    expect(trips[1]).toMatch(/^(차로|걸어서) 약 /);
    expect($$('#savedView .dest')).toHaveLength(1);
    expect($('#savedView .card .dest')).toBe($$('#savedView .card')[0].querySelector('.dest'));
    expect($('#savedView .foot').textContent).toBe('이 브라우저에만 저장돼요. 다른 기기나 앱에서는 안 보여요.');
    expect($('#savedTitle .count').textContent).toBe('2');
  });

  // Changed on purpose (specs/date-mode.md): the date is Jeju's (Asia/Seoul), the same day the saved list
  // calls 오늘, whatever the device's time zone.
  it('date line: today in Jeju, at any hour (ADR-0059)', () => {
    render({ today: () => new Date('2026-09-30T22:00:00+09:00') });
    expect($('#date').textContent).toBe('9월 30일 수요일');
    render({ today: () => new Date('2026-10-01T01:30:00+09:00') });
    expect($('#date').textContent).toBe('10월 1일 목요일');
    render({ today: () => new Date('2026-09-30T15:00:00Z') }); // midnight in Jeju, 15:00 in London
    expect($('#date').textContent).toBe('10월 1일 목요일');
  });

  it('S07 a known "denied" shows in the label before any tap; turned back on (settings) → 내 주변', async () => {
    let permission: 'denied' | 'granted' = 'denied';
    render({ geoPermission: async () => permission });
    await flush();
    expect($('#basis').textContent).toBe('지역 고르기');
    permission = 'granted';
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect($('#basis').textContent).toBe('내 위치 근처');
  });

  // Changed on purpose (3판 §6.13): no fade, no timer — the hint goes with the next intent, at once.
  it('first-save hint: no fade; gone with the next intent (기준 sheet, 바꾸기); never in the saved list', async () => {
    render();
    await tap('[data-mood="rest"]');
    await tap('.card .heart');
    expect($$('.hint')).toHaveLength(1);
    expect(cssRule('.hint')).not.toMatch(/transition|opacity/);
    await tap('#basis');
    expect($$('.hint')).toHaveLength(0);
    await tap('#sheet .sheet-close');
    await settle();
    expect($$('.hint')).toHaveLength(0);

    // the saved list: a first save there says nothing and does not use up the hint
    reset();
    window.localStorage.setItem('jeju.saved', JSON.stringify([realSpots[0].id]));
    render();
    await tap('#saved');
    await tap('#savedView .heart'); // unsave (row stays)
    await tap('#savedView .heart'); // save again: 0 → 1
    expect($$('.hint')).toHaveLength(0);
    expect(window.localStorage.getItem('jeju.hintSeen')).toBeNull();
  });

  it('sheet: slides away over 190ms when motion is allowed (not clickable meanwhile); reopening during it takes it back', async () => {
    window.matchMedia = ((q: string) => ({ matches: q.includes('no-preference'), media: q })) as unknown as typeof window.matchMedia;
    try {
      render();
      await tap('#basis');
      await tap('#sheet .sheet-close');
      expect($('#sheet').classList.contains('closing')).toBe(true);
      expect($('#sheet').hidden).toBe(false);
      expect($('#app').hasAttribute('inert')).toBe(false); // the page is usable right away
      await settle();
      await tap('#basis'); // reopened
      expect($('#sheet').classList.contains('closing')).toBe(false);
      expect($('#sheet .sheet')).not.toBeNull();
      await tap('#sheet .sheet-close');
      await wait(220);
      expect($('#sheet').hidden).toBe(true);
      expect($('#sheet').children).toHaveLength(0);
    } finally {
      delete (window as { matchMedia?: unknown }).matchMedia;
    }
  });

  it('another mood never borrows the previous mood\'s cards while its own are on the way', async () => {
    const gps = deferred<Point>();
    let n = 0;
    render({ locate: () => (++n === 1 ? Promise.resolve(ORIGINS.제주시) : gps.promise), delays: { slow: 10_000, long: 20_000, settle: 300 } });
    await tap('[data-mood="rest"]');
    expect(cardNames()).toHaveLength(3);
    await tap('#results .change');
    await settle();
    await tap('[data-mood="walk"]');
    expect($('#crumb').textContent).toBe('좀 걷고 싶어');
    expect($$('#cards .card')).toHaveLength(0); // blank (then the still frame after 300ms), never rest's cards
    gps.resolve(ORIGINS.제주시);
    await flush();
    await flush();
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'walk'));
  });
});

describe('수명주기 (audit: listeners, destroy)', () => {
  it('a destroyed mount reacts to nothing — clicks, Escape, popstate', async () => {
    const a = render();
    await tap('#basis');
    const back = vi.spyOn(window.history, 'back');
    a.destroy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(back).not.toHaveBeenCalled();
    $('[data-mood="rest"]').click();
    await flush();
    expect(cardNames()).toEqual([]);
    back.mockRestore();
  });

  it('the 다른 3곳 bar: one IntersectionObserver on its 1px marker toggles .stuck, reused bar node; destroy() disconnects it (3판 §6.6·§12)', async () => {
    const made: { cb: IntersectionObserverCallback; targets: Element[]; disconnect: ReturnType<typeof vi.fn> }[] = [];
    class FakeIO {
      targets: Element[] = [];
      disconnect = vi.fn();
      constructor(public cb: IntersectionObserverCallback) {
        made.push(this);
      }
      observe(t: Element) {
        this.targets.push(t);
      }
      unobserve() {}
      takeRecords() {
        return [];
      }
    }
    (window as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIO;
    try {
      const a = render();
      await tap('[data-mood="rest"]');
      const bar = $('#cards .more-bar');
      expect(made).toHaveLength(1);
      expect(made[0].targets).toEqual([bar.querySelector('.more-end')]);
      const fire = (isIntersecting: boolean) => made[0].cb([{ isIntersecting } as IntersectionObserverEntry], made[0] as unknown as IntersectionObserver);
      fire(false);
      expect(bar.classList.contains('stuck')).toBe(true);
      fire(true);
      expect(bar.classList.contains('stuck')).toBe(false);
      await tap('#cards .more');
      expect($('#cards .more-bar')).toBe(bar); // same node, still observed
      expect(made).toHaveLength(1);
      a.destroy();
      expect(made[0].disconnect).toHaveBeenCalled();
    } finally {
      delete (window as { IntersectionObserver?: unknown }).IntersectionObserver;
    }
  });

  it('re-mounting on the same page leaves exactly one live set of listeners', async () => {
    const back = vi.spyOn(window.history, 'back');
    render();
    render();
    await tap('#basis');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });
});

describe('스타일 계약 (S9-4·S48·S49, audit hit-testing / tap targets)', () => {
  it('the sheet is its own layer above card hearts and the sticky top bar, and the page behind it doesn\'t scroll', () => {
    expect(cssRule('#sheet')).toMatch(/position:\s*relative/);
    expect(cssRule('#sheet')).toMatch(/z-index:\s*var\(--z-sheet\)/);
    const zSheet = Number(cssRule(':root').match(/--z-sheet:\s*(\d+)/)?.[1]);
    expect(zSheet).toBeGreaterThan(Number(cssRule('.heart').match(/z-index:\s*(\d+)/)?.[1]));
    expect(zSheet).toBeGreaterThan(Number(cssRule(':root').match(/--z-top:\s*(\d+)/)?.[1]));
    expect(css).toMatch(/html:has\(#sheet:not\(\[hidden\]\)\)\s*\{\s*overflow:\s*hidden/);
  });

  it('tap targets ≥ 44px: ♥ N, 기준, 식사/카페 tabs, 바꾸기·돌아가기, hearts 44×44, 다른 3곳 보기; no double-tap zoom', () => {
    // 3판: 바꾸기·돌아가기·지역으로 고르기·다시 정하기·예약 링크 are one .tbtn (was .change/.link/.book/.restay)
    for (const sel of ['.saved-btn', '.basis', '.tab', '.tbtn']) expect(cssRule(sel), sel).toMatch(/min-height:\s*44px/);
    expect(cssRule('.heart')).toMatch(/width:\s*44px/);
    expect(cssRule('.heart')).toMatch(/height:\s*44px/);
    expect(cssRule('.more')).toMatch(/min-height:\s*52px/);
    // Changed on purpose (ADR-0075 3): a mood row now holds 「예:」 and two 52px photos, so it is 84 tall from the start
    expect(cssRule('.mood')).toMatch(/min-height:\s*84px/);
    expect(cssRule('.opt')).toMatch(/min-height:\s*56px/);
    expect(cssRule('button')).toMatch(/touch-action:\s*manipulation/);
  });

  it('S48 large text: ♥ N never breaks inside ("♥" over "1") and stays on the bar; a long basis label wraps inside its button (QA r4)', () => {
    expect(cssRule('.saved-btn')).toMatch(/white-space:\s*nowrap/);
    expect(cssRule('.saved-btn')).toMatch(/flex:\s*none/);
    expect(cssRule('.basis')).not.toMatch(/white-space:\s*nowrap/);
    expect(cssRule('.basis')).toMatch(/min-width:\s*0/);
    expect(cssRule('.top')).not.toMatch(/flex-wrap:\s*wrap/);
    expect(cssRule('.top')).toMatch(/position:\s*sticky/);
  });

  it('S49 dark: first paint and splash are dark, photos dimmed a little', () => {
    expect(html).toMatch(/<style>html\{background:#ffffff\}@media \(prefers-color-scheme:dark\)\{html\{background:#0f1319\}\}<\/style>/);
    expect(html).toMatch(/name="color-scheme" content="light dark"/);
    expect(css).toMatch(/--photo:\s*brightness\(0\.9\)/);
    expect(cssRule('.ph img')).toMatch(/filter:\s*var\(--photo\)/);
  });

  it('audit: 아무거나 is its own underlined text button outside the list (no orphan half tile)', () => {
    render();
    expect($('.moods [data-mood="any"]')).toBeNull();
    expect($('.moods').nextElementSibling).toBe($('[data-mood="any"]'));
    expect(cssRule('.any')).toMatch(/text-decoration:\s*underline/);
    expect(cssRule('.any')).toMatch(/align-self:\s*flex-start/);
  });
});

// QA 2026-09-30 (plans/tomorrow-picker.md S9-1·S9-2): findings of the final code audit, one test each.
describe('QA 2026-09-30 — 새로고침·뒤로가기 정합성', () => {
  const entry = (view: string, depth: number) => ({ jeju: 1, view, overlay: null, depth });

  it('reloaded on a results entry with no session record: that entry is consumed, so no back press is dead', async () => {
    window.history.replaceState(entry('home', 0), '');
    window.history.pushState(entry('cards', 1), '');
    const length = window.history.length;
    render();
    await settle();
    expect(window.history.state).toMatchObject({ view: 'home', depth: 0 });
    expect(window.history.length).toBe(length); // the results entry is only "forward" now
    await tap('[data-mood="rest"]');
    await settle();
    expect(window.history.state).toMatchObject({ view: 'cards', depth: 1 });
    window.history.back();
    await settle();
    expect(window.history.state).toMatchObject({ view: 'home', depth: 0 }); // one back = first screen
    expect(cardNames()).toHaveLength(0);
  });

  it('the session record follows the mood asked for: a reload while it loads, or on its failure notice, brings that mood back', async () => {
    let fail = false;
    const locate = () => (fail ? Promise.reject(new LocateError('unavailable')) : Promise.resolve(ORIGINS.제주시));
    render({ locate });
    await tap('[data-mood="rest"]');
    const rest = cardNames();
    await tap('#results .change');
    await settle();
    fail = true;
    await tap('[data-mood="walk"]');
    expect($('.notice-t')?.textContent).toBe('위치를 확인하지 못했어요.');
    expect($('#crumb').textContent).toBe('좀 걷고 싶어');
    fail = false;
    render({ locate }); // pull to refresh with location working again
    await flush();
    await flush();
    expect($('#crumb').textContent).toBe('좀 걷고 싶어');
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'walk'));
    expect(cardNames()).not.toEqual(rest);
  });

  it('switching 식사 → 카페·디저트 then reloading while it loads comes back to 카페·디저트, not 식사', async () => {
    const slow = deferred<unknown>();
    let calls = 0;
    render({ loadSpots: () => (++calls === 1 ? Promise.resolve(fileSpots) : slow.promise) });
    await tap('[data-mood="food"]');
    await tap('[data-sub="cafe"]');
    render(); // reload before the 카페 cards were drawn
    await flush();
    await flush();
    expect($('[data-sub="cafe"]').getAttribute('aria-pressed')).toBe('true');
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'food', 'cafe'));
  });

  it('phone back to the first screen, reload, then forward: the results entry shows its mood again (not a blank entry)', async () => {
    render();
    await tap('[data-mood="walk"]');
    const walk = cardNames();
    window.history.back();
    await settle();
    expect(cardNames()).toHaveLength(0);
    render(); // reload on the first screen: nothing in memory
    await flush();
    window.history.forward();
    await settle();
    expect(shownMood()).toEqual(['walk']);
    expect(cardNames()).toEqual(walk);
    // no session record at all: forward onto it steps straight back, so no back press is ever dead
    window.history.back();
    await settle();
    window.sessionStorage.clear();
    render();
    await flush();
    window.history.forward();
    await settle();
    expect(window.history.state).toMatchObject({ view: 'home', depth: 0 });
    expect(cardNames()).toHaveLength(0);
  });

  it('바꾸기 clears the record: a reload on the first screen shows the first screen', async () => {
    render();
    await tap('[data-mood="rest"]');
    expect(window.sessionStorage.getItem('jeju.session')).toContain('"rest"');
    await tap('#results .change');
    await settle();
    expect(window.sessionStorage.getItem('jeju.session')).toBeNull();
  });

  it('바꾸기 then phone forward onto the results: the record is written again, so a reload keeps those cards', async () => {
    render();
    await tap('[data-mood="walk"]');
    const ids = cardIds();
    await tap('#results .change');
    await settle();
    window.history.forward();
    await settle();
    expect(cardIds()).toEqual(ids);
    expect(JSON.parse(window.sessionStorage.getItem('jeju.session')!)).toMatchObject({ mood: 'walk' });
    render(); // pull to refresh on the results entry
    await flush();
    await flush();
    expect(shownMood()).toEqual(['walk']);
    expect(cardIds()).toEqual(ids);
  });
});

describe('QA 2026-09-30 — 다른 3곳 보기·저장 목록·사진', () => {
  it('"다른 3곳 보기" measures from where the 3 on screen were measured: no new GPS call, no failure path', async () => {
    let calls = 0;
    let fail = false;
    render({
      locate: () => {
        calls++;
        return fail ? Promise.reject(new LocateError('unavailable')) : Promise.resolve(ORIGINS.제주시);
      },
    });
    await tap('[data-mood="rest"]');
    const first = cardNames();
    expect(calls).toBe(1);
    fail = true;
    await tap('#cards .more');
    await tap('#cards .more');
    expect(calls).toBe(1);
    expect($('.notice')).toBeNull();
    expect(cardNames()).toHaveLength(3);
    expect(cardNames().filter((n) => first.includes(n))).toEqual([]);
  });

  it('saved list while GPS never answers (a prompt left open): after a moment it shows (no trips), the label unchanged', async () => {
    const [a, b] = realSpots;
    window.localStorage.setItem('jeju.saved', JSON.stringify([a.id, b.id]));
    render({ locate: hang, delays: ESCAPE_30 });
    await tap('#saved');
    await wait(40); // delays.long = 30 here (3s in the app)
    expect(cardIds()).toEqual([a.id, b.id]);
    expect($$('#savedView .travel')).toHaveLength(0);
    expect($('#basis').textContent).toBe('내 위치 근처'); // nothing failed; it just didn't answer
  });

  it('photos lost while offline come back once online (in place), a photo broken while online stays dropped', async () => {
    let online = false;
    render({ online: () => online });
    await tap('[data-mood="rest"]');
    const [lead, row1] = $$('#cards .card');
    lead.querySelector('img')!.dispatchEvent(new Event('error'));
    expect(lead.classList.contains('noimg')).toBe(true);
    online = true;
    window.dispatchEvent(new Event('online'));
    expect(lead.isConnected).toBe(true);
    expect(lead.classList.contains('noimg')).toBe(false);
    expect(lead.querySelector('.ph img')).not.toBeNull();
    row1.querySelector('img')!.dispatchEvent(new Event('error'));
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
    expect(row1.classList.contains('noimg')).toBe(true);
  });

  it('a mood tapped before the app script ran (slow first visit) is carried out once it has', async () => {
    const w = window as Window & { __tap?: string; __early?: EventListener };
    const early = vi.fn();
    w.__early = early;
    window.addEventListener('click', early, true);
    w.__tap = 'walk';
    render();
    await flush();
    await flush();
    expect(shownMood()).toEqual(['walk']);
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'walk'));
    expect(w.__tap).toBeUndefined();
    document.body.click();
    expect(early).not.toHaveBeenCalled(); // the early listener is gone
  });
});

// QA 2026-09-30 round 2 (design/qa/r2-open.json): the screen fixes itself when the reason for a notice is gone,
// and nothing is rebuilt or greyed out under the thumb for news that changes nothing on it.
describe('QA 2026-09-30 r2 — 저절로 제자리로, 손가락 밑은 그대로', () => {
  it('S67 the same mood again (GPS basis): its still-valid cards stay while GPS re-checks — no grey frame, same nodes', async () => {
    const again = deferred<Point>();
    let n = 0;
    render({ locate: () => (++n === 1 ? Promise.resolve(ORIGINS.제주시) : again.promise), delays: { slow: 20, long: 10_000, settle: 300 } });
    await tap('[data-mood="rest"]');
    await wait(30);
    const ids = cardIds();
    expect(ids).toHaveLength(3);
    await tap('#results .change');
    await settle();
    await tap('[data-mood="rest"]');
    const lead = $('#cards .card');
    expect(cardIds()).toEqual(ids);
    await wait(40); // past `slow`: before, 3 grey frames replaced the cards here
    expect(status()).toBe('위치 확인 중…'); // honest: it is re-checking
    expect($$('#cards .ghost')).toHaveLength(0);
    expect(cardIds()).toEqual(ids);
    again.resolve(ORIGINS.제주시);
    await flush();
    await flush();
    expect(cardIds()).toEqual(ids);
    expect($('#cards .card')).toBe(lead); // never rebuilt
    expect(status()).toBe('');
  });

  it('S67 a mood whose cards no longer fit (another sub) still gets the still frame when slow', async () => {
    const later = deferred<unknown>();
    let calls = 0;
    window.localStorage.setItem('jeju.region', JSON.stringify('애월'));
    window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
    render({ loadSpots: () => (++calls === 1 ? Promise.resolve(fileSpots) : later.promise), delays: { slow: 20, long: 10_000, settle: 300 } });
    await tap('[data-mood="food"]');
    await wait(30);
    expect(cardIds()).toHaveLength(3);
    const meal = cardIds();
    await tap('[data-sub="cafe"]'); // data is memoized: this resolves at once
    expect(cardIds()).not.toEqual(meal);
    expect($$('#cards .ghost')).toHaveLength(0);
  });

  it('S07 a GPS denial arriving while the basis sheet is open patches "내 위치" in place: the sheet is not rebuilt, focus stays', async () => {
    const gps = deferred<Point>();
    let permission: 'prompt' | 'granted' = 'prompt';
    let n = 0;
    render({ locate: () => (++n === 1 ? gps.promise : Promise.resolve(ORIGINS.제주시)), geoPermission: async () => permission });
    await tap('[data-mood="rest"]');
    await tap('#basis');
    const panel = $('#sheet .sheet');
    const seongsan = $('#sheet [data-area="성산"]');
    seongsan.focus();
    expect($('#sheet [data-basis="gps"] .lm')).toBeNull();
    gps.reject(new LocateError('denied'));
    await flush();
    await flush();
    expect($('#sheet [data-basis="gps"] .lm')?.textContent).toBe('위치 권한이 꺼져 있어요');
    expect($('#sheet .sheet')).toBe(panel);
    expect($('#sheet [data-area="성산"]')).toBe(seongsan);
    expect(document.activeElement).toBe(seongsan);
    // turned back on (settings) while the sheet is still open: the line goes, the sheet stays (the cards
    // come in underneath it, S68)
    permission = 'granted';
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    await flush();
    await flush();
    expect($('#sheet [data-basis="gps"] .lm')).toBeNull();
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'rest'));
    expect($('#sheet .sheet')).toBe(panel);
    expect(document.activeElement).toBe(seongsan);
  });

  it('S68 location turned back on in settings: coming back shows the cards (no denied notice under a 내 주변 label)', async () => {
    let permission: 'denied' | 'granted' = 'denied';
    const locate = vi.fn(() => Promise.resolve(ORIGINS.제주시));
    render({ locate, geoPermission: async () => permission });
    await tap('[data-mood="rest"]');
    expect($('.notice-t')?.textContent).toBe('위치 권한이 꺼져 있어요.');
    expect($('#basis').textContent).toBe('지역 고르기');
    document.dispatchEvent(new Event('visibilitychange')); // back, still off: the notice stays, GPS not asked
    await flush();
    await flush();
    expect($('.notice-t')?.textContent).toBe('위치 권한이 꺼져 있어요.');
    expect(locate).not.toHaveBeenCalled();
    permission = 'granted';
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    await flush();
    await flush();
    expect($('#basis').textContent).toBe('내 위치 근처');
    expect($('.notice')).toBeNull();
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'rest'));
  });

  it('S69 back online after an offline load failure: the results and the saved list come by themselves', async () => {
    let online = false;
    const loadSpots = () => (online ? Promise.resolve(fileSpots) : Promise.reject(new TypeError('Failed to fetch')));
    render({ online: () => online, loadSpots });
    await tap('[data-mood="rest"]');
    expect($('.notice-t')?.textContent).toBe('오프라인이라 목록을 불러오지 못했어요.');
    online = true;
    window.dispatchEvent(new Event('online'));
    await flush();
    await flush();
    expect($('.notice')).toBeNull();
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'rest'));

    reset();
    online = false;
    window.localStorage.setItem('jeju.saved', JSON.stringify([realSpots[0].id]));
    render({ online: () => online, loadSpots });
    await tap('#saved');
    expect($('#savedView .notice-t')?.textContent).toBe('오프라인이라 목록을 불러오지 못했어요.');
    online = true;
    window.dispatchEvent(new Event('online'));
    await flush();
    await flush();
    expect($('#savedView .notice')).toBeNull();
    expect(cardIds()).toEqual([realSpots[0].id]);
  });

  it('S70 weak network: the list that lands after its 15s timeout replaces the failure notice by itself — one download', async () => {
    const data = deferred<unknown>();
    const loadSpots = vi.fn(() => data.promise);
    window.localStorage.setItem('jeju.region', JSON.stringify('애월'));
    window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
    render({ loadSpots, delays: { slow: 0, long: 10_000, settle: 300, dataTimeout: 20 } });
    await tap('[data-mood="walk"]');
    await wait(40); // past the (20ms here) timeout
    expect($('.notice-t')?.textContent).toBe('목록을 불러오지 못했어요.');
    data.resolve(fileSpots); // the download that was still going lands
    await flush();
    await flush();
    await flush();
    expect($('.notice')).toBeNull();
    expect(cardNames()).toEqual(expectedNames(area('애월'), 'walk'));
    expect(loadSpots).toHaveBeenCalledTimes(1);
  });
});

describe('날짜 모드 (specs/date-mode.md D1–D6)', () => {
  const TODAY = '2026-09-30';
  const TOMORROW = '2026-10-01';
  let wall = new Date('2026-09-30T12:00:00+09:00');
  const at = (iso: string) => (wall = new Date(iso));
  const open = (deps = {}) => render({ today: () => wall, ...deps });
  const [a, b, c, d, e] = realSpots.map((s) => s.id);
  const v2 = () => JSON.parse(window.localStorage.getItem('jeju.saved.v2') ?? '[]') as { id: string; date: string; order: number }[];
  const seed = (entries: [string, string][]) => {
    const n = new Map<string, number>();
    window.localStorage.setItem(
      'jeju.saved.v2',
      JSON.stringify(entries.map(([id, date]) => ({ id, date, order: (n.set(date, (n.get(date) ?? -1) + 1), n.get(date)!) }))),
    );
  };
  /** the saved list as drawn: [day heading, ids] per section */
  const sections = () =>
    $$('#savedView .day').map((sec) => [sec.querySelector('.day-h')!.textContent, [...sec.querySelectorAll<HTMLElement>('.card')].map((x) => x.dataset.id)]);
  const row = (id: string) => $(`#savedView .card[data-id="${id}"]`);
  const ctl = (id: string, action: string) => row(id).querySelector<HTMLElement>(`[data-action="${action}"]`)!;
  const interactiveCount = () =>
    $$('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])').filter((x) => !x.closest('[hidden]') && !x.closest('#sheet')).length;
  beforeEach(() => {
    at('2026-09-30T12:00:00+09:00');
  });

  it('D1 the first screen is as before: same interactive elements, label 내 위치 근처, no date in it', () => {
    open();
    expect(interactiveCount()).toBe(6);
    expect($('#basis').textContent).toBe('내 위치 근처');
    expect($('#saved').hidden).toBe(true);
  });

  it('D2 basis sheet: 언제 (지금 / 내일 / 날짜 고르기) above 어디; 내일 puts the date in the label and the sheet stays open', async () => {
    open();
    await tap('#basis');
    const when = $$('#sheet .opts')[0];
    expect($('#sheet .group-h').textContent).toBe('언제');
    expect([...when.querySelectorAll('.opt .nm')].map((x) => x.textContent)).toEqual(['지금', '내일', '날짜 고르기']);
    expect($('#sheet [data-when="now"]').getAttribute('aria-pressed')).toBe('true');
    const input = $<HTMLInputElement>('#sheet input[type="date"]');
    expect(input.min).toBe(TODAY);
    const entry = window.history.state;
    await tap('#sheet [data-when="2026-10-01"]');
    expect($('#sheet').hidden).toBe(false);
    expect(window.history.state).toEqual(entry); // no history change: still the sheet's entry
    expect($('#sheet [data-when="2026-10-01"]').getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe($('#sheet [data-when="2026-10-01"]'));
    expect($('#basis').textContent).toBe('내일 · 내 위치 근처');
    expect(JSON.parse(window.localStorage.getItem('jeju.when')!)).toBe(TOMORROW);
    await tap('#sheet [data-area="애월"]');
    await settle();
    expect($('#sheet').hidden).toBe(true);
    expect($('#basis').textContent).toBe('내일 · 애월 근처');
    expect($('#basis').getAttribute('aria-label')).toBe('내일 · 애월 근처, 기준 바꾸기');
  });

  it('D2 날짜 고르기: a later day picked in the native field → "10월 3일 · …"; today or earlier → 지금', async () => {
    open();
    await tap('#basis');
    const input = $<HTMLInputElement>('#sheet input[type="date"]');
    input.value = '2026-10-03';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect($('#basis').textContent).toBe('10월 3일 · 내 위치 근처');
    expect($('#sheet [data-action="pick-day"]').getAttribute('aria-pressed')).toBe('true');
    expect($('#sheet [data-action="pick-day"] .lm').textContent).toBe('10월 3일 토요일');
    const again = $<HTMLInputElement>('#sheet input[type="date"]');
    again.value = '2026-09-29';
    again.dispatchEvent(new Event('change', { bubbles: true }));
    expect($('#basis').textContent).toBe('10월 3일 · 내 위치 근처'); // before today: ignored
    again.value = TODAY;
    again.dispatchEvent(new Event('change', { bubbles: true }));
    expect($('#basis').textContent).toBe('내 위치 근처');
  });

  it('날짜 고르기 with no showPicker (older browsers): the date field itself shows and takes the focus', async () => {
    open();
    await tap('#basis');
    const input = $<HTMLInputElement>('#sheet input[type="date"]');
    (input as { showPicker?: unknown }).showPicker = undefined;
    await tap('#sheet [data-action="pick-day"]');
    expect(input.classList.contains('sr')).toBe(false);
    expect(input.hasAttribute('aria-hidden')).toBe(false);
    expect(document.activeElement).toBe(input);
  });

  it('D2 a heart goes to the chosen day and is filled only for that day; the same place can go on two days', async () => {
    open();
    await tap('[data-mood="rest"]');
    const id = $('.card').dataset.id!;
    await tap('.card .heart');
    expect(v2()).toEqual([{ id, date: TODAY, order: 0, at: TODAY }]); // at: the day saved (ADR-0085)
    await tap('#basis');
    await tap('#sheet [data-when="2026-10-01"]');
    await tap('#sheet .sheet-close');
    await settle();
    expect($('.card .heart').getAttribute('aria-pressed')).toBe('false'); // not saved for 내일 yet
    await tap('.card .heart');
    expect($('.card .heart').getAttribute('aria-pressed')).toBe('true');
    expect(v2()).toEqual([
      { id, date: TODAY, order: 0, at: TODAY },
      { id, date: TOMORROW, order: 0, at: TODAY },
    ]);
    expect($('#saved').textContent).toBe('2');
  });

  it('D3 the saved list by day: 오늘, 내일, later dates, 지난 날 folded at the bottom; ♥ N counts today on', async () => {
    seed([[a, TODAY], [b, TODAY], [c, '2026-10-03'], [d, TOMORROW], [e, '2026-09-28']]);
    open();
    expect($('#saved').textContent).toBe('4');
    await tap('#saved');
    expect(sections()).toEqual([
      ['오늘', [a, b]],
      ['내일', [d]],
      ['10월 3일 토요일', [c]],
      ['지난 날펼치기', []],
    ]);
    expect($('#savedTitle .count').textContent).toBe('4');
    expect($('#savedView .sort').textContent).toBe(''); // no sort label any more
    const fold = $('#savedView [data-action="past"]');
    expect(fold.getAttribute('aria-expanded')).toBe('false');
    fold.focus(); // a click focuses the button in a browser; jsdom does not
    await tap(fold);
    expect($('#savedView [data-action="past"]').getAttribute('aria-expanded')).toBe('true');
    expect($('#savedView .past .group-h').textContent).toBe('9월 28일 월요일');
    expect(row(e)).not.toBeNull();
    expect(document.activeElement).toBe($('#savedView [data-action="past"]'));
  });

  it('D3 위로·아래로 (ends hidden), 다른 날로 (a sheet with history), 빼기 — all still there after a reload', async () => {
    seed([[a, TODAY], [b, TODAY], [c, TODAY], [d, TOMORROW]]);
    open();
    await tap('#saved');
    expect(ctl(a, 'up').hidden).toBe(true);
    expect(ctl(a, 'down').hidden).toBe(false);
    expect(ctl(c, 'down').hidden).toBe(true);
    expect(ctl(d, 'up').hidden && ctl(d, 'down').hidden).toBe(true);
    const photo = row(a).querySelector('img');
    ctl(a, 'down').focus();
    await tap(ctl(a, 'down'));
    expect(sections()[0]).toEqual(['오늘', [b, a, c]]);
    expect(row(a).querySelector('img')).toBe(photo); // the row moved, not rebuilt
    expect(document.activeElement).toBe(ctl(a, 'down'));
    // 다른 날로: its own sheet and history entry
    const length = window.history.length;
    ctl(c, 'move-day').focus();
    await tap(ctl(c, 'move-day'));
    expect($('#sheet').hidden).toBe(false);
    expect($('#sheet-title').textContent).toBe('어느 날로 옮길까요?');
    expect(window.history.state).toMatchObject({ view: 'saved', overlay: 'move' });
    expect(window.history.length).toBe(length + 1);
    expect($$('#sheet .opt .nm').map((x) => x.textContent)).toEqual(['오늘', '내일', '날짜 고르기']);
    expect($('#sheet [data-day="2026-09-30"]').getAttribute('aria-pressed')).toBe('true');
    await tap('#sheet [data-day="2026-10-01"]');
    await settle();
    expect($('#sheet').hidden).toBe(true);
    expect(window.history.state).toMatchObject({ view: 'saved', overlay: null });
    expect(sections()).toEqual([
      ['오늘', [b, a]],
      ['내일', [d, c]],
    ]);
    expect(document.activeElement).toBe(ctl(c, 'move-day'));
    // 빼기: the heart; the row stays (undo) with nothing to move
    await tap(row(b).querySelector<HTMLElement>('.heart')!);
    expect(row(b).querySelector('.heart')!.getAttribute('aria-pressed')).toBe('false');
    expect(row(b).querySelector<HTMLElement>('.ctl')!.hidden).toBe(true);
    expect(ctl(a, 'up').hidden).toBe(true); // a is the first live row now
    expect($('#saved').textContent).toBe('3');
    window.history.replaceState(null, ''); // a new visit (a reload here would reopen the list by itself)
    open();
    await tap('#saved');
    expect(sections()).toEqual([
      ['오늘', [a]],
      ['내일', [d, c]],
    ]);
  });

  it('D3 a heart taken out and put back in the saved list returns to its place', async () => {
    seed([[a, TODAY], [b, TODAY], [c, TODAY]]);
    open();
    await tap('#saved');
    const heart = () => row(b).querySelector<HTMLElement>('.heart')!;
    await tap(heart());
    await tap(heart());
    expect(heart().getAttribute('aria-pressed')).toBe('true');
    expect(v2().map((x) => x.id)).toEqual([a, b, c]);
  });

  it('D3 double taps: 아래로 moves once; 다른 날로 opens one sheet', async () => {
    seed([[a, TODAY], [b, TODAY], [c, TODAY]]);
    open();
    await tap('#saved');
    advance();
    ctl(a, 'down').click();
    ctl(a, 'down').click();
    await flush();
    expect(sections()[0]).toEqual(['오늘', [b, a, c]]);
    advance();
    const length = window.history.length;
    ctl(c, 'move-day').click();
    ctl(c, 'move-day').click();
    await flush();
    expect(window.history.length).toBe(length + 1);
  });

  it('다른 날로 sheet: phone back closes only the sheet; the row stays', async () => {
    seed([[a, TODAY], [b, TOMORROW]]);
    open();
    await tap('#saved');
    await tap(ctl(a, 'move-day'));
    window.history.back();
    await settle();
    expect($('#sheet').hidden).toBe(true);
    expect($('#savedView').hidden).toBe(false);
    expect(sections()[0]).toEqual(['오늘', [a]]);
    expect(window.history.state).toMatchObject({ view: 'saved', overlay: null });
  });

  it('D5 midnight: a chosen day that has come goes back to 지금; yesterday\'s saves go to 지난 날, out of ♥ N', async () => {
    seed([[a, TODAY], [b, TOMORROW]]);
    window.localStorage.setItem('jeju.when', JSON.stringify(TOMORROW));
    open();
    expect($('#basis').textContent).toBe('내일 · 내 위치 근처');
    expect($('#saved').textContent).toBe('2');
    at('2026-10-01T00:00:05+09:00');
    document.dispatchEvent(new Event('visibilitychange'));
    expect($('#basis').textContent).toBe('내 위치 근처');
    expect(JSON.parse(window.localStorage.getItem('jeju.when')!)).toBe('now');
    expect($('#date').textContent).toBe('10월 1일 목요일');
    expect($('#saved').textContent).toBe('1');
    await tap('#saved');
    expect(sections()).toEqual([
      ['오늘', [b]],
      ['지난 날펼치기', []],
    ]);
    open(); // and a reload the day after
    expect($('#basis').textContent).toBe('내 위치 근처');
  });

  it('D5 the midnight timer itself moves the day on (no need to leave the app)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      at('2026-09-30T23:59:00+09:00');
      window.localStorage.setItem('jeju.when', JSON.stringify(TOMORROW));
      open();
      expect($('#basis').textContent).toBe('내일 · 내 위치 근처');
      at('2026-10-01T00:00:02+09:00');
      vi.advanceTimersByTime(61_000);
      expect($('#basis').textContent).toBe('내 위치 근처');
      expect($('#date').textContent).toBe('10월 1일 목요일');
    } finally {
      vi.useRealTimers();
    }
  });

  it('D6 storage blocked: hearts per day and moves work from memory for the visit', async () => {
    open({ storage: null });
    await tap('[data-mood="rest"]');
    const [x, y] = $$('.card').map((k) => k.dataset.id!);
    await tap('.card .heart');
    await tap($$('.card .heart')[1]);
    await tap('#saved');
    expect(sections()).toEqual([['오늘', [x, y]]]);
    await tap(ctl(y, 'up'));
    expect(sections()).toEqual([['오늘', [y, x]]]);
  });
});

describe('얼마나 — 만족도 순과 범위 (ADR-0060, specs/ranking.md R1–R4)', () => {
  const reachRows = () => $$('#sheet [data-reach]');
  const pressedReach = () => reachRows().filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.reach);

  it('R4 basis sheet: 얼마나 right under the 어디 rows (before the 동네 index) — 걸어서 · 차로 30분 · 차로 1시간, 차로 30분 checked by default; the label has no range', async () => {
    render();
    await tap('#basis');
    const heads = $$('#sheet .group-h').map((h) => h.firstElementChild!.textContent);
    expect(heads).toEqual(['언제', '어디', '얼마나', '날씨', '제주시 쪽', '서귀포 쪽']);
    expect(reachRows().map((b) => b.querySelector('.nm')!.textContent)).toEqual(['걸어서', '차로 30분', '차로 1시간']);
    expect(pressedReach()).toEqual(['drive30']);
    // check-mark selection (SPEC 3판): each row carries the check, shown only on the chosen one by CSS
    for (const b of reachRows()) expect(b.querySelector('svg.i-check')).not.toBeNull();
    expect(reachRows()[0].closest('.opts')!.getAttribute('aria-labelledby')).toBe('reach-h');
    expect($('#basis').textContent).toBe('내 위치 근처');
  });

  it('R4 choosing a range on the results: stored, the sheet closes (history balanced), the same mood picked anew in that range; the label is unchanged', async () => {
    render();
    await tap('[data-mood="rest"]');
    await tap('#cards .more');
    const depth = window.history.state.depth;
    await tap('#basis');
    await tap('#sheet [data-reach="drive60"]');
    await settle();
    expect($('#sheet').hidden).toBe(true);
    expect(window.history.state.depth).toBe(depth);
    expect(JSON.parse(window.localStorage.getItem('jeju.reach')!)).toBe('drive60');
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'rest', undefined, 'drive60'));
    expect(state().cards?.how).toBe('new');
    expect($('#basis').textContent).toBe('내 위치 근처');
    // the rotation carries on inside the new range
    const first = cardNames();
    await tap('#cards .more');
    expect(cardNames().filter((n) => first.includes(n))).toEqual([]);
  });

  it('R4 the range in use again changes nothing; from the first screen it is stored for the next pick', async () => {
    render();
    await tap('[data-mood="walk"]');
    const shown = cardNames();
    await tap('#basis');
    await tap('#sheet [data-reach="drive30"]');
    await settle();
    expect($('#sheet').hidden).toBe(true);
    expect(cardNames()).toEqual(shown);
    await tap('#results .change');
    await settle();
    await tap('#basis');
    await tap('#sheet [data-reach="drive60"]');
    await settle();
    await tap('[data-mood="new"]');
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'new', undefined, 'drive60'));
  });

  it('R4 the range survives a reload (and so do the cards picked in it); an area basis follows the same rule', async () => {
    window.localStorage.setItem('jeju.region', JSON.stringify('애월'));
    window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
    render();
    await tap('#basis');
    await tap('#sheet [data-reach="drive60"]');
    await settle();
    await tap('[data-mood="rest"]');
    expect(cardNames()).toEqual(expectedNames(area('애월'), 'rest', undefined, 'drive60'));
    const looking = cardNames();
    render(); // reload on the results
    await flush();
    await flush();
    expect(cardNames()).toEqual(looking);
    expect($('#basis').textContent).toBe('애월 근처');
    await tap('#basis');
    expect(pressedReach()).toEqual(['drive60']);
  });

  it('R4 storage blocked: the range still applies for the visit', async () => {
    render({ storage: null });
    await tap('#basis');
    await tap('#sheet [data-reach="walk"]');
    await settle();
    await tap('[data-mood="new"]');
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'new', undefined, 'walk'));
  });

  it('R4 a range picked on the saved list asks for nothing there; back on the results the mood is picked in it', async () => {
    render();
    await tap('[data-mood="rest"]');
    await tap('.card .heart');
    await tap('#saved');
    await tap('#basis');
    await tap('#sheet [data-reach="drive60"]');
    await settle();
    expect($('#savedView').hidden).toBe(false);
    await tap('#savedView [data-action="close-saved"]');
    await settle();
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'rest', undefined, 'drive60'));
  });

  it('R4 the score is never on screen: no number, star or attribute for it, on any card of any mood', async () => {
    render();
    const words = /score|점수|별점|평점|★|☆/i;
    for (const mood of ['rest', 'walk', 'new', 'food', 'any'] as const) {
      await tap('#results .change').catch(() => undefined);
      await settle();
      await tap(`[data-mood="${mood}"]`);
      expect($$('.card')).toHaveLength(3);
      expect(document.body.innerHTML).not.toMatch(words);
      for (const c of $$('.card')) {
        const spot = realSpots.find((s) => s.id === c.dataset.id)!;
        expect([...c.querySelectorAll('*')].some((n) => [...n.attributes].some((a) => /score/i.test(a.name)))).toBe(false);
        expect(c.textContent).not.toContain(`${spot.score}점`);
      }
    }
  });
});

// ADR-0064, specs/new-sub.md N3·N4: 새로운 거 섞어서 · 구경 · 체험 — the 먹기 tabs' part and rules.
describe('새로운 거 섞어서 · 구경 · 체험', () => {
  const newTabs = () => $$('#newSub [data-sub]');
  const pressedTab = () => newTabs().filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.sub);
  const subsOnScreen = () => cardIds().map((id) => realSpots.find((s) => s.id === id)?.sub);

  it('N3 the first screen is unchanged; the tabs show only on 새로운 거 results, 섞어서 by default with the same 3 as before', async () => {
    render();
    expect($$('#home [data-mood]')).toHaveLength(5);
    expect($('#newSub').hidden).toBe(true);
    for (const mood of ['rest', 'walk', 'food', 'any'] as const) {
      await tap(`[data-mood="${mood}"]`);
      expect($('#newSub').hidden, mood).toBe(true);
    }
    await tap('[data-mood="new"]');
    expect($('#newSub').hidden).toBe(false);
    expect($('#foodSub').hidden).toBe(true);
    expect($('#newSub').getAttribute('role')).toBe('group');
    expect($('#newSub').getAttribute('aria-label')).toBe('새로운 거 종류');
    expect(newTabs().map((b) => b.textContent)).toEqual(['섞어서', '구경', '체험']);
    expect(newTabs().every((b) => b.classList.contains('tab') && b.getAttribute('type') === 'button')).toBe(true);
    expect(pressedTab()).toEqual(['mix']);
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'new'));
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'new', 'mix'));
  });

  it('N4 구경 / 체험 show only that kind; back to 섞어서 brings back the same 3; each tab rotates on its own; no history entry', async () => {
    render();
    await tap('[data-mood="new"]');
    const mix1 = cardNames();
    const depth = window.history.state.depth;
    await tap('[data-sub="sight"]');
    expect(pressedTab()).toEqual(['sight']);
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'new', 'sight'));
    expect(subsOnScreen()).toEqual(['sight', 'sight', 'sight']);
    const sight1 = cardNames();
    await tap('[data-sub="do"]');
    expect(pressedTab()).toEqual(['do']);
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'new', 'do'));
    expect(subsOnScreen()).toEqual(['do', 'do', 'do']);
    await tap('[data-sub="mix"]');
    expect(cardNames()).toEqual(mix1);
    expect(window.history.state.depth).toBe(depth);
    await tap('[data-sub="sight"]');
    expect(cardNames()).toEqual(sight1);
    await tap('#cards .more');
    const sight2 = cardNames();
    expect(sight2.filter((n) => sight1.includes(n))).toEqual([]);
    expect(subsOnScreen()).toEqual(['sight', 'sight', 'sight']);
    expect(Object.keys(state().histories).sort()).toEqual(['new:do', 'new:mix', 'new:sight']);
    // the tab already chosen again is a no-op
    await tap('[data-sub="sight"]');
    expect(cardNames()).toEqual(sight2);
  });

  it('N4 a double tap on a tab is one tap; tabs switched while loading: only the last one counts', async () => {
    const later = deferred<unknown>();
    let calls = 0;
    render({ loadSpots: () => (++calls === 1 ? Promise.resolve(fileSpots) : later.promise) });
    await tap('[data-mood="new"]');
    advance();
    $('[data-sub="sight"]').click();
    await flush();
    $('[data-sub="sight"]').click(); // same instant: the 2nd half of a double tap
    await flush();
    await flush();
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'new', 'sight'));
    expect(state().histories['new:sight']?.seen).toHaveLength(3);
    // GPS slow: 체험 then 구경 before either lands → 구경 only
    const gps = deferred<Point>();
    const gps2 = deferred<Point>();
    let n = 0;
    window.history.replaceState(null, '');
    window.sessionStorage.clear();
    render({ locate: () => (++n === 1 ? Promise.resolve(ORIGINS.제주시) : n === 2 ? gps.promise : gps2.promise) });
    await tap('[data-mood="new"]');
    await tap('[data-sub="do"]');
    await tap('[data-sub="sight"]');
    gps2.resolve(ORIGINS.제주시);
    await flush();
    await flush();
    gps.resolve(ORIGINS.서귀포); // the older request lands last
    await flush();
    await flush();
    expect(pressedTab()).toEqual(['sight']);
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'new', 'sight'));
  });

  it('N4 the tab is remembered: 바꾸기 and back to 새로운 거 keeps 구경 (and its 3); the food tab is its own', async () => {
    render();
    await tap('[data-mood="new"]');
    await tap('[data-sub="do"]');
    const doing = cardNames();
    await tap('#results .change');
    await settle();
    await tap('[data-mood="food"]');
    expect($('[data-sub="meal"]').getAttribute('aria-pressed')).toBe('true');
    await tap('[data-sub="cafe"]');
    await tap('#results .change');
    await settle();
    await tap('[data-mood="new"]');
    expect(pressedTab()).toEqual(['do']);
    expect(cardNames()).toEqual(doing);
    await tap('#results .change');
    await settle();
    await tap('[data-mood="food"]');
    expect($('[data-sub="cafe"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('N4 reload / discarded tab: the same tab and the same 3 come back; a reload while it loads keeps the tab too', async () => {
    render();
    await tap('[data-mood="new"]');
    await tap('[data-sub="sight"]');
    await tap('#cards .more');
    const looking = cardNames();
    render();
    await flush();
    await flush();
    expect(pressedMoods()).toEqual(['new']);
    expect(pressedTab()).toEqual(['sight']);
    expect(cardNames()).toEqual(looking);
    expect(JSON.parse(window.sessionStorage.getItem('jeju.session')!).newSub).toBe('sight');
    // switched to 체험 and reloaded before its cards came
    const slow = deferred<unknown>();
    let calls = 0;
    render({ loadSpots: () => (++calls === 1 ? Promise.resolve(fileSpots) : slow.promise) });
    await flush();
    await flush();
    await tap('[data-sub="do"]');
    render();
    await flush();
    await flush();
    expect(pressedTab()).toEqual(['do']);
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'new', 'do'));
  });

  it('N4 아무거나 draws from the mixed 새로운 거 pool, whichever tab was last chosen', async () => {
    render();
    await tap('[data-mood="new"]');
    await tap('[data-sub="sight"]');
    await tap('#results .change');
    await settle();
    await tap('[data-mood="any"]');
    expect($('#newSub').hidden).toBe(true);
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'any'));
  });

  it('N4 the tabs use the 먹기 tab rule: 44px tall, a 48px hit area (::before inset -2px -8px)', () => {
    expect(cssRule('.tab')).toMatch(/min-height:\s*44px/);
    expect(cssRule('.tab::before')).toMatch(/inset:\s*-2px -8px/);
    expect(html).toMatch(/<div id="newSub" class="tabs" role="group" aria-label="새로운 거 종류" hidden>/);
  });
});

describe('비 와요(실내만) (ADR-0065, specs/indoor.md I3·I4)', () => {
  const toggle = () => $('#sheet [data-indoor]');
  const indoorNames = (o: Point, b: 'rest' | 'walk' | 'new' | 'food' | 'any', sub?: 'meal' | 'cafe' | 'mix' | 'sight' | 'do') =>
    pickCards(realSpots, o, b, {}, sub, 'drive30', true).cards.map((c) => c.spot.name);

  it('I3 one row under 얼마나 (before the 동네 index), off by default; the first screen keeps its 5 moods and nothing else to tap', async () => {
    render();
    expect($$('#home button')).toHaveLength(5);
    await tap('#basis');
    expect($$('#sheet [data-indoor]')).toHaveLength(1);
    expect(toggle().querySelector('.nm')!.textContent).toBe('비 와요(실내만)');
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(toggle().querySelector('svg.i-check')).not.toBeNull();
    expect(toggle().closest('.opts')!.getAttribute('aria-labelledby')).toBe('weather-h');
    expect($('#weather-h').textContent).toBe('날씨');
    // off: the cards are exactly the ones before the toggle, with no 실내 word
    await tap('#sheet .sheet-close');
    await settle();
    await tap('[data-mood="rest"]');
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'rest'));
    expect($$('#cards .indoor')).toHaveLength(0);
  });

  it('I4 on the results: on, kept for the session (not on the device), the sheet closes (history balanced), the same mood picked anew indoors with 실내 on each card', async () => {
    render();
    await tap('[data-mood="rest"]');
    const depth = window.history.state.depth;
    await tap('#basis');
    await tap(toggle());
    await settle();
    expect($('#sheet').hidden).toBe(true);
    expect(window.history.state.depth).toBe(depth);
    expect(window.sessionStorage.getItem('jeju.indoor')).toBe('true');
    expect(window.localStorage.getItem('jeju.indoor')).toBeNull();
    expect(cardNames()).toEqual(indoorNames(ORIGINS.제주시, 'rest'));
    expect(state().cards?.how).toBe('new');
    expect($$('#cards .card').map((c) => c.querySelector('.meta .indoor')?.textContent)).toEqual(['실내', '실내', '실내']);
    expect($('#cards .card.lead .meta').textContent).toMatch(/^실내\u00a0· 여기서 /);
    expect($('#basis').textContent).toBe('내 위치 근처 · 실내만'); // ADR-0075 (was "여기 근처": 실내만 now said in the top bar)
    await tap('#basis');
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    // off again: the outdoor pick, no 실내, the session key gone
    await tap(toggle());
    await settle();
    expect(window.sessionStorage.getItem('jeju.indoor')).toBeNull();
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'rest'));
    expect($$('#cards .indoor')).toHaveLength(0);
  });

  it('I4 every mood and tab follows it: food·new tabs, 아무거나, 걷기 (widened to indoor 구경) — all indoor, 3 cards', async () => {
    window.sessionStorage.setItem('jeju.indoor', 'true');
    render();
    for (const mood of ['walk', 'new', 'food', 'any'] as const) {
      await tap('#results .change').catch(() => undefined);
      await settle();
      await tap(`[data-mood="${mood}"]`);
      expect(cardNames(), mood).toEqual(indoorNames(ORIGINS.제주시, mood, mood === 'food' ? 'meal' : mood === 'new' ? 'mix' : undefined));
      expect($$('#cards .card .indoor'), mood).toHaveLength(3);
    }
    await tap('#results .change');
    await settle();
    await tap('[data-mood="new"]');
    await tap('#newSub [data-sub="sight"]');
    expect(cardNames()).toEqual(indoorNames(ORIGINS.제주시, 'new', 'sight'));
    await tap('#results .change');
    await settle();
    await tap('[data-mood="food"]');
    await tap('#foodSub [data-sub="cafe"]');
    expect(cardNames()).toEqual(indoorNames(ORIGINS.제주시, 'food', 'cafe'));
  });

  it('I4 a double tap toggles once; on the saved list it asks for nothing, back on the results the mood is picked indoors', async () => {
    render();
    await tap('[data-mood="walk"]');
    await tap('.card .heart');
    await tap('#saved');
    await tap('#basis');
    const t = toggle();
    advance();
    t.click();
    advance(100);
    t.click();
    await settle();
    expect(state().indoor).toBe(true);
    expect($('#savedView').hidden).toBe(false);
    expect($$('#savedView .indoor')).toHaveLength(0);
    await tap('#savedView [data-action="close-saved"]');
    await settle();
    expect(cardNames()).toEqual(indoorNames(ORIGINS.제주시, 'walk'));
  });

  it('I4 a reload on the results keeps it and the same 3; storage blocked, it still applies for the visit', async () => {
    render();
    await tap('#basis');
    await tap(toggle());
    await settle();
    await tap('[data-mood="new"]');
    await tap('#cards .more');
    const looking = cardNames();
    render(); // reload
    await flush();
    await flush();
    expect(cardNames()).toEqual(looking);
    expect(state().indoor).toBe(true);
    expect($$('#cards .indoor')).toHaveLength(3);
    reset();
    render({ storage: null, session: null });
    await tap('#basis');
    await tap(toggle());
    await settle();
    await tap('[data-mood="rest"]');
    expect(cardNames()).toEqual(indoorNames(ORIGINS.제주시, 'rest'));
  });
});

describe('결과 화면 (ADR-0075, plans/home-refresh.md U1)', () => {
  const how = () => $('#how');

  it('#basis says 실내만 after the place while indoor is on, also with a day in front; the "·" never starts a line', async () => {
    window.sessionStorage.setItem('jeju.indoor', 'true');
    window.localStorage.setItem('jeju.region', JSON.stringify('서귀포시내'));
    window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
    render();
    expect($('#basis').textContent).toBe('서귀포 시내 근처 · 실내만');
    expect($('#basis').getAttribute('aria-label')).toBe('서귀포 시내 근처 · 실내만, 기준 바꾸기');
    expect($$('#basis .nw').map((e) => e.textContent)).toEqual(['근처 ·']);
    await tap('[data-mood="rest"]');
    await tap('#basis');
    await tap('#sheet [data-indoor]');
    await settle();
    expect($('#basis').textContent).toBe('서귀포 시내 근처');
    expect($$('#basis .nw')).toHaveLength(0);
  });

  it('the line over the cards: the range, then how; 실내 when indoor; not live, hidden off the cards (home, saved list)', async () => {
    render();
    expect(how().hidden).toBe(true);
    await tap('[data-mood="rest"]');
    expect(how().hidden).toBe(false);
    expect(how().textContent).toBe('차로 30분 안에서, 소개글로 볼 때 가 볼 만한 곳부터 골랐어요.');
    expect(how().getAttribute('role')).toBeNull();
    expect(how().getAttribute('aria-live')).toBeNull();
    expect(how().nextElementSibling).toBe($('#status'));
    await tap('#basis');
    await tap('#sheet [data-indoor]');
    await settle();
    expect(how().textContent).toBe('차로 30분 안의 실내 중에서, 소개글로 볼 때 가 볼 만한 곳부터 골랐어요.');
    await tap('.card .heart');
    await tap('#saved');
    expect(how().textContent).toBe('');
    expect(how().hidden).toBe(true);
    await tap('#savedView [data-action="close-saved"]');
    await settle();
    expect(how().hidden).toBe(false);
    await tap('#results .change');
    await settle();
    expect(how().hidden).toBe(true);
  });

  it.each([
    ['walk', '걸어서 15분 안에서, '],
    ['drive60', '차로 1시간 안에서, '],
  ] as const)('the range %s is said in its own words', async (reach, words) => {
    window.localStorage.setItem('jeju.reach', JSON.stringify(reach));
    render();
    await tap('[data-mood="food"]');
    expect(state().cards!.list.every((c) => withinReach(reach, ORIGINS.제주시, c.spot))).toBe(true);
    expect(how().textContent).toBe(`${words}소개글로 볼 때 가 볼 만한 곳부터 골랐어요.`);
  });

  it('widened to the nearest 3 on the island (a card past the range): says it took the nearest, not a range it did not keep', async () => {
    const far = fileSpots.filter((s) => s.mood !== 'rest' || !withinReach('drive30', ORIGINS.제주시, s));
    render({ loadSpots: () => Promise.resolve(far) });
    await tap('[data-mood="rest"]');
    expect(cardNames()).toHaveLength(3);
    expect(how().textContent).toBe('범위 안에 맞는 곳이 적어서 가장 가까운 곳으로 골랐어요.');
  });

  it('the first card\'s 길찾기 is the filled 48 line; the row cards\' and the saved rows\' stay the 44 text button', async () => {
    render();
    await tap('[data-mood="rest"]');
    expect($$('#cards .card.lead a.go')).toHaveLength(1);
    expect($$('#cards .card.row a.go')).toHaveLength(2);
    expect(cssRule('.card.lead .go')).toMatch(/min-height:\s*48px/);
    expect(cssRule('.card.lead .go')).toMatch(/background:\s*var\(--main-tint\)/);
    expect(cssRule('.card.lead .go')).toMatch(/color:\s*var\(--text\)/);
    expect(cssRule('.go')).not.toMatch(/min-height|background/);
    expect(cssRule('.alt')).toMatch(/margin:\s*20px 0 -8px/); // 20 gap + 20 = 40 under the first card
  });
});

describe('오일장 「오늘 열려요」 (ADR-0066, specs/market-days.md M4)', () => {
  let wall = new Date('2026-10-02T09:00:00+09:00'); // 제주민속 2·7일
  const at = (iso: string) => (wall = new Date(iso));
  const markets = fileSpots.filter((s) => s.market);
  const jeju = markets.find((s) => s.name === '제주민속오일시장')!;
  const hamdeok = markets.find((s) => s.name === '함덕민속오일시장')!;
  /** only the markets and the rest places, so the 구경 cards near 제주시 are markets */
  const open = () => render({ today: () => wall, loadSpots: () => Promise.resolve(fileSpots.filter((s) => s.market || s.mood === 'rest')) });
  const words = (): Record<string, string | null> => Object.fromEntries($$('#cards .card').map((c) => [c.dataset.id!, c.querySelector('.meta .market')?.textContent ?? null]));
  beforeEach(() => {
    at('2026-10-02T09:00:00+09:00');
  });

  it('now mode: 오늘 장 서는 날 on the market open today, 장날: {label} on the others, first in the meta line', async () => {
    open();
    await tap('[data-mood="new"]');
    await tap('[data-sub="sight"]');
    const w = words();
    expect(Object.keys(w)).toHaveLength(3);
    expect(w[jeju.id]).toBe('오늘 장 서는 날');
    expect(w[hamdeok.id]).toBe('장날: 1·6일');
    expect(Object.values(w).every((x) => x === '오늘 장 서는 날' || /^장날: \d+·\d+일$/.test(x!))).toBe(true);
    const lead = $('#cards .card.lead .meta').textContent!;
    expect(lead.startsWith(`${w[$('#cards .card.lead').dataset.id!]} · `)).toBe(true);
  });

  it('date mode: 이날 장 서는 날 for the chosen day; changing the day changes the words at once', async () => {
    window.localStorage.setItem('jeju.when', JSON.stringify('2026-10-06')); // 함덕 1·6일, not 제주민속
    open();
    await tap('[data-mood="new"]');
    await tap('[data-sub="sight"]');
    expect(words()[hamdeok.id]).toBe('이날 장 서는 날');
    expect(words()[jeju.id]).toBe('장날: 2·7일');
    await tap('#basis');
    await tap('#sheet [data-when="now"]'); // back to 지금 (10/2): 제주민속 today
    expect(words()[jeju.id]).toBe('오늘 장 서는 날');
    expect(words()[hamdeok.id]).toBe('장날: 1·6일');
  });

  it('midnight: the words follow the new today', async () => {
    at('2026-10-01T23:59:00+09:00');
    open();
    await tap('[data-mood="new"]');
    await tap('[data-sub="sight"]');
    expect(words()[jeju.id]).toBe('장날: 2·7일');
    expect(words()[hamdeok.id]).toBe('오늘 장 서는 날');
    at('2026-10-02T00:00:05+09:00');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(words()[jeju.id]).toBe('오늘 장 서는 날');
    expect(words()[hamdeok.id]).toBe('장날: 1·6일');
  });

  it('not on other cards, nor in the saved list', async () => {
    open();
    await tap('[data-mood="rest"]');
    expect($$('#cards .meta .market')).toHaveLength(0);
    await tap('#results .change');
    await settle();
    await tap('[data-mood="new"]');
    await tap('[data-sub="sight"]');
    await tap('#cards .card .heart');
    await tap('#saved');
    expect($$('#savedView .card')).toHaveLength(1);
    expect($$('#savedView .market')).toHaveLength(0);
  });
});

describe('철 (ADR-0080, specs/seasonal-spots.md S4)', () => {
  let wall = new Date('2026-03-10T09:00:00+09:00');
  const at = (iso: string) => (wall = new Date(iso));
  /** the rest places, each with 유채꽃 in March and a fixed 벚꽃 window */
  const seasoned = fileSpots
    .filter((s) => s.mood === 'rest')
    .map((s) => ({ ...s, season: [{ kind: 'cherry' as const, from: '2026-04-08', to: '2026-04-12' }, { kind: 'rapeseed' as const, months: [3] }] }));
  const fake = () => ({ event: vi.fn(), setEnabled: vi.fn() });
  const open = (analytics = fake()) => (render({ today: () => wall, loadSpots: () => Promise.resolve(seasoned), analytics }), analytics);
  const words = () => $$('#cards .card').map((c) => c.querySelector('.meta .season')?.textContent ?? null);
  beforeEach(() => {
    at('2026-03-10T09:00:00+09:00');
  });

  it('now mode in March: 유채꽃 철 on each card, first in the one meta line, held together with its separator', async () => {
    open();
    await tap('[data-mood="rest"]');
    expect(words()).toEqual(['유채꽃 철', '유채꽃 철', '유채꽃 철']);
    for (const c of $$('#cards .card')) {
      expect(c.querySelectorAll('.meta')).toHaveLength(1);
      const first = c.querySelector('.meta')!.firstElementChild!;
      expect(first.className).toBe('nw');
      expect(first.querySelector('.season')).toBeTruthy();
    }
    expect($('#cards .card.lead .meta').textContent!.startsWith('유채꽃 철 · ')).toBe(true);
  });

  it('the observed window: in on 4/10 (벚꽃 철), nothing on 4/20', async () => {
    at('2026-04-10T09:00:00+09:00');
    open();
    await tap('[data-mood="rest"]');
    expect(words()).toEqual(['벚꽃 철', '벚꽃 철', '벚꽃 철']);
    reset();
    at('2026-04-20T09:00:00+09:00');
    open();
    await tap('[data-mood="rest"]');
    expect(words()).toEqual([null, null, null]);
    expect($$('#cards .nw')).toHaveLength(0);
  });

  it('date mode: the chosen day; back to 지금 changes the words at once', async () => {
    window.localStorage.setItem('jeju.when', JSON.stringify('2026-04-10'));
    open();
    await tap('[data-mood="rest"]');
    expect(words()).toEqual(['벚꽃 철', '벚꽃 철', '벚꽃 철']);
    await tap('#basis');
    await tap('#sheet [data-when="now"]');
    expect(words()).toEqual(['유채꽃 철', '유채꽃 철', '유채꽃 철']);
  });

  it('a row card whose trip went to the 아니면 line: its meta line is the 철 words alone', async () => {
    // three places at one spot: the two rows share a trip, said once on the 아니면 line
    const [p, q, r] = seasoned;
    const three = [{ ...p, score: 5 }, { ...q, lat: p.lat, lng: p.lng, score: 4 }, { ...r, lat: p.lat, lng: p.lng, score: 4 }];
    render({ today: () => wall, loadSpots: () => Promise.resolve(three), locate: () => Promise.resolve({ lat: p.lat + 0.01, lng: p.lng }) });
    await tap('[data-mood="rest"]');
    expect($('#alt-trip')).toBeTruthy();
    const rows = $$('#cards .card.row');
    expect(rows).toHaveLength(2);
    for (const c of rows) expect(c.querySelector('.meta')!.textContent).toBe('유채꽃 철');
  });

  it('실내 on: 실내 · 유채꽃 철 · …', async () => {
    window.sessionStorage.setItem('jeju.indoor', 'true');
    open();
    await tap('[data-mood="rest"]');
    expect($('#cards .card.lead .meta').textContent!.startsWith('실내 · 유채꽃 철 · ')).toBe(true);
  });

  it('shown and map events carry season only while the card shows it; never in the saved list', async () => {
    const a = open();
    await tap('[data-mood="rest"]');
    const shown = a.event.mock.calls.map(([ev]) => ev).filter((ev) => ev.e === 'shown');
    expect(shown).toHaveLength(3);
    expect(shown.every((ev) => ev.season === 'rapeseed')).toBe(true);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    window.addEventListener('click', (e) => e.preventDefault(), { capture: true, once: true });
    $('#cards .card.lead .card-link').dispatchEvent(click);
    expect(a.event).toHaveBeenLastCalledWith(expect.objectContaining({ e: 'map', season: 'rapeseed' }));
    await tap('#cards .card .heart');
    expect(a.event).toHaveBeenLastCalledWith(expect.not.objectContaining({ season: expect.anything() }));
    await tap('#saved');
    expect($$('#savedView .card')).toHaveLength(1);
    expect($$('#savedView .season')).toHaveLength(0);
    advance();
    window.addEventListener('click', (e) => e.preventDefault(), { capture: true, once: true });
    $('#savedView .card-link').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const maps = a.event.mock.calls.map(([ev]) => ev).filter((ev) => ev.e === 'map');
    expect(maps).toHaveLength(2);
    expect('season' in maps[1]).toBe(false);
  });

  it('out of season: no season field on the events', async () => {
    at('2026-05-10T09:00:00+09:00');
    const a = open();
    await tap('[data-mood="rest"]');
    const shown = a.event.mock.calls.map(([ev]) => ev).filter((ev) => ev.e === 'shown');
    expect(shown).toHaveLength(3);
    expect(shown.some((ev) => 'season' in ev)).toBe(false);
  });
});
