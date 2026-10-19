// 여행지 모델과 출시 스위치 (plans/busan.md S1, 검토 M2): Jeju is decided as before, the switch is read in one module,
// and what runs without Vite (the Pages Functions, the tsx scripts) loads and answers with no define at all.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { inJeju } from '../src/areas';
import { readDeepLink } from '../src/deeplink';
import { areaAt, destOf, destOfId, inBusan } from '../src/dest';
import { naverDirectionsUrl } from '../src/links';
import { BUSAN, released, releasedDestOf } from '../src/release';
import { fileSpots } from './fixtures';

const root = resolve(__dirname, '..');
const TODAY = '2026-10-18';
const 해운대해수욕장 = { lat: 35.1587, lng: 129.1604 };
const 서울시청 = { lat: 37.5663, lng: 126.9779 };
const 성산일출봉 = { lat: 33.4584, lng: 126.9426 };

describe('destOf', () => {
  it('Jeju is exactly inJeju, on a grid over the box and past its edges', () => {
    const off: string[] = [];
    for (let lat = 32.9; lat <= 33.8; lat += 0.025)
      for (let lng = 125.9; lng <= 127.2; lng += 0.025) {
        const p = { lat, lng };
        if ((destOf(p) === 'jeju') !== inJeju(p) || (destOf(p) !== 'jeju' && destOf(p) !== null)) off.push(`${lat},${lng}`);
      }
    expect(off).toEqual([]);
    for (const [lat, lng] of [[33.0, 126.0], [33.7, 127.1], [33.0, 127.1], [33.7, 126.0]]) expect(destOf({ lat, lng }), `${lat},${lng}`).toBe('jeju');
    expect(fileSpots.every((s) => destOf(s) === 'jeju')).toBe(true);
  });

  it('outside every destination is null: 서울시청, a broken point', () => {
    expect(destOf(서울시청)).toBeNull();
    expect(destOf({ lat: Number.NaN, lng: 126.5 })).toBeNull();
    expect(destOf(해운대해수욕장)).toBe('busan');
  });

  // B4 (specs/busan.md): the 부산광역시 boundary (data/geo/busan-boundary.json), not a box — 김해시청 is outside
  it('B4: 부산 안 5점, 밖 5점; every shipped Busan place is inside', () => {
    const inside = { 해운대해수욕장, 김해국제공항: { lat: 35.1795, lng: 128.9382 }, 가덕도대항: { lat: 35.0186, lng: 128.8255 }, 일광해수욕장: { lat: 35.2601, lng: 129.2335 }, 범어사: { lat: 35.2836, lng: 129.0686 } };
    const outside = { 김해시청: { lat: 35.2285, lng: 128.8894 }, 양산시청: { lat: 35.335, lng: 129.0372 }, 울산시청: { lat: 35.5396, lng: 129.3114 }, 창원시청: { lat: 35.228, lng: 128.6811 }, 거제장승포: { lat: 34.8687, lng: 128.7256 } };
    expect(Object.entries(inside).filter(([, p]) => destOf(p) !== 'busan').map(([k]) => k)).toEqual([]);
    expect(Object.entries(outside).filter(([, p]) => destOf(p) !== null).map(([k]) => k)).toEqual([]);
    const busan = JSON.parse(readFileSync(join(root, 'public/spots-busan.json'), 'utf8')) as { id: string; lat: number; lng: number }[];
    expect(busan.filter((s) => !inBusan(s)).map((s) => s.id)).toEqual([]);
    expect(busan.every((s) => destOfId(s.id) === 'busan')).toBe(true);
    expect(fileSpots.every((s) => destOfId(s.id) === 'jeju' && !inBusan(s))).toBe(true);
  });

  it('a point\'s 동네 is the nearest centre of its own destination (Jeju\'s outside both)', () => {
    expect(areaAt(해운대해수욕장).name).toBe('해운대');
    expect(areaAt(성산일출봉).name).toBe('성산');
    expect(areaAt(서울시청).group).not.toBe('busan');
  });

  it('a link to a place outside every destination stays a name search, one inside is a coordinate link (as with inJeju)', () => {
    const s = fileSpots[0];
    expect(naverDirectionsUrl(s, 'car')).toContain('/directions/');
    expect(naverDirectionsUrl({ ...s, ...서울시청 }, 'car')).toContain('/search/');
  });
});

describe('출시 스위치 (src/release.ts)', () => {
  it('is on only in mode busan (npm run test:busan), off in npm test', () => {
    expect(BUSAN).toBe(import.meta.env.MODE === 'busan');
  });

  it('Jeju is always open; Busan only with the switch on', () => {
    expect(released('jeju')).toBe(true);
    expect(released('busan')).toBe(BUSAN);
  });

  it('the app takes in a point only inside an open destination: 성산 → Jeju; 해운대 → Busan only with the switch on; 서울 → none', () => {
    expect(releasedDestOf(성산일출봉)).toBe('jeju');
    expect(releasedDestOf(해운대해수욕장)).toBe(BUSAN ? 'busan' : null);
    expect(releasedDestOf(서울시청)).toBeNull();
  });

  it('links with Busan in them open Busan only with the switch on: ?stay=<해운대>, ?area=gwangalli', () => {
    expect(readDeepLink(`?stay=${해운대해수욕장.lat},${해운대해수욕장.lng}`, TODAY)).toEqual(BUSAN ? { stay: 해운대해수욕장 } : null);
    expect(readDeepLink('?area=gwangalli', TODAY)).toEqual(BUSAN ? { area: '광안리' } : null);
    expect(readDeepLink(`?stay=${서울시청.lat},${서울시청.lng}`, TODAY)).toBeNull();
    expect(readDeepLink(`?stay=${성산일출봉.lat},${성산일출봉.lng}`, TODAY)).toEqual({ stay: 성산일출봉 });
  });

  it('only src/release.ts reads __BUSAN__ (areas, destinations, functions and scripts never see it)', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
    const readers = ['src', 'functions', 'events', 'scripts']
      .flatMap((d) => walk(join(root, d)))
      .filter((f) => /\.(ts|mts|mjs|js)$/.test(f) && readFileSync(f, 'utf8').includes('__BUSAN__'))
      .map((f) => relative(root, f).replace(/\\/g, '/'));
    expect(readers.sort()).toEqual(['src/env.d.ts', 'src/release.ts']);
  });

  it('the Pages Functions, the landing build and the switch itself load and answer without any Vite define (as wrangler and tsx run them)', () => {
    const url = (f: string) => JSON.stringify(pathToFileURL(join(root, f)).href);
    const code = `
      const rain = await import(${url('functions/api/rain.ts')});
      const events = await import(${url('functions/api/events/index.ts')});
      await import(${url('scripts/landing.ts')});
      const { BUSAN } = await import(${url('src/release.ts')});
      const r = await rain.onRequestGet({ request: new Request('https://x.test/api/rain?area=aewol'), env: {} });
      const e = await events.onRequest({ request: new Request('https://x.test/api/events', { method: 'POST', body: '[]' }), env: {} });
      console.log(JSON.stringify([r.status, r.headers.get('X-Rain-Reason'), e.status, BUSAN]));`;
    const out = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { cwd: root, encoding: 'utf8' });
    expect(JSON.parse(out.trim().split('\n').pop()!)).toEqual([204, 'no-key', 503, false]);
  }, 60_000);
});
