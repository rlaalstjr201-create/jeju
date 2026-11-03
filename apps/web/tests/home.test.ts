// @vitest-environment jsdom
// 홈 A′ (ADR-0075, specs/home-refresh.md): the moods' 「예:」 and photos, 오늘 판, 오늘 장 서는 곳, 다른 동네 둘러보기.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AREAS, areaByName, type AreaName } from '../src/areas';
import { marketDay } from '../src/market';
import { islandTop, pool, withinReach, type Mood, type Spot } from '../src/pick';
import { splitName } from '../src/render';
import { fileSpots } from './fixtures';
import { $, $$, flush, render, reset, tap } from './harness';

const MOODS: Mood[] = ['rest', 'walk', 'new', 'food'];
/** 10월 3일: only 중문 (3·8일) has its market day; 10월 2일: 제주 and 표선 (2·7일). */
const at = (day: string) => () => new Date(`${day}T10:00:00+09:00`);
const region = (name: AreaName) => {
  window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
  window.localStorage.setItem('jeju.region', JSON.stringify(name));
};
const withPhoto = (list: Spot[]) => list.filter((s) => s.image).slice(0, 2);
const example = (mood: Mood) => $(`[data-mood="${mood}"] .ex`)?.textContent ?? null;
const photos = (mood: Mood) => $$(`[data-mood="${mood}"] .pair img`).map((i) => i.getAttribute('src'));
const names = (list: Spot[]) => list.map((s) => splitName(s.name.trim()).main).join(', ');
const want = (list: Spot[]) => `예: ${names(list)}`;
/** no basis yet: the island's best, not said to be near (ADR-0075 Amendment 1) */
const popular = (list: Spot[]) => `제주 인기: ${names(list)}`;
const tiles = () => $$('#homeMore .tile').map((a) => a.getAttribute('href'));

beforeEach(reset);

