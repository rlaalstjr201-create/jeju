// 해 지는 시각 (ADR-0075 2, specs/home-refresh.md 데이터 규칙): NOAA on the device vs Open-Meteo for 제주시, ±2분.
import { describe, expect, it } from 'vitest';
import { AREAS } from '../src/areas';
import { sunsetMinutes, sunsetText } from '../src/sun';

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
