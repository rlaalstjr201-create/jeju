// 철 데이터 (ADR-0080, specs/seasonal-spots.md S1·S1b): scripts/season.mjs on the shipped file and on fixtures.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEASON_KINDS, applySeason, loadBlooms, loadSeasonCalls, loadStations, observedWindow, type Blooms, type SeasonCall, type Station } from '../scripts/season.mjs';
import { fileSpots } from './fixtures';

const root = resolve(__dirname, '..');
const shipped = readFileSync(resolve(root, 'public/spots.json'), 'utf8');
const audit = JSON.parse(readFileSync(resolve(root, 'review/season/audit-02.json'), 'utf8')) as {
  agreement: { perKind: Record<string, { pass: boolean }> };
};
const NO_OBS = { stations: [], blooms: null, year: 2026 };

type S = { id: string; name?: string; lat: number; lng: number; mood: string; market?: unknown; season?: { kind: string }[] };
const spot = (id: string, over: Partial<S> = {}): S => ({ id, lat: 33.5, lng: 126.5, mood: 'walk', ...over });

describe('S1 shipped spots.json', () => {
  const loaded = loadSeasonCalls();
  const seasoned = fileSpots.filter((s) => (s as S).season) as S[];
  /** the year the shipped file was made for, with the data files as they are (not the run date) */
  const obs = { stations: loadStations(), blooms: loadBlooms(2026), year: 2026 };

  it('is what season.mjs makes, and a second run changes no byte (idempotent)', () => {
    const once = applySeason(fileSpots, loaded, obs);
    expect(JSON.stringify(once)).toBe(shipped);
    expect(JSON.stringify(applySeason(once, loaded, obs))).toBe(shipped);
  });

  it('only kinds that passed the audit ship; the pass flags come from the audit file', () => {
    expect(loaded.pass).toEqual(new Set(Object.entries(audit.agreement.perKind).filter(([, v]) => v.pass).map(([k]) => k)));
    const kinds = new Set(seasoned.flatMap((s) => s.season!.map((e) => e.kind)));
    for (const k of kinds) expect(loaded.pass.has(k)).toBe(true);
  });

  it('today: 귤 따기 on 10 places (노지·미상 → 11·12월, 하우스 none), 유채꽃 on the one with months, nothing observed', () => {
    const count = (k: string) => seasoned.filter((s) => s.season!.some((e) => e.kind === k)).length;
    expect(count('tangerine')).toBe(10);
    expect(count('rapeseed')).toBe(1);
    for (const k of ['silvergrass', 'plum', 'cherry', 'maple', 'hydrangea', 'camellia', 'muhly']) expect(count(k)).toBe(0);
    const house = loaded.calls.find((c) => c.kind === 'tangerine' && c.cultivation === '하우스')!;
    expect(seasoned.some((s) => s.id === house.id)).toBe(false);
    for (const s of seasoned) for (const e of s.season!) if (e.kind === 'tangerine') expect(e).toEqual({ kind: 'tangerine', months: [11, 12] });
  });

  it('none on a market or 먹기, none with months null or empty, no beach kind, no source text', () => {
    for (const s of seasoned) {
      expect(s.market).toBeUndefined();
      expect(s.mood).not.toBe('food');
      for (const e of s.season!) {
        expect(SEASON_KINDS).toContain(e.kind);
        expect(Object.keys(e).sort()).toEqual(['kind', 'months']);
        expect((e as unknown as { months: number[] }).months.length).toBeGreaterThan(0);
      }
    }
    expect(shipped).not.toMatch(/"basis"|"cultivation"|"beach"/);
  });
});

