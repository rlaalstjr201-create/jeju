// 노을 볼 곳 데이터 (ADR-0083, specs/sunset-view.md V2·V3): scripts/sunset.mjs on the shipped file and on fixtures.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applySunset, basisProblems, loadInputs, loadSunsetCalls, placeWith, sampleIds, viewWith, type SunsetCall } from '../scripts/sunset.mjs';
import { prepareCoast } from '../scripts/sunset-geo.mjs';
import { fileSpots } from './fixtures';

const root = resolve(__dirname, '..');
const shipped = JSON.parse(readFileSync(resolve(root, 'public/spots.json'), 'utf8')) as { id: string; sunsetView?: number[]; market?: unknown }[];
const audit = JSON.parse(readFileSync(resolve(root, 'review/sunset/audit-01.json'), 'utf8'));
const candidates = JSON.parse(readFileSync(resolve(root, 'review/sunset/candidates.json'), 'utf8')) as { id: string }[];

type S = { id: string; name: string; lat: number; lng: number; mood: string; market?: unknown; sunsetView?: number[]; sunsetSea?: number[]; book?: unknown };
const spot = (id: string, over: Partial<S> = {}): S => ({ id, name: id, lat: 33.3, lng: 126.001, mood: 'walk', ...over });
const call = (id: string, sunset = true): SunsetCall => ({ id, sunset, basis: 'x' });
const ALL = () => [242, 264, 298];

describe('V2 judgments', () => {
  const { calls, pass } = loadSunsetCalls();
  it('every candidate is judged once, and nothing else', () => {
    expect(calls.map((c) => c.id).sort()).toEqual(candidates.map((c) => c.id).sort());
  });
  it('every basis is word for word in its own source text, 40 characters or fewer', () => {
    expect(basisProblems(calls, loadInputs())).toEqual([]);
  });
  it('the blind re-judging sample is the seeded 5% of the candidates, and its pass is what the numbers say', () => {
    expect(audit.rows.map((r: { id: string }) => r.id)).toEqual(sampleIds(candidates.map((c) => c.id)));
    expect(audit.agreement.pass).toBe(audit.agreement.agree / audit.agreement.n >= 0.85);
    expect(pass).toBe(audit.agreement.pass);
    // blind: what the re-judge was given has no first-round answer and no real id
    const given = JSON.stringify(audit.auditorInput);
    expect(given).not.toMatch(/"sunset"|"basis"/);
    for (const r of audit.rows) expect(given).not.toContain(r.id);
  });
});

describe('V3 shipped spots.json', () => {
  it('is what sunset.mjs makes, and a second run changes no byte (idempotent)', () => {
    const loaded = loadSunsetCalls();
    const once = applySunset(fileSpots, loaded);
    expect(JSON.stringify(applySunset(once, loaded))).toBe(JSON.stringify(once));
    expect(once.map((s) => s.sunsetView ?? null)).toEqual(shipped.map((s) => s.sunsetView ?? null));
  });
  it('only confirmed places, never a market, azimuths of the three in order; no basis shipped', () => {
    const keep = new Set(loadSunsetCalls().calls.filter((c) => c.sunset).map((c) => c.id));
    for (const s of shipped.filter((x) => x.sunsetView)) {
      expect(keep.has(s.id)).toBe(true);
      expect(s.market).toBeUndefined();
      expect(s.sunsetView!.length).toBeGreaterThan(0);
      expect(s.sunsetView!.every((a) => [242, 264, 298].includes(a))).toBe(true);
      expect([...s.sunsetView!].sort((a, b) => a - b)).toEqual(s.sunsetView);
    }
    expect(JSON.stringify(shipped)).not.toMatch(/"basis"/);
  });
  it('Amendment 1: sunsetSea only on a filled-in place (all three listed), right after sunsetView, never equal to it', () => {
    const loaded = loadSunsetCalls();
    const once = applySunset(fileSpots, loaded) as (typeof shipped[number] & { sunsetSea?: number[] })[];
    expect(once.map((s) => s.sunsetSea ?? null)).toEqual((shipped as typeof once).map((s) => s.sunsetSea ?? null));
    const sea = once.filter((s) => s.sunsetSea);
    expect(sea.length).toBeGreaterThan(0);
    for (const s of sea) {
      expect(s.sunsetView).toEqual([242, 264, 298]);
      expect(s.sunsetSea!.join()).not.toBe(s.sunsetView!.join());
      expect(s.sunsetSea!.every((a) => [242, 264, 298].includes(a))).toBe(true);
      const keys = Object.keys(s);
      expect(keys[keys.indexOf('sunsetView') + 1]).toBe('sunsetSea');
    }
    expect(once.filter((s) => !s.sunsetView).every((s) => !s.sunsetSea)).toBe(true);
  });
});

