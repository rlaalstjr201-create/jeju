// @vitest-environment jsdom
// design/qa/scenarios.md — one test per automatable row (named by id), plus the code-audit findings.
// Rows that need real layout, a real service worker or a real browser's history timing are also covered
// in tests/e2e/browser.e2e.mjs (Chromium).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AREAS, LocateError } from '../src/app';
import { distanceKm, islandOf, pickCards, type Point } from '../src/pick';
import { ORIGINS, fileSpots, realSpots } from './fixtures';
import { $, $$, advance, cardIds, cardNames, css, current, deferred, expectedNames, flush, html, render, reset, settle, shownMood, tap, wait } from './harness';

const area = (n: string) => AREAS.find((a) => a.name === n)!;
const deny = () => Promise.reject(new LocateError('denied'));
const hang = () => new Promise<Point>(() => undefined);
const status = () => $('#status').textContent ?? '';
/** The 3s GPS wait (지역으로 고르기, the saved list's give-up) cut to 30ms of real time. Only for "it is there
 * after 40ms" checks — Node fires the 30ms timer first. "Not there yet" checks use fake timers (S04). */
const ESCAPE_30 = { slow: 0, long: 30, settle: 300, hint: 40 };
/** The mood whose results are on screen (its title). */
const pressedMoods = shownMood;
const state = () => current().state();
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
    expect($('.notice-b')?.textContent).toContain('내일 갈 동네');
    expect($('.notice-f')?.textContent).toBe('위치를 쓰려면 브라우저 설정에서 위치 권한을 켜 주세요.');
    expect($$('#cards [data-area]').map((b) => b.textContent)).toEqual(AREAS.map((a) => a.label));
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
      render({ locate: () => gps.promise, delays: { slow: 0, long: 3000, settle: 300, hint: 40 } });
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
    expect($('.notice-b')?.textContent).toBe('내일 갈 동네를 고르면 거기서 가까운 곳을 보여 드려요.');
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
    expect($('#sheet [data-basis="gps"] .sub')?.textContent).toBe('위치 권한이 꺼져 있어요');
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
    expect($('#sheet [data-basis="stay"] .sub')?.textContent).toBe('처음 한 번만 정해요');
    await tap('#sheet [data-basis="stay"]');
    await tap('#sheet [data-where="stay"][data-area="애월"]');
    await settle();
    await tap('#basis');
    expect($('#sheet [data-basis="stay"] .sub')?.textContent).toBe('애월');
    expect($('#sheet [data-basis="stay"]').getAttribute('aria-pressed')).toBe('true');

    render({ locate: () => Promise.resolve(ORIGINS['서쪽(한림)']) });
    await tap('#basis');
    await tap('#sheet [data-action="restay"]');
    await tap('#sheet [data-action="stay-here"]');
    await settle();
    await tap('#basis');
    expect($('#sheet [data-basis="stay"] .sub')?.textContent).toBe('한림');
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
    expect($('#sheet-title').textContent).toBe('어디 근처로 볼까요?');
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

  it('S15 saved list → ⇄ → area: the list stays, re-sorted from the new area (no bounce to mood cards)', async () => {
    await savedOpenFromCards();
    const saved = JSON.parse(window.localStorage.getItem('jeju.saved')!) as string[];
    await tap('#basis');
    await tap('#sheet [data-area="성산"]');
    await settle();
    expect($('#savedView').hidden).toBe(false);
    expect(pressedMoods()).toEqual([]);
    const 성산 = area('성산');
    const want = saved
      .map((id) => realSpots.find((s) => s.id === id)!)
      .sort((a, b) => distanceKm(성산, a) - distanceKm(성산, b))
      .map((s) => s.id);
    expect(cardIds()).toEqual(want);
    expect($('#savedView .sort')?.textContent).toBe('성산에서 가까운 순이에요.');
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
    await tap('#savedView .change');
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
    await tap('#savedView .change');
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
    expect($('#basis').textContent).toBe('내 주변');
    expect($('#saved').textContent).toBe('1');
    await tap('#saved');
    expect(cardIds()).toEqual([realSpots[0].id]);
    await tap('#savedView .heart'); // unsave → really unsaved (was: heart off, id still stored)
    expect(JSON.parse(window.localStorage.getItem('jeju.saved')!)).toEqual([]);
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
    expect($('#basis').textContent).toBe('내 주변');
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
      const same = want.every((w) => w === want[0]);
      cards.forEach((li, i) => {
        const meta = li.querySelector('.travel')?.textContent ?? null;
        if (meta) seen.push(meta);
        // the same trip for all three is said once, on the first card
        if (i === 0) expect(meta).toBe(same ? `셋 다 ${want[0]}` : want[0]);
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
  // so to a screen reader ("{이름}, 카카오맵에서 보기").
  it('S57 the first card says where a tap goes (카카오맵), every card links there, no arrow glyph', async () => {
    render();
    await tap('[data-mood="walk"]');
    const cards = $$('#cards .card');
    expect(cards).toHaveLength(3);
    expect($$('#cards .card .dest').map((d) => d.textContent)).toEqual(['카카오맵']);
    expect(cards[0].querySelector('.dest')).not.toBeNull();
    for (const c of cards) {
      const a = c.querySelector<HTMLAnchorElement>('.card-link')!;
      expect(a.href).toMatch(/^https:\/\/(place\.map|map)\.kakao\.com\//);
      expect(a.getAttribute('aria-label')).toMatch(/, 카카오맵에서 보기$/);
    }
    // "·" is held to the trip by a no-break space; the break opportunity is after it, so no line starts with "·"
    const meta = cards[0].querySelector('.meta')!;
    expect(meta.querySelector('.sep')?.textContent).toBe(' ·');
    expect(meta.textContent).toMatch(/ · 카카오맵$/);
    expect(cssRule('.meta .dest')).toMatch(/white-space:\s*nowrap/);
    // the saved list keeps it on every row (a list sorted by distance, §6.11)
    await tap('.card .heart');
    await tap('#saved');
    expect($$('#savedView .card .dest').map((d) => d.textContent)).toEqual(['카카오맵']);
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
    expect($('#basis').textContent).toBe('내 주변');
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
    expect(JSON.parse(window.localStorage.getItem('jeju.saved')!)).toEqual([]);
  });

  it('S40 the first heart ever says once where saves go; later hearts don\'t', async () => {
    const delays = { slow: 0, long: 30, settle: 300, hint: 400 };
    render({ delays });
    await tap('[data-mood="rest"]');
    await tap('.card .heart');
    const first = $('.card').dataset.id;
    expect($$('.hint').map((e) => e.closest<HTMLElement>('.card')?.dataset.id)).toEqual([first]);
    expect($('.hint').textContent).toBe('저장한 곳은 맨 위 하트 버튼에 모여요.');
    expect(window.localStorage.getItem('jeju.hintSeen')).toBe('true');
    await tap($$('.card .heart')[1]);
    expect($$('.hint')).toHaveLength(1);
    await wait(450); // delays.hint (3s in the app)
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
    expect(JSON.parse(window.localStorage.getItem('jeju.saved')!)).toEqual(['gone', realSpots[0].id]);
  });

  it('audit: another tab\'s save shows up here (storage event) and is never overwritten', async () => {
    render();
    await tap('[data-mood="rest"]');
    const [a, b] = $$('.card').map((c) => c.dataset.id!);
    await tap('.card .heart');
    // another tab saves b
    window.localStorage.setItem('jeju.saved', JSON.stringify([b, a]));
    window.dispatchEvent(new StorageEvent('storage', { key: 'jeju.saved', storageArea: window.localStorage }));
    expect($('#saved').textContent).toBe('2');
    expect($$('.card .heart').map((h) => h.getAttribute('aria-pressed'))).toEqual(['true', 'true', 'false']);
    // this tab unsaves a: b survives
    await tap('.card .heart');
    expect(JSON.parse(window.localStorage.getItem('jeju.saved')!)).toEqual([b]);
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
    expect(more.previousElementSibling?.matches('.card.row')).toBe(true);
    // first card large, then "아니면", then two row cards
    expect([...$('#cards').children].map((e) => e.className)).toEqual(['card lead', 'alt', 'card row', 'card row', 'more']);
    expect($('#cards .alt').textContent).toBe('아니면');
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
      expect(document.activeElement).toBe($('#resultsTitle'));
      expect(intoView).not.toHaveBeenCalled();

      rect.mockImplementation(function (this: Element) {
        // the heading has scrolled up behind the 52px top bar (the thumb is down by the button)
        return (this.id === 'resultsTitle' ? { top: -300, bottom: -270 } : { top: 0, bottom: 52 }) as DOMRect;
      });
      $('.card .card-link').focus();
      await tap('#cards .more');
      expect(intoView).toHaveBeenCalledWith({ block: 'start' });
      expect(intoView.mock.instances.at(-1)).toBe($('#results .head'));
      expect(document.activeElement).toBe($('#resultsTitle'));

      intoView.mockClear();
      rect.mockImplementation(function (this: Element) {
        return (this.id === 'resultsTitle' ? { top: 60, bottom: 90 } : { top: 0, bottom: 52 }) as DOMRect;
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
      await tap('#savedView .change');
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

  it('S55 in-app browser (KakaoTalk): the saved list says saves stay in this browser only', async () => {
    window.localStorage.setItem('jeju.saved', JSON.stringify([realSpots[0].id]));
    render({ userAgent: 'Mozilla/5.0 (iPhone) KAKAOTALK 10.4.5' });
    await tap('#saved');
    expect($('#savedView .foot')?.textContent).toBe('이 브라우저에만 저장돼요. 앱 안에서 연 창이라 다른 브라우저에서는 보이지 않아요.');
    window.history.replaceState(null, ''); // a fresh open, not a reload of the open list
    render({ userAgent: 'Mozilla/5.0 (iPhone) Safari/604.1' });
    await tap('#saved');
    expect($('#savedView .foot')?.textContent).toBe('이 브라우저에만 저장돼요.');
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
    expect($('#resultsTitle').textContent).toBe('좀 걷고 싶어');
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
    $('#savedView .change').click();
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

  it('first card large, then 아니면, then two rows; only the first says where from; names split "(별칭)" off', async () => {
    const withAlias = realSpots.find((s) => /^(.+?)\s*[(（](.+)[)）]$/.test(s.name) && s.mood !== 'food')!;
    const others = realSpots.filter((s) => s.mood === withAlias.mood && s.id !== withAlias.id).slice(0, 2);
    render({ loadSpots: () => Promise.resolve([withAlias, ...others]), locate: () => Promise.resolve(withAlias) });
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

  it('two cards only: no 아니면; the saved list has rows only, each saying where from', async () => {
    const two = realSpots.filter((s) => s.mood === 'walk').slice(0, 2);
    render({ loadSpots: () => Promise.resolve(two), locate: () => Promise.resolve(two[0]) });
    await tap('[data-mood="walk"]');
    expect($$('#cards .card')).toHaveLength(2);
    expect($('#cards .alt')).toBeNull();
    await tap('#cards .card.lead .heart');
    await tap('#cards .card.row .heart');
    await tap('#saved');
    expect($$('#savedView .card.lead')).toHaveLength(0);
    expect($$('#savedView .card.row')).toHaveLength(2);
    for (const t of $$('#savedView .travel')) expect(t.textContent).toMatch(/^여기서 /);
    expect($('#savedTitle .count').textContent).toBe('2');
  });

  it('date line: tomorrow, or today before 4 a.m. ("내일" at 1 a.m. is the coming day)', () => {
    render({ today: () => new Date(2026, 8, 30, 22, 0) });
    expect($('#date').textContent).toBe('10월 1일 목요일');
    render({ today: () => new Date(2026, 9, 1, 1, 30) });
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
    expect($('#basis').textContent).toBe('내 주변');
  });

  it('first-save hint fades out (motion allowed) instead of vanishing mid-read; reduced motion removes it at once', async () => {
    const mm = (reduce: boolean) =>
      ((q: string) => ({ matches: q.includes('no-preference') ? !reduce : reduce, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    window.matchMedia = mm(false);
    try {
      render({ delays: { slow: 0, long: 30, settle: 300, hint: 30 } });
      await tap('[data-mood="rest"]');
      await tap('.card .heart');
      expect($$('.hint')).toHaveLength(1);
      await wait(45);
      expect($('.hint')?.classList.contains('leaving')).toBe(true);
      await wait(200);
      expect($$('.hint')).toHaveLength(0);
    } finally {
      delete (window as { matchMedia?: unknown }).matchMedia;
    }
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
    expect($('#resultsTitle').textContent).toBe('좀 걷고 싶어');
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
    for (const sel of ['.saved-btn', '.basis', '.tab', '.change', '.link', '.book', '.restay']) expect(cssRule(sel), sel).toMatch(/min-height:\s*44px/);
    expect(cssRule('.heart')).toMatch(/width:\s*44px/);
    expect(cssRule('.heart')).toMatch(/height:\s*44px/);
    expect(cssRule('.more')).toMatch(/min-height:\s*52px/);
    expect(cssRule('.mood')).toMatch(/min-height:\s*60px/);
    expect(cssRule('.opt')).toMatch(/min-height:\s*48px/);
    expect(cssRule('button')).toMatch(/touch-action:\s*manipulation/);
  });

  it('S48 large text: the top buttons never break inside ("♥" over "1"), the row wraps instead', () => {
    expect(cssRule('.saved-btn')).toMatch(/white-space:\s*nowrap/);
    expect(cssRule('.basis')).toMatch(/white-space:\s*nowrap/);
    expect(cssRule('.top')).toMatch(/flex-wrap:\s*wrap/);
    expect(cssRule('.top')).toMatch(/position:\s*sticky/);
  });

  it('S49 dark: first paint and splash are dark, photos dimmed a little', () => {
    expect(html).toMatch(/<style>html\{background:#f7f7f5\}@media \(prefers-color-scheme:dark\)\{html\{background:#151718\}\}<\/style>/);
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
    expect($('#resultsTitle').textContent).toBe('좀 걷고 싶어');
    fail = false;
    render({ locate }); // pull to refresh with location working again
    await flush();
    await flush();
    expect($('#resultsTitle').textContent).toBe('좀 걷고 싶어');
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

  it('saved list while GPS never answers (a prompt left open): after a moment it shows in saved order, the label unchanged', async () => {
    const [a, b] = realSpots;
    window.localStorage.setItem('jeju.saved', JSON.stringify([a.id, b.id]));
    render({ locate: hang, delays: ESCAPE_30 });
    await tap('#saved');
    await wait(40); // delays.long = 30 here (3s in the app)
    expect(cardIds()).toEqual([a.id, b.id]);
    expect($('#savedView .sort').textContent).toBe('위치를 몰라서 저장한 순서대로 보여 드려요.');
    expect($('#basis').textContent).toBe('내 주변'); // nothing failed; it just didn't answer
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
    render({ locate: () => (++n === 1 ? Promise.resolve(ORIGINS.제주시) : again.promise), delays: { slow: 20, long: 10_000, settle: 300, hint: 40 } });
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
    render({ loadSpots: () => (++calls === 1 ? Promise.resolve(fileSpots) : later.promise), delays: { slow: 20, long: 10_000, settle: 300, hint: 40 } });
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
    expect($('#sheet [data-basis="gps"] .sub')).toBeNull();
    gps.reject(new LocateError('denied'));
    await flush();
    await flush();
    expect($('#sheet [data-basis="gps"] .sub')?.textContent).toBe('위치 권한이 꺼져 있어요');
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
    expect($('#sheet [data-basis="gps"] .sub')).toBeNull();
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
    expect($('#basis').textContent).toBe('내 주변');
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
    render({ loadSpots, delays: { slow: 0, long: 10_000, settle: 300, hint: 40, dataTimeout: 20 } });
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