describe('홈 A′ (ADR-0075)', () => {
  it('before the data: no photo, no 「예:」, no section — only the words and the moods', () => {
    render({ loadSpots: () => new Promise(() => undefined), today: at('2026-10-03') });
    expect($$('#home img')).toHaveLength(0);
    expect($$('#home .ex')).toHaveLength(0);
    expect($('#homeMore').children).toHaveLength(0);
    expect($('#today .act')).toBeNull();
    expect($('#today .facts').textContent).toBe(' · 해 지는 시각 18:16');
    expect($('#date').textContent).toBe('10월 3일 토요일');
  });

  it('no origin (GPS, no fix yet): each mood shows the whole island\'s top 2 as 「제주 인기:」, all 15 areas, no market on the board', async () => {
    render({ today: at('2026-10-03') });
    await flush();
    for (const m of MOODS) {
      const top = withPhoto(islandTop(fileSpots, m, undefined, false, '2026-10-03'));
      expect(example(m), m).toBe(popular(top));
      expect(photos(m), m).toEqual(top.map((s) => s.image));
    }
    expect($$('[data-mood="any"] .ex, [data-mood="any"] img')).toHaveLength(0);
    expect(tiles()).toHaveLength(AREAS.length);
    // every open market of the day, with its area (no basis to measure from)
    expect($$('#market .mk .meta').map((e) => e.textContent)).toEqual(['오늘 장 서는 날 · 중문']);
    expect($('#market-h')!.textContent).toBe('오늘 장 서는 곳');
    // not under 「내 위치 근처」: the island's market may be an hour away (ADR-0075 Amendment 1)
    expect($('#today .act')).toBeNull();
    expect($('#today .facts').textContent).toBe(' · 해 지는 시각 18:16');
  });

  it('permission already granted: the home reads the position without a prompt; examples and market row are then nearby', async () => {
    const jungmun = areaByName('중문')!;
    const locate = vi.fn(() => Promise.resolve({ lat: jungmun.lat, lng: jungmun.lng }));
    render({ today: at('2026-10-03'), locate, geoPermission: async () => 'granted' });
    await flush();
    await flush();
    expect(locate).toHaveBeenCalledTimes(1);
    expect($('#basis').textContent).toBe('내 위치 근처');
    for (const m of MOODS) {
      const first = pool(fileSpots, jungmun, m, undefined, 'drive30', false, '2026-10-03').map((c) => c.spot);
      expect(example(m), m).toBe(want(withPhoto(first)));
    }
    expect($('#today .act')!.textContent).toMatch(/^오늘 중문향토오일시장 장날\s· (걸어서|차로) 약 \d+분$/);
    // back in the foreground with the fix in hand: not read again
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(locate).toHaveBeenCalledTimes(1);
  });

  it('ADR-0110: 「지금 있는 곳」 picked again in the sheet with no position yet reads it then', async () => {
    const locate = vi.fn(() => Promise.resolve(areaByName('중문')!));
    render({ today: at('2026-10-03'), locate });
    await flush();
    expect(locate).not.toHaveBeenCalled();
    $('#basis')!.click();
    await flush();
    $('#sheet [data-basis="gps"]')!.click();
    await flush();
    await flush();
    expect(locate).toHaveBeenCalledTimes(1);
    expect(example('rest')).toMatch(/^예: /);
  });

  it('permission not granted (prompt / denied / no Permissions API): the home never reads or asks', async () => {
    for (const geoPermission of [async () => 'prompt' as const, async () => 'denied' as const, undefined]) {
      reset();
      const locate = vi.fn(() => Promise.resolve(areaByName('중문')!));
      render({ today: at('2026-10-03'), locate, ...(geoPermission ? { geoPermission } : {}) });
      await flush();
      await flush();
      expect(locate).not.toHaveBeenCalled();
      expect(example('rest')).toMatch(/^제주 인기: /);
      expect($('#today .act')).toBeNull();
    }
  });

  it('a silent read that fails changes nothing: no 지역 고르기, still 「제주 인기:」', async () => {
    const { LocateError } = await import('../src/effects');
    render({ today: at('2026-10-03'), locate: () => Promise.reject(new LocateError('unavailable')), geoPermission: async () => 'granted' });
    await flush();
    await flush();
    expect($('#basis').textContent).toBe('내 위치 근처');
    expect(example('rest')).toMatch(/^제주 인기: /);
  });

  it('region origin: the 「예:」 and photos are pool\'s first 2 from the area centre (range, the day)', async () => {
    region('애월');
    render({ today: at('2026-10-03') });
    await flush();
    const o = areaByName('애월')!;
    for (const m of MOODS) {
      const first = pool(fileSpots, o, m, undefined, 'drive30', false, '2026-10-03').map((c) => c.spot);
      expect(withPhoto(first), m).toEqual(first.slice(0, 2)); // the data has a photo for each
      expect(example(m), m).toBe(want(first.slice(0, 2)));
      expect(photos(m), m).toEqual(first.slice(0, 2).map((s) => s.image));
    }
  });

  it('오늘 장 서는 곳: hidden when no market is open within 차로 30분; nearest first with the trip when one is', async () => {
    region('구제주'); // 10월 3일 only 중문 opens: an hour away
    render({ today: at('2026-10-03') });
    await flush();
    expect($('#market')).toBeNull();
    expect($('#today .act')).toBeNull();
    expect($('#homeMore .credit')!.textContent).toBe('정보·사진: 비짓제주(제주관광공사)');

    region('구제주'); // 10월 2일: 제주민속오일시장 nearby (표선 is far)
    render({ today: at('2026-10-02') });
    await flush();
    const o = areaByName('구제주')!;
    const open = fileSpots.filter((s) => s.market && marketDay(s.market, '2026-10-02') === 'open' && withinReach('drive30', o, s));
    expect($$('#market .mk .nm').map((e) => e.textContent)).toEqual(open.map((s) => s.name.trim()));
    expect($('#market .mk .meta')!.textContent).toMatch(/^오늘 장 서는 날 · 차로 약 \d+분$/);
    expect($('#market .mk')!.getAttribute('target')).toBe('_blank');
  });

  it('오늘 판 has at most one row to tap, on every day of a market cycle and every basis', async () => {
    for (const day of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']) {
      for (const name of [null, '구제주', '중문', '성산'] as const) {
        reset();
        if (name) region(name);
        render({ today: at(day) });
        await flush();
        expect($$('#today a, #today button').length, `${day} ${name}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('다른 동네 둘러보기: never the area the basis is in; links to its page, photos lazy, no referrer', async () => {
    region('구제주');
    render({ today: at('2026-10-03') });
    await flush();
    expect(tiles()).toHaveLength(AREAS.length - 1);
    expect(tiles()).not.toContain('/jeju/gujeju/');
    expect(tiles()[0]).toBe('/jeju/hangyeong/');
    for (const img of $$('#homeMore img')) {
      expect(img.getAttribute('loading')).toBe('lazy');
      expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
      expect(img.getAttribute('alt')).toBe('');
    }
  });

  it('date mode: the board, the row and the section speak of 이날; back to 지금, of today', async () => {
    window.localStorage.setItem('jeju.when', JSON.stringify('2026-10-07'));
    region('구제주');
    render({ today: at('2026-10-03') }); // 10월 7일: 제주 (2·7일), near 구제주
    await flush();
    expect($('#date').textContent).toBe('10월 7일 수요일');
    expect($('#today .act')!.textContent).toMatch(/^이날 제주민속오일시장 장날/);
    expect($('#market-h')!.textContent).toBe('이날 장 서는 곳');
    expect($('#market .mk .meta')!.textContent).toMatch(/^이날 장 서는 날/);
  });

  it('the market row scrolls down to the section and leaves the address and history alone', async () => {
    region('중문');
    render({ today: at('2026-10-03') });
    await flush();
    const before = { len: window.history.length, url: window.location.href };
    await tap('#today .act');
    expect(document.activeElement).toBe($('#market-h'));
    expect({ len: window.history.length, url: window.location.href }).toEqual(before);
  });

  it('redraws only when what it shows changes: a re-render keeps the same photo nodes', async () => {
    render({ today: at('2026-10-03') });
    await flush();
    const img = $('[data-mood="rest"] .pair img');
    await tap('#basis');
    await tap('#sheet .sheet-close');
    expect($('[data-mood="rest"] .pair img')).toBe(img);
  });
});

// independent review 2026-10-03: a GPS fix the label no longer stands for (지역 고르기 after a failed ask)
describe('homeOrigin — the home never speaks for a place its label does not name', () => {
  it('GPS basis: the session fix while it holds; none after a later failed ask', async () => {
    const { homeOrigin, initialState, GPS_KEY } = await import('../src/state');
    const s0 = initialState({ basis: 'gps', region: null, stay: null, saved: [], hintSeen: true, offline: false, today: '2026-10-03' });
    const fix = { key: GPS_KEY, point: { lat: 33.5, lng: 126.53 }, isPoint: true, from: '여기서' };
    expect(homeOrigin({ ...s0, origin: fix })).toBe(fix);
    expect(homeOrigin({ ...s0, origin: fix, lastFail: 'denied' })).toBeNull();
    expect(homeOrigin({ ...s0, origin: { ...fix, key: 'region:애월' } })).toBeNull();
  });
});
