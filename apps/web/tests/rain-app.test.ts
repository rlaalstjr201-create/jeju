// @vitest-environment jsdom
// 비 소식 앱 쪽 (ADR-0076, plans/home-refresh.md U5): who is asked, the session record, 오늘 판's row and its taps.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AreaName } from '../src/areas';
import { fetchRain, type Fetch } from '../src/effects';
import { todayActs, type MarketRow } from '../src/home';
import { initialState, reduce } from '../src/state';
import { KEYS, parseRain, RAIN_TTL_MS } from '../src/store';
import { $, flush, render, reset, tap } from './harness';

const at = (day: string) => () => new Date(`${day}T10:00:00+09:00`);
const T0 = at('2026-10-03')().getTime();
const region = (name: AreaName) => {
  window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
  window.localStorage.setItem('jeju.region', JSON.stringify(name));
};
const json = (body: unknown, status = 200) => ({ ok: status < 300, status, json: async () => body });
/** A fetch that answers `rain` (or a status) and remembers what it was asked. */
function rainFetch(answer: boolean | number) {
  return vi.fn<Parameters<Fetch>, ReturnType<Fetch>>(async () =>
    typeof answer === 'number' ? { ok: false, status: answer, json: async () => Promise.reject(new Error('no body')) } : json({ area: 'x', pop: 70, rain: answer }),
  );
}

beforeEach(reset);

describe('jeju.rain (sessionStorage) — parsed like every stored key', () => {
  const ok = { v: 1, area: 'aewol', at: T0, rain: true };
  it('a fresh record for one of the 15 areas', () => {
    expect(parseRain(ok, T0 + 60_000)).toEqual(ok);
  });
  it('null when older than 30 minutes, from the future, another version, an unknown area, or junk', () => {
    expect(parseRain(ok, T0 + RAIN_TTL_MS)).toBeNull();
    expect(parseRain(ok, T0 - 1)).toBeNull();
    expect(parseRain({ ...ok, v: 2 }, T0)).toBeNull();
    expect(parseRain({ ...ok, area: '애월' }, T0)).toBeNull();
    expect(parseRain({ ...ok, rain: 'yes' }, T0)).toBeNull();
    expect(parseRain({ ...ok, at: '1' }, T0)).toBeNull();
    expect(parseRain(null, T0)).toBeNull();
    expect(parseRain('x', T0)).toBeNull();
  });
});

