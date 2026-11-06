// 오일장 장날 판정 (ADR-0066, specs/market-days.md M2): 날짜 경계·월말·31일·KST.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dayOf } from '../src/dates';
import { marketDay, marketText, type Market } from '../src/pick/market';

const JEJU: Market = { days: [2, 7, 12, 17, 22, 27], label: '2·7일' };
const SEHWA: Market = { days: [5, 10, 15, 20, 25, 30], label: '5·10일' };
const HAMDEOK: Market = { days: [1, 6, 11, 16, 21, 26], label: '1·6일' };
const DAEJEONG: Market = { days: [1, 6, 11, 16, 21, 26, 31], label: '1·6일', noFirstAfter31: true };

describe('M2 marketDay', () => {
  it('2·7일: the days listed open, the rest are off (month end, the 31st)', () => {
    for (const d of ['2026-10-02', '2026-10-07', '2026-10-12', '2026-10-27']) expect(marketDay(JEJU, d)).toBe('open');
    for (const d of ['2026-10-01', '2026-10-03', '2026-10-28', '2026-10-31']) expect(marketDay(JEJU, d)).toBe('off');
  });

  it('5·10일: the 30th opens, the 31st does not', () => {
    expect(marketDay(SEHWA, '2026-09-30')).toBe('open');
    expect(marketDay(SEHWA, '2026-10-30')).toBe('open');
    expect(marketDay(SEHWA, '2026-10-31')).toBe('off');
  });

  it('함덕 (the listed days only): the 31st is off, the 1st after a 31-day month opens', () => {
    expect(marketDay(HAMDEOK, '2026-10-31')).toBe('off');
    expect(marketDay(HAMDEOK, '2026-11-01')).toBe('open');
  });

  it('대정: opens on the 31st, closed on the 1st after a 31-day month, open on the 1st otherwise', () => {
    expect(marketDay(DAEJEONG, '2026-10-31')).toBe('open');
    expect(marketDay(DAEJEONG, '2026-11-01')).toBe('closed');
    expect(marketDay(DAEJEONG, '2026-08-01')).toBe('closed'); // July has 31
    expect(marketDay(DAEJEONG, '2027-01-01')).toBe('closed'); // December has 31, across the year
    expect(marketDay(DAEJEONG, '2026-10-01')).toBe('open'); // September has 30
    expect(marketDay(DAEJEONG, '2027-03-01')).toBe('open'); // February 2027 has 28
    expect(marketDay(DAEJEONG, '2028-03-01')).toBe('open'); // February 2028 has 29
    expect(marketDay(DAEJEONG, '2027-02-28')).toBe('off');
    expect(marketDay(DAEJEONG, '2028-02-29')).toBe('off');
    expect(marketDay(DAEJEONG, '2026-11-06')).toBe('open');
  });

  it('the day is the Jeju (KST) day: 14:59:59Z is still the 1st, 15:00Z is the 2nd', () => {
    expect(marketDay(JEJU, dayOf(new Date('2026-10-01T14:59:59Z')))).toBe('off');
    expect(marketDay(JEJU, dayOf(new Date('2026-10-01T15:00:00Z')))).toBe('open');
    // the 31st turning into the 1st at Jeju midnight
    expect(marketDay(DAEJEONG, dayOf(new Date('2026-10-31T14:59:59Z')))).toBe('open');
    expect(marketDay(DAEJEONG, dayOf(new Date('2026-10-31T15:00:00Z')))).toBe('closed');
  });

  it('a malformed rule is never open', () => {
    expect(marketDay({ days: 'x' } as unknown as Market, '2026-10-02')).toBe('off');
  });
});

describe('M4 marketText', () => {
  it('now mode: 오늘 장 서는 날 on a market day, 장날: {label} otherwise', () => {
    expect(marketText(JEJU, '2026-10-02', false)).toBe('오늘 장 서는 날');
    expect(marketText(JEJU, '2026-10-03', false)).toBe('장날: 2·7일');
  });
  it('date mode: 이날 장 서는 날 on a market day', () => {
    expect(marketText(JEJU, '2026-10-07', true)).toBe('이날 장 서는 날');
    expect(marketText(JEJU, '2026-10-08', true)).toBe('장날: 2·7일');
  });
  it('a closed day reads like any other non-market day', () => {
    expect(marketText(DAEJEONG, '2026-11-01', false)).toBe('장날: 1·6일');
  });
});

describe('부산 장날 (plans/busan.md S6, review/busan/market-days.json)', () => {
  const busan = JSON.parse(readFileSync(resolve(__dirname, '../public/spots-busan.json'), 'utf8')) as { id: string; name: string; market?: Market }[];
  const rules = JSON.parse(readFileSync(resolve(__dirname, '../review/busan/market-days.json'), 'utf8')) as { markets: { id: string; days: number[]; label: string; second: string; kakao: { status: string } }[] };
  it('only the places the file confirms carry a market day: 구포시장 3·8일; 기장시장 none (not confirmed)', () => {
    expect(busan.filter((s) => s.market).map((s) => [s.name, s.market])).toEqual([['구포시장', { days: [3, 8, 13, 18, 23, 28], label: '3·8일' }]]);
    expect(busan.find((s) => s.id === 'bs-1117790')?.market).toBeUndefined();
  });
  it('each confirmed market has a second source and an open Kakao place', () => {
    for (const m of rules.markets) {
      expect(m.second, m.id).toMatch(/^https:\/\//);
      expect(m.kakao.status, m.id).toBe('Y');
    }
  });
  it('구포: the 28th opens, the 27th and the 31st are off', () => {
    const gupo = busan.find((s) => s.id === 'bs-1250885')!.market!;
    expect(marketDay(gupo, '2026-10-28')).toBe('open');
    expect(marketDay(gupo, '2026-10-03')).toBe('open');
    expect(marketDay(gupo, '2026-10-27')).toBe('off');
    expect(marketDay(gupo, '2026-10-31')).toBe('off');
    expect(marketText(gupo, '2026-10-27', false)).toBe('장날: 3·8일');
  });
});
