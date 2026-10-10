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

  it('no rows: 데이터 없음 for both windows (and both 저장 목록 흐름 windows), no zeros as findings', () => {
    const md = renderReport([], names, today);
    expect(md.match(/데이터 없음\./g)).toHaveLength(4);
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

  // 저장 목록 흐름 (ADR-0085, specs/saved-flow-events.md F9)
  const flow = [
    { event: 'tap', id: 'mood:rest', n7: 40, n28: 40 },
    { event: 'save', id: 'p1', n7: 10, n28: 20 },
    { event: 'save', id: 'save:dated', n7: 4, n28: 5 },
    { event: 'save', id: 'save:now', n7: 6, n28: 15 },
    { event: 'map', id: 'p1', n7: 8, n28: 8 },
    { event: 'shown', id: 'p1', n7: 100, n28: 100 },
    { event: 'open', id: 'open', n7: 20, n28: 30 },
    { event: 'open', id: 'open:live0:past', n7: 5, n28: 6 },
    { event: 'open', id: 'open:live0', n7: 3, n28: 3 },
    { event: 'open', id: 'open:past', n7: 2, n28: 1 },
    { event: 'map', id: 'saved:a0:-', n7: 2, n28: 2 },
    { event: 'map', id: 'saved:a1:-', n7: 1, n28: 1 },
    { event: 'map', id: 'saved:a2:p', n7: 3, n28: 3 },
    { event: 'map', id: 'saved:ax:-', n7: 2, n28: 2 },
    { event: 'arrange', id: 'arrange:up', n7: 3, n28: 3 },
    { event: 'arrange', id: 'arrange:past', n7: 6, n28: 6 },
  ];

  it('Q1–Q3 from fixed rows; the flow ids are never places in the sections above', () => {
    const md = renderReport(flow, names, today);
    const [, f] = md.split('## 저장 목록 흐름');
    const [f7, f28] = f.split('### 지난 28일');
    expect(f7).toContain('- Q1 날짜를 고른 상태의 저장: 4 / 10 (40.0%)');
    expect(f7).toContain('- Q2-a 저장 목록 열기 30회 중 ♥ 0이면서 지난 날이 접힌 채: 5 (16.7%)');
    expect(f7).toContain('- Q2-b 목록에서 연 길찾기 8회 — 담은 날 0일 2, 1일 1, 2일 이상 3, 모름 2; 그중 지난 날 줄 3 (37.5%)');
    expect(f7).toContain('- Q2-c 다음 날 이어짐(근사): 목록 길찾기 중 1일 이상 4 / 저장 10 (40.0%)');
    expect(f7).toContain('근사');
    expect(f7).toContain('- Q3 정리 9회 (열기 대비 30.0%): 위로 3, 아래로 0, 다른 날로 0, 지난 날 펼치기·접기 6');
    expect(f7).not.toContain('참고만');
    expect(f28).toContain('- Q2-a 저장 목록 열기 40회 중');
    expect(f28).toContain('- Q1 날짜를 고른 상태의 저장: 5 / 20 (25.0%)');
    // above: no 「지금 데이터에 없는 곳 save:…」, the map count is the places' own
    expect(md).not.toMatch(/데이터에 없는 곳 (save|saved|open|arrange)/);
    expect(md.split('## 저장 목록 흐름')[0]).toContain('카드 노출 100장 → 지도 열기 8회 (8.0%)');
  });

  it('a small sample says 참고만; zero stays 0; a window with no flow rows says 데이터 없음', () => {
    const rows = [
      { event: 'open', id: 'open', n7: 0, n28: 3 },
      { event: 'save', id: 'save:now', n7: 0, n28: 2 },
    ];
    const [, f] = renderReport(rows, names, today).split('## 저장 목록 흐름');
    const [f7, f28] = f.split('### 지난 28일');
    expect(f7).toContain('데이터 없음.');
    expect(f28).toContain('- Q1 날짜를 고른 상태의 저장: 0 / 2 (0.0%)');
    expect(f28).toContain('- Q2-b 목록에서 연 길찾기 0회');
    expect(f28).toContain('저장 목록 열기가 3회뿐이라 비율은 참고만 해요.');
  });
});
