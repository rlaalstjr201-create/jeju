import { describe, expect, it } from 'vitest';
import { ANCHORS, anchors, build, render } from '../scripts/nation/build.mjs';
import type { NationScopeRecord } from '../scripts/nation/collect.mjs';

// 자동 지역 출하 파일 (plans/nationwide.md N3)

const rec = (n: number, extra: Partial<NationScopeRecord> = {}): NationScopeRecord => ({
  id: `nt-${n}`, title: `  곳 ${n}  `, addr1: '강원특별자치도 강릉시 어딘가 1', lDongRegnCd: '51', lDongSignguCd: '150',
  lat: Math.round((37.7 + n / 100) * 100) / 100, lng: 128.9, contenttypeid: 12, lclsSystm1: 'A', lclsSystm2: 'B', lclsSystm3: 'C', image: 'https://x/y.jpg', modifiedtime: '20260101', ...extra,
});
const scopes = {
  '51': [
    rec(30), rec(10), rec(20), rec(40), rec(50), rec(60, { lat: NaN }), rec(70),
    rec(80, { lDongSignguCd: '230', addr1: '강원특별자치도 삼척시 가곡면 1', lat: 37.1 }),
  ],
};
const results = [
  { id: 'nt-10', keep: true, mood: 'new', sub: 'do', indoor: true },
  { id: 'nt-20', keep: true, mood: 'food', sub: 'cafe', indoor: false },
  { id: 'nt-30', keep: true, mood: 'walk', sub: '', indoor: false },
  { id: 'nt-40', keep: true, mood: 'food', sub: '' },
  { id: 'nt-50', keep: false },
  { id: 'nt-60', keep: true, mood: 'walk', sub: '' },
  { id: 'nt-70', keep: true, mood: 'food', sub: 'meal', indoor: true },
  { id: 'nt-80', keep: true, mood: 'walk', sub: '' },
];

describe('출하 파일 build', () => {
  const b = build({ scopes, results });
  const rows = b.files['51'];

  it('레코드 모양·정렬·빠지는 곳', () => {
    expect(rows.map((r) => r.id)).toEqual(['nt-10', 'nt-20', 'nt-30', 'nt-70', 'nt-80']);
    expect(rows[0]).toEqual({ id: 'nt-10', name: '곳 10', lat: 37.8, lng: 128.9, sgg: '51150', cat: ['A', 'B', 'C'], image: 'https://x/y.jpg', moods: ['new'], sub: 'sight', indoor: true });
    expect(b.dropped).toBe(3);
  });
  it('sub 규칙: 먹기는 meal|cafe, 새로운 것은 항상 sight, 걷기는 없음, indoor는 true일 때만', () => {
    expect(rows[1]).toMatchObject({ sub: 'cafe' });
    expect(rows[1]).not.toHaveProperty('indoor');
    expect(rows[2]).not.toHaveProperty('sub');
    expect(rows[2]).not.toHaveProperty('indoor');
    expect(rows[3]).toMatchObject({ sub: 'meal', indoor: true });
  });
  it('index: 모양과 시군구 중앙값', () => {
    const { index } = render(b);
    expect(index.v).toBe(1);
    expect(index.rules).toEqual({ moods: ['walk', 'new', 'food'], indoor: true });
    expect(index.sido.find((s) => s.c === '12')).toEqual({ c: '12', n: '전남광주통합특별시', s: '전남광주' });
    expect(index.sido.map((s) => s.c)).toEqual(expect.arrayContaining(['26', '50', '36110']));
    // p (ADR-0104): 8 places or fewer are their own points, 0.001° off the median point
    expect(index.sgg).toEqual([
      { c: '51150', n: '강릉시', s: '51', lat: 37.95, lng: 128.9, f: '51', p: [50, 0, -150, 0, -50, 0, 450, 0] },
      { c: '51230', n: '삼척시', s: '51', lat: 37.1, lng: 128.9, f: '51', p: [0, 0] },
    ]);
    expect(index.files['51']).toMatch(/^[0-9a-f]{10}$/);
  });
  it('anchors (ADR-0104): 8개까지, 곳 하나뿐인 점은 버림, 같은 입력이면 같은 점', () => {
    // two groups 50 km apart, 20 places each, and one stray record far off
    const pts = [...Array.from({ length: 20 }, (_, i) => ({ lat: 37 + i / 1000, lng: 128 })), ...Array.from({ length: 20 }, (_, i) => ({ lat: 37.45 + i / 1000, lng: 128 })), { lat: 36, lng: 126 }];
    const a = anchors(pts);
    expect(a.length).toBeLessThanOrEqual(ANCHORS);
    expect(a.some((x) => x.lat < 36.5)).toBe(false);
    expect(a.some((x) => x.lat < 37.1) && a.some((x) => x.lat > 37.4)).toBe(true);
    expect(anchors(pts)).toEqual(a);
    expect(anchors(pts.slice(0, 3))).toEqual(pts.slice(0, 3));
  });
  it('같은 입력이면 같은 바이트', () => {
    expect(render(build({ scopes, results })).texts).toEqual(render(b).texts);
    expect(render(b).texts['51.json']).not.toContain('\n');
  });
});
