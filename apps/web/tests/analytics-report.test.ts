// ADR-0078 6: npm run analytics:report — the D1 rows → a short Korean summary; no data says so.
import { describe, expect, it } from 'vitest';
import { parseWranglerJson, renderReport, reportSql } from '../scripts/analytics-report.mjs';

const today = '2026-10-03';
const names = new Map([
  ['p1', '사려니숲길'],
  ['p2', '동문시장'],
]);

describe('analytics report', () => {
  it('one query: 7 and 28 days in Seoul days, no double quotes (cmd.exe)', () => {
    const sql = reportSql(today);
    expect(sql).toContain("day >= '2026-09-27'");
    expect(sql).toContain("day >= '2026-09-06'");
    expect(sql).not.toContain('"');
  });

  it('no rows: 데이터 없음 for both windows, no zeros as findings', () => {
    const md = renderReport([], names, today);
    expect(md.match(/데이터 없음\./g)).toHaveLength(2);
    expect(md).not.toMatch(/0\.0%|0회/);
  });

  it('mood taps, shown → map, top saved net of unsave with names, date mode pointed to GA4', () => {
    const rows = [
      { event: 'tap', id: 'mood:rest', n7: 30, n28: 60 },
      { event: 'tap', id: 'mood:food', n7: 10, n28: 40 },
      { event: 'shown', id: 'p1', n7: 100, n28: 200 },
      { event: 'map', id: 'p1', n7: 5, n28: 10 },
      { event: 'save', id: 'p1', n7: 4, n28: 9 },
      { event: 'unsave', id: 'p1', n7: 1, n28: 2 },
      { event: 'save', id: 'p2', n7: 0, n28: 3 },
      { event: 'save', id: 'gone', n7: 1, n28: 1 },
    ];
    const md = renderReport(rows, names, today);
    const [d7, d28] = md.split('## 지난 28일');
    expect(d7).toContain('기분 탭 40회: 푹 쉬고 싶어 30(75.0%), 배고파 10(25.0%)');
    expect(d7).toContain('카드 노출 100장 → 지도 열기 5회 (5.0%)');
    expect(d7).toContain('  - 사려니숲길 3\n  - (지금 데이터에 없는 곳 gone) 1');
    expect(d7).not.toContain('동문시장');
    expect(d28).toContain('  - 사려니숲길 7\n  - 동문시장 3');
    expect(md).toContain('날짜 모드 비율: 자체 기록에는 남지 않아요');
    expect(d7).not.toContain('참고만');
  });

  it('parses wrangler --json output and refuses anything else', () => {
    expect(parseWranglerJson('[{"results":[{"event":"tap","id":"mood:any","n7":1,"n28":1}],"success":true,"meta":{}}]')).toHaveLength(1);
    expect(() => parseWranglerJson('{"error":"x"}')).toThrow();
  });
});
