// ADR-0081 5: scripts/feedback-report.mjs — the feedback rows → a summary on stdout, never a file.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { countSql, renderFeedback, reportSql } from '../scripts/feedback-report.mjs';

const row = (o: Partial<{ day: string; went: string; pains: string; pain: string; wish: string }>) => ({ day: '2026-10-05', went: null, pains: null, pain: null, wish: null, v: 'abc1234', ...o });

describe('feedback report', () => {
  it('SQL from a day on, no double quotes (cmd.exe); anything but a day is refused', () => {
    expect(reportSql('2026-10-01')).toBe("SELECT day, went, pains, pain, wish, v FROM feedback WHERE day >= '2026-10-01' ORDER BY day, rowid");
    expect(countSql('2026-10-01')).toBe("SELECT COUNT(*) AS n FROM feedback WHERE day >= '2026-10-01'");
    for (const sql of [reportSql('2026-10-01'), countSql('2026-10-01')]) expect(sql).not.toContain('"');
    expect(() => reportSql("2026-10-01' OR 1=1 --")).toThrow();
  });

  it('counts per day and per answer, the texts with their day; few answers are said to be few', () => {
    const text = renderFeedback(
      [row({ went: 'went', pains: '["far","gps"]' }), row({ went: 'not', pains: '["far"]', wish: '주차\n정보' }), row({ day: '2026-10-06', pain: '느려요' })],
      '2026-10-01',
      '2026-10-07',
    );
    expect(text).toContain('설문 응답 2026-10-01~2026-10-07 (서울 날짜): 3건');
    expect(text).toContain('응답이 3건뿐이라 비율로 결론 내지 않아요.');
    expect(text).toContain('  2026-10-05 2\n  2026-10-06 1');
    expect(text).toContain('골라 준 곳에 실제로 갔나요? (답한 2건)\n  갔어요 1\n  안 갔어요 1\n  아직 0');
    expect(text).toContain('  생각보다 멀었어요 2');
    expect(text).toContain('  위치가 잘 안 잡혔어요 1');
    expect(text).toContain('있었으면 하는 것 (1건):\n  [2026-10-05 abc1234] 주차 정보');
    expect(text).toContain('그 밖에 불편했던 점 (1건):\n  [2026-10-06 abc1234] 느려요');
    expect(renderFeedback([], '2026-10-01', '2026-10-07')).toBe('설문 응답 2026-10-01~2026-10-07 (서울 날짜): 0건\n');
  });

  it('writes no file: only stdout', () => {
    const src = readFileSync(resolve(__dirname, '../scripts/feedback-report.mjs'), 'utf8');
    expect(src).not.toMatch(/writeFile|appendFile|createWriteStream|mkdir/);
  });
});
