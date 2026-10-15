// 해 지는 시각 (ADR-0075 2, specs/home-refresh.md 데이터 규칙): NOAA on the device vs Open-Meteo for 제주시, ±2분.
// 해 뜨는 시각과 밤 (ADR-0091): the same method, the same reference.
import { describe, expect, it } from 'vitest';
import { AREAS } from '../src/areas';
import { nightNow, sunriseMinutes, sunsetMinutes, sunsetText } from '../src/sun';

const JEJU_CITY = { lat: 33.5125, lng: 126.526 };
const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));

describe('sunset', () => {
  it.each([
    ['2026-10-03', '18:16'],
    ['2026-06-21', '19:46'],
    ['2026-03-20', '18:45'],
    ['2026-09-01', '18:59'],
  ])('%s at 제주시 is %s (Open-Meteo) within 2 minutes', (day, want) => {
    expect(Math.abs(sunsetMinutes(JEJU_CITY, day) - toMin(want))).toBeLessThanOrEqual(2);
    expect(Math.abs(toMin(sunsetText(JEJU_CITY, day)) - toMin(want))).toBeLessThanOrEqual(2);
  });

  it('every area centre, every month: between 17:00 and 20:00', () => {
    for (const a of AREAS)
      for (let m = 1; m <= 12; m++) {
        const t = sunsetText(a, `2026-${String(m).padStart(2, '0')}-15`);
        expect(t >= '17:00' && t <= '20:00', `${a.name} ${m}월 ${t}`).toBe(true);
      }
  });
});

describe('sunrise (ADR-0091)', () => {
  // Open-Meteo daily sunrise at 33.5125, 126.526 (Asia/Seoul), read 2026-10-16; 2025-12-15 from its archive
  it.each([
    ['2026-10-03', '06:29'],
    ['2026-06-21', '05:24'],
    ['2026-03-20', '06:38'],
    ['2026-09-01', '06:07'],
    ['2026-10-15', '06:38'],
    ['2026-06-15', '05:23'],
    ['2025-12-15', '07:30'],
  ])('%s at 제주시 is %s (Open-Meteo) within 2 minutes', (day, want) => {
    expect(Math.abs(sunriseMinutes(JEJU_CITY, day) - toMin(want))).toBeLessThanOrEqual(2);
  });

  it('every area centre, every month: between 05:00 and 08:00, east before west', () => {
    const east = AREAS.find((a) => a.name === '성산')!;
    const west = AREAS.find((a) => a.name === '한경')!;
    for (let m = 1; m <= 12; m++) {
      const day = `2026-${String(m).padStart(2, '0')}-15`;
      for (const a of AREAS) {
        const t = sunriseMinutes(a, day);
        expect(t >= 5 * 60 && t <= 8 * 60, `${a.name} ${m}월 ${t}`).toBe(true);
      }
      expect(sunriseMinutes(east, day)).toBeLessThan(sunriseMinutes(west, day));
    }
  });
});

describe('nightNow (ADR-0091): from the sunset to the sunrise, at the point', () => {
  const day = '2026-10-16';
  const set = sunsetMinutes(JEJU_CITY, day);
  const rise = sunriseMinutes(JEJU_CITY, day);
  it('the sunset starts it, the sunrise ends it; a moment either side is the other', () => {
    expect(nightNow(set - 0.5, JEJU_CITY, day)).toBe(false);
    expect(nightNow(set, JEJU_CITY, day)).toBe(true);
    expect(nightNow(set + 0.5, JEJU_CITY, day)).toBe(true);
    expect(nightNow(rise - 0.5, JEJU_CITY, day)).toBe(true);
    expect(nightNow(rise, JEJU_CITY, day)).toBe(false);
    expect(nightNow(rise + 0.5, JEJU_CITY, day)).toBe(false);
  });
  it('22:00, 00:25 and 05:00 are night; 12:00 is not; no time read yet is never night', () => {
    for (const hm of ['22:00', '00:25', '05:00']) expect(nightNow(toMin(hm), JEJU_CITY, day), hm).toBe(true);
    expect(nightNow(toMin('12:00'), JEJU_CITY, day)).toBe(false);
    expect(nightNow(null, JEJU_CITY, day)).toBe(false);
  });
  it('in June 05:00 is still night (sunrise 05:23), 05:30 is not', () => {
    expect(nightNow(toMin('05:00'), JEJU_CITY, '2026-06-15')).toBe(true);
    expect(nightNow(toMin('05:30'), JEJU_CITY, '2026-06-15')).toBe(false);
  });
});