describe('fetchRain — anything but a JSON answer is nothing to show', () => {
  it('asks /api/rain with the area name only; true/false from the body', async () => {
    const f = rainFetch(true);
    expect(await fetchRain('aewol', f)).toBe(true);
    expect(f.mock.calls[0][0]).toBe('/api/rain?area=aewol');
    expect(await fetchRain('aewol', rainFetch(false))).toBe(false);
  });
  it('204, a 404 HTML page (no function), a thrown error, a body without rain, or no answer in 3s → null', async () => {
    expect(await fetchRain('aewol', rainFetch(204))).toBeNull();
    expect(await fetchRain('aewol', async () => ({ ok: false, status: 404, json: async () => JSON.parse('<!doctype html>') }))).toBeNull();
    expect(await fetchRain('aewol', async () => Promise.reject(new TypeError('offline')))).toBeNull();
    expect(await fetchRain('aewol', async () => json({ pop: 10 }))).toBeNull();
    vi.useFakeTimers();
    try {
      const p = fetchRain('aewol', () => new Promise(() => undefined));
      vi.advanceTimersByTime(3000);
      expect(await p).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('state — the answer is kept apart from the request ids, and only for the area asked now', () => {
  const s0 = () => initialState({ basis: 'region', region: '애월', stay: null, saved: [], hintSeen: true, offline: false, today: '2026-10-03' });
  it('kept for the current area; an answer for another area (the basis moved on) is dropped', () => {
    expect(reduce(s0(), { type: 'rain', area: 'aewol', rain: true }).rain).toEqual({ area: 'aewol', rain: true });
    const moved = reduce(s0(), { type: 'basis', basis: 'region', region: '중문' });
    expect(reduce(moved, { type: 'rain', area: 'aewol', rain: true }).rain).toBeNull();
  });
  it('date mode has no area (the forecast is about the next 3 hours)', () => {
    const dated = reduce(s0(), { type: 'when', when: '2026-10-05' });
    expect(reduce(dated, { type: 'rain', area: 'aewol', rain: true }).rain).toBeNull();
  });
});

describe('오늘 판 — 비 소식 before the market', () => {
  const row = { spot: { name: '중문향토오일시장' }, where: '차로 약 10분' } as MarketRow;
  it('rain first, the market second (it folds into the grey line); no rain → the market alone', () => {
    expect(todayActs([row], true).map((a) => a.k)).toEqual(['rain', 'market']);
    expect(todayActs([row], false).map((a) => a.k)).toEqual(['market']);
    expect(todayActs([], true).map((a) => a.k)).toEqual(['rain']);
  });
});

describe('홈의 비 소식 줄 (mounted)', () => {
  it('region basis: asks that area once; rain → 「비 소식 · 실내만 볼까요?」 with its source, the market folds into the date line', async () => {
    region('중문'); // 10월 3일: 중문 market day — the row the rain takes the place of
    const f = rainFetch(true);
    render({ today: at('2026-10-03'), fetch: f });
    await flush();
    await flush();
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe('/api/rain?area=jungmun');
    expect($('#today .act')!.textContent).toBe('비 소식 · 실내만 볼까요? 날씨: 기상청');
    expect($('#today .facts')!.textContent).toMatch(/ · 오늘 중문향토오일시장 장날$/);
    const kept = JSON.parse(window.sessionStorage.getItem(KEYS.rain)!);
    expect(kept).toMatchObject({ v: 1, area: 'jungmun', rain: true });
  });

  it('tapping it turns 실내만 on (the session switch of ADR-0065); then 모두 보기 turns it off again', async () => {
    region('애월');
    render({ today: at('2026-10-03'), fetch: rainFetch(true) });
    await flush();
    await flush();
    await tap('#today [data-action="rain-indoor"]');
    expect(window.sessionStorage.getItem(KEYS.indoor)).toBe('true');
    expect($('#today .act')!.textContent).toBe('비 소식이 있어 실내만 보고 있어요 날씨: 기상청모두 보기');
    await tap('#today [data-action="rain-all"]');
    expect(window.sessionStorage.getItem(KEYS.indoor)).toBeNull();
    expect($('#today [data-action="rain-indoor"]')).not.toBeNull();
  });

  it('no rain, 204, or a failure → no row (the market keeps its place)', async () => {
    for (const answer of [false, 204, 500] as const) {
      reset();
      region('중문');
      render({ today: at('2026-10-03'), fetch: rainFetch(answer) });
      await flush();
      await flush();
      expect($('#today .act')!.textContent, String(answer)).toMatch(/^오늘 중문향토오일시장 장날/);
    }
  });

  it('a fresh session record answers without asking; GPS without a fix this session and date mode ask nothing', async () => {
    region('애월');
    window.sessionStorage.setItem(KEYS.rain, JSON.stringify({ v: 1, area: 'aewol', at: T0 - 60_000, rain: true }));
    let f = rainFetch(false);
    render({ today: at('2026-10-03'), fetch: f });
    await flush();
    expect(f).not.toHaveBeenCalled();
    expect($('#today [data-action="rain-indoor"]')).not.toBeNull();

    reset();
    f = rainFetch(true);
    render({ today: at('2026-10-03'), fetch: f, locate: () => new Promise(() => undefined) });
    await flush();
    expect(f).not.toHaveBeenCalled();

    reset();
    region('애월');
    window.localStorage.setItem('jeju.when', JSON.stringify('2026-10-05'));
    f = rainFetch(true);
    render({ today: at('2026-10-03'), fetch: f });
    await flush();
    expect(f).not.toHaveBeenCalled();
    expect($('#today .act')).toBeNull();
  });

  it('숙소 basis asks the area nearest the 숙소; only the area name is sent, never the point', async () => {
    window.localStorage.setItem('jeju.basis', JSON.stringify('stay'));
    window.localStorage.setItem('jeju.stay', JSON.stringify({ lat: 33.2481, lng: 126.4123, area: '중문', source: 'gps' }));
    const f = rainFetch(false);
    render({ today: at('2026-10-03'), fetch: f });
    await flush();
    expect(f.mock.calls.map((c) => c[0])).toEqual(['/api/rain?area=jungmun']);
  });
});
