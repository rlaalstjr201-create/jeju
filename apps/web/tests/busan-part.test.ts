// @vitest-environment jsdom
// 부산 몫은 따로 받는 청크 (plans/busan.md budget, ADR-0098): with the switch on, a Jeju visit runs without Busan's part
// (its areas, its boundary, the 시작 화면's module); choosing 부산 in the 기준 시트 brings it, then Busan. A file of its
// own: the part, once in, stays in for the rest of a test file.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Spot } from '../src/pick';
import { BUSAN, released } from '../src/release';
import { fileSpots } from './fixtures';
import { $, $$, flush, render, reset, settle, tap } from './harness';

const busanRaw = JSON.parse(readFileSync(resolve(__dirname, '../public/spots-busan.json'), 'utf8')) as Spot[];
const wait = async () => {
  for (let i = 0; i < 4; i++) await flush();
  await settle();
};

describe.runIf(BUSAN)('부산 몫 (switch on)', () => {
  beforeEach(() => {
    reset();
    Element.prototype.scrollIntoView ??= () => undefined; // jsdom has no layout
    localStorage.setItem('jeju.dest', '"jeju"');
  });
  afterEach(reset);

  it('a Jeju visit: the sheet has the 여행지 row, nothing of Busan is loaded; 부산 chosen → the part, then Busan’s 12 areas', async () => {
    const asked: string[] = [];
    render({ loadSpots: (d) => (asked.push(d), Promise.resolve(d === 'busan' ? busanRaw : fileSpots)) });
    await wait();
    await tap('[data-mood="walk"]');
    await wait();
    expect(released('busan')).toBe(false);
    await tap('#basis');
    expect($$('#sheet [data-dest]').map((b) => b.textContent)).toEqual(['제주', '부산']);
    await tap('#sheet [data-dest="busan"]');
    await wait();
    expect(released('busan')).toBe(true);
    expect($('.logo .rg').textContent).toBe(':부산');
    expect($$('#sheet [data-area]')).toHaveLength(12);
    expect(asked).toEqual(['jeju', 'busan']);
  });
});
