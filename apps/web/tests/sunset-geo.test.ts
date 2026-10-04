// 노을 볼 곳 기하 (ADR-0083, specs/sunset-view.md 「계산」) on a made-up coastline: a main island, two small islands.
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs build script
import { landOf, prepareCoast, rayClear, seesSunset, sunsetAzimuths } from '../scripts/sunset-geo.mjs';
// @ts-expect-error plain .mjs build script
import { simplify, stitch } from '../scripts/coast-freeze.mjs';

const box = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
// main island ≈ 46 km × 33 km; an islet 4.6 km off its west coast; an islet 9 km off its east coast; one 23 km off
const MAIN = box(126.0, 33.2, 126.5, 33.5);
const WEST_ISLET = box(125.95, 33.4, 125.96, 33.41);
const EAST_ISLET = box(126.6, 33.34, 126.61, 33.36);
const FAR_ISLET = box(126.75, 33.34, 126.76, 33.36);
const coast = prepareCoast([MAIN, WEST_ISLET, EAST_ISLET, FAR_ISLET]);

describe('sunset geometry (synthetic coast)', () => {
  it('a place on the west coast sees the sunset to the west', () => {
    expect(seesSunset({ lat: 33.3, lng: 126.001 }, 264, coast)).toBe(true);
  });
  it('a place 5 km inland does not: 300 m out is still land', () => {
    expect(seesSunset({ lat: 33.3, lng: 126.05 }, 264, coast)).toBe(false);
  });
  it('a place on the east coast looking west does not (the main island is behind it)', () => {
    expect(seesSunset({ lat: 33.3, lng: 126.499 }, 264, coast)).toBe(false);
  });
  it('a small island on the way is allowed', () => {
    expect(rayClear({ lat: 33.405, lng: 126.001 }, 270, coast)).toBe(true);
  });
  it('from a small island, the main island within 20 km blocks the sunset', () => {
    expect(landOf({ lat: 33.35, lng: 126.6005 }, coast)).toBe(2);
    expect(seesSunset({ lat: 33.35, lng: 126.6005 }, 264, coast)).toBe(false);
  });
  it('the far side of a small island does not leave it within 300 m', () => {
    expect(rayClear({ lat: 33.35, lng: 126.6095 }, 270, coast)).toBe(false);
  });
  it('the main island beyond 20 km does not count', () => {
    expect(rayClear({ lat: 33.35, lng: 126.7505 }, 270, coast)).toBe(true);
  });
  it('a pin at sea west of the coast sees it', () => {
    expect(landOf({ lat: 33.3, lng: 125.99 }, coast)).toBe(-1);
    expect(seesSunset({ lat: 33.3, lng: 125.99 }, 242, coast)).toBe(true);
  });
  it('a north-coast place 2 km from the west corner: 298° goes out to sea, 242°·264° run along the land', () => {
    const p = { lat: 33.4995, lng: 126.02 };
    expect(sunsetAzimuths(p, coast)).toEqual([298]);
  });
});

describe('coastline freeze', () => {
  it('joins ways by their end nodes into closed rings', () => {
    const g = (pts: number[][]) => pts.map(([lon, lat]) => ({ lon, lat }));
    const rings = stitch([
      { id: 1, nodes: [1, 2, 3], geometry: g([[0, 0], [1, 0], [1, 1]]) },
      { id: 2, nodes: [3, 4, 1], geometry: g([[1, 1], [0, 1], [0, 0]]) },
    ]);
    expect(rings).toEqual([[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]);
  });
  it('throws on a way that does not close', () => {
    expect(() => stitch([{ id: 1, nodes: [1, 2], geometry: [{ lon: 0, lat: 0 }, { lon: 1, lat: 0 }] }])).toThrow(/does not close/);
  });
  it('simplify drops points within the tolerance and keeps the ends', () => {
    const line = [[126, 33], [126.00001, 33.000001], [126.0001, 33], [126.0002, 33.001]];
    const out = simplify(line, 5);
    expect(out[0]).toEqual(line[0]);
    expect(out.at(-1)).toEqual(line.at(-1));
    expect(out.length).toBeLessThan(line.length);
  });
});