describe('S1 rules on fixtures', () => {
  const pass = new Set(['rapeseed', 'tangerine', 'plum']);
  const calls = (...c: SeasonCall[]) => ({ calls: c, pass });

  it('failing kinds get nothing; months null gets nothing; months are sorted', () => {
    const out = applySeason(
      [spot('a'), spot('b'), spot('c')],
      calls(
        { id: 'a', kind: 'hydrangea', months: [6] },
        { id: 'b', kind: 'rapeseed', months: null },
        { id: 'c', kind: 'rapeseed', months: [3, 2] },
      ),
      NO_OBS,
    );
    expect(out.map((s) => s.season ?? null)).toEqual([null, null, [{ kind: 'rapeseed', months: [2, 3] }]]);
  });

  it('a market or 먹기 gets nothing', () => {
    const out = applySeason([spot('m', { market: { days: [1], label: '1·6일' } }), spot('f', { mood: 'food' })], calls(
      { id: 'm', kind: 'rapeseed', months: [3] },
      { id: 'f', kind: 'tangerine', months: null, cultivation: null },
    ), NO_OBS);
    expect(out.every((s) => !s.season)).toBe(true);
  });

  it('months: duplicates dropped and sorted; [] attaches nothing, also for 귤 따기 (no 11·12 default)', () => {
    const out = applySeason([spot('a'), spot('b')], calls(
      { id: 'a', kind: 'rapeseed', months: [3, 2, 3] },
      { id: 'b', kind: 'tangerine', months: [], cultivation: null },
    ), NO_OBS);
    expect(out.map((s) => s.season ?? null)).toEqual([[{ kind: 'rapeseed', months: [2, 3] }], null]);
  });

  it('months that are not whole months 1~12 stop the run, and so does the same place and kind judged twice', () => {
    for (const months of [[0], [13], [2.5], ['3'], 3]) {
      expect(() => applySeason([spot('a')], calls({ id: 'a', kind: 'rapeseed', months } as unknown as SeasonCall), NO_OBS)).toThrow(/whole months/);
    }
    expect(() => applySeason([spot('a')], calls({ id: 'a', kind: 'rapeseed', months: [3] }, { id: 'a', kind: 'rapeseed', months: [4] }), NO_OBS)).toThrow(/twice/);
  });

  it('a judgment for an id that does not ship stops the run; so does an unknown kind', () => {
    expect(() => applySeason([spot('a')], calls({ id: 'gone', kind: 'rapeseed', months: [3] }), NO_OBS)).toThrow(/not shipped/);
    expect(() => applySeason([spot('a')], calls({ id: 'a', kind: 'beach', months: [7] }), NO_OBS)).toThrow(/unknown kind/);
  });

  it('season goes last, before a 체험 booking field, and an old season is replaced', () => {
    const [x] = applySeason([{ ...spot('a'), season: [{ kind: 'plum', from: '2025-02-01', to: '2025-02-14' }], book: { k: 'phone', u: 'tel:0647000000' } }], calls(
      { id: 'a', kind: 'tangerine', months: null, cultivation: '노지' },
    ), NO_OBS);
    expect(Object.keys(x).slice(-2)).toEqual(['season', 'book']);
    expect(x.season).toEqual([{ kind: 'tangerine', months: [11, 12] }]);
  });
});

describe('S1b observed kinds (fixture stations and blooms)', () => {
  const stations: Station[] = [
    { stn: 184, name: '제주', lat: 33.514, lon: 126.53, species: ['plum', 'cherry'] },
    { stn: 189, name: '서귀포', lat: 33.246, lon: 126.565, species: ['plum', 'cherry'] },
    { stn: 188, name: '성산', lat: 33.387, lon: 126.88, species: [] },
  ];
  const north = { lat: 33.5, lng: 126.52 };
  const south = { lat: 33.25, lng: 126.56 };
  const east = { lat: 33.39, lng: 126.88 };
  const blooms = (records: Blooms['records'], status: Record<string, string> = { plum: 'ok', cherry: 'ok' }, year = 2027): Blooms => ({ year, status, records });
  const rec = (species: string, station: number, firstBloom: string) => ({ species, station, firstBloom, source: 'apihub:계절관측', fetched: '2027-03-25T07:00:00+09:00' });

  it('window = firstBloom .. firstBloom + N (cherry 9, plum 13), from the nearest station observing the species', () => {
    const b = blooms([rec('cherry', 184, '2027-03-24'), rec('cherry', 189, '2027-03-20'), rec('plum', 189, '2027-02-01')]);
    expect(observedWindow(north, 'cherry', stations, b, 2027)).toEqual({ from: '2027-03-24', to: '2027-04-02' });
    expect(observedWindow(south, 'cherry', stations, b, 2027)).toEqual({ from: '2027-03-20', to: '2027-03-29' });
    expect(observedWindow(south, 'plum', stations, b, 2027)).toEqual({ from: '2027-02-01', to: '2027-02-14' });
    // 성산 observes nothing: an eastern place uses the nearest station that does
    expect(observedWindow(east, 'cherry', stations, b, 2027)).not.toBeNull();
  });

  it('no date at the nearest station: nothing, never borrowed from another station', () => {
    const b = blooms([rec('plum', 189, '2027-02-01')]);
    expect(observedWindow(north, 'plum', stations, b, 2027)).toBeNull();
  });

  it("last year's file, a missing file, no stations, none or failed: nothing", () => {
    const r = [rec('cherry', 184, '2026-03-24')];
    expect(observedWindow(north, 'cherry', stations, blooms(r, undefined, 2026), 2027)).toBeNull();
    expect(observedWindow(north, 'cherry', stations, null, 2027)).toBeNull();
    expect(observedWindow(north, 'cherry', [], blooms([rec('cherry', 184, '2027-03-24')]), 2027)).toBeNull();
    for (const st of ['none', 'failed']) expect(observedWindow(north, 'cherry', stations, blooms([rec('cherry', 184, '2027-03-24')], { cherry: st }), 2027)).toBeNull();
  });

  it('applySeason attaches { kind, from, to } for a passing observed kind, nothing for a failing one, kinds in ADR-0080 5 order', () => {
    const b = blooms([rec('cherry', 184, '2027-03-24'), rec('plum', 184, '2027-02-10')]);
    const [a] = applySeason([{ id: 'a', mood: 'walk', ...north }], {
      calls: [
        { id: 'a', kind: 'rapeseed', months: [3] },
        { id: 'a', kind: 'cherry', months: null },
        { id: 'a', kind: 'plum', months: null },
      ],
      pass: new Set(['rapeseed', 'plum']),
    }, { stations, blooms: b, year: 2027 });
    expect(a.season).toEqual([{ kind: 'plum', from: '2027-02-10', to: '2027-02-23' }, { kind: 'rapeseed', months: [3] }]);
  });
});