describe('applySunset (fixtures)', () => {
  it('puts sunsetView after season and before the booking fields; replaces an old one', () => {
    const out = applySunset([{ ...spot('a'), season: [], book: { k: 'naver' }, sunsetView: [242] }], { calls: [call('a')], pass: true }, () => [264]);
    expect(Object.keys(out[0]).slice(-3)).toEqual(['season', 'sunsetView', 'book']);
    expect(out[0].sunsetView).toEqual([264]);
  });
  it('a failed audit ships none, and takes old ones off', () => {
    const out = applySunset([spot('a', { sunsetView: [242] })], { calls: [call('a')], pass: false }, ALL);
    expect(out[0].sunsetView).toBeUndefined();
  });
  it('drop and market get none', () => {
    const out = applySunset([spot('a'), spot('m', { market: { days: [2, 7] } })], { calls: [call('a', false), call('m')], pass: true }, ALL);
    expect(out.every((s) => !s.sunsetView)).toBe(true);
  });
  it('stops on a judgment for a place that does not ship, or twice, or not true/false', () => {
    expect(() => applySunset([spot('a')], { calls: [call('z')], pass: true }, ALL)).toThrow(/not shipped/);
    expect(() => applySunset([spot('a')], { calls: [call('a'), call('a')], pass: true }, ALL)).toThrow(/twice/);
    expect(() => applySunset([spot('a')], { calls: [{ id: 'a', sunset: 'yes' as unknown as boolean, basis: 'x' }], pass: true }, ALL)).toThrow(/true\/false/);
  });
  it('the calculation decides the azimuths; an 오름 or a place it does not see gets all three', () => {
    const coast = prepareCoast([[[126.0, 33.2], [126.5, 33.2], [126.5, 33.5], [126.0, 33.5], [126.0, 33.2]]]);
    const view = viewWith(coast);
    expect(view(spot('n', { lat: 33.4995, lng: 126.02 }))).toEqual([298]);
    expect(view(spot('inland', { lat: 33.3, lng: 126.2 }))).toEqual([242, 264, 298]);
    expect(view(spot('o', { name: '새별오름', lat: 33.4995, lng: 126.02 }))).toEqual([242, 264, 298]);
  });
  it('Amendment 1: placeWith gives sea (the calculation\'s own) only when the view was filled in; applySunset ships it and takes an old one off', () => {
    const coast = prepareCoast([[[126.0, 33.2], [126.5, 33.2], [126.5, 33.5], [126.0, 33.5], [126.0, 33.2]]]);
    const place = placeWith(coast);
    expect(place(spot('n', { lat: 33.4995, lng: 126.02 }))).toEqual({ view: [298] });
    expect(place(spot('inland', { lat: 33.3, lng: 126.2 }))).toEqual({ view: [242, 264, 298], sea: [] });
    expect(place(spot('o', { name: '새별오름', lat: 33.4995, lng: 126.02 }))).toEqual({ view: [242, 264, 298], sea: [298] });
    const out = applySunset([{ ...spot('a'), season: [], book: { k: 'naver' } }, { ...spot('b', { sunsetSea: [242] }), season: [], book: undefined }], { calls: [call('a'), call('b')], pass: true }, (s) =>
      s.id === 'a' ? { view: [242, 264, 298], sea: [264] } : [298],
    );
    expect(Object.keys(out[0]).slice(-4)).toEqual(['season', 'sunsetView', 'sunsetSea', 'book']);
    expect(out[0].sunsetSea).toEqual([264]);
    expect(out[1]).not.toHaveProperty('sunsetSea');
    expect(JSON.stringify(applySunset(out, { calls: [call('a'), call('b')], pass: true }, (s) => (s.id === 'a' ? { view: [242, 264, 298], sea: [264] } : [298])))).toBe(JSON.stringify(out));
  });
  it('basisProblems: missing, too long, not in the source', () => {
    const inputs = new Map([['a', { id: 'a', name: '바닷가 정자', tags: ['노을'], intro: null, comment: '저녁 하늘이 곱다', summary: null }]]);
    expect(basisProblems([{ id: 'a', sunset: true, basis: '저녁 하늘이 곱다' }], inputs)).toEqual([]);
    expect(basisProblems([{ id: 'a', sunset: true, basis: '' }], inputs)[0]).toMatch(/no basis/);
    expect(basisProblems([{ id: 'a', sunset: true, basis: '저녁 하늘이 아주 곱다' }], inputs)[0]).toMatch(/not in the source/);
    expect(basisProblems([{ id: 'a', sunset: true, basis: '가'.repeat(41) }], inputs)[0]).toMatch(/over 40/);
  });
});
