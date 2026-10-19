// 부산 세부 지역 12곳 (specs/busan.md 2절, plans/busan.md S5, 사전등록 review/busan/areas-criteria.md 고침 2·3).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AREAS, BUSAN_AREAS, nearestArea } from '../src/areas';
import { normalizeSpots } from '../src/data';
import { CARD_COUNT, listed, pickCards, pool, withinReach, type Button, type Spot, type Tab } from '../src/pick';

const root = resolve(__dirname, '..');
const spots = normalizeSpots(JSON.parse(readFileSync(resolve(root, 'public/spots-busan.json'), 'utf8'))) as Spot[];
const byId = new Map(spots.map((s) => [s.id, s]));
const run = JSON.parse(readFileSync(resolve(root, 'review/busan/areas-02.json'), 'utf8')) as {
  method: string;
  areas: { name: string; slug: string; landmark: string; lat: number; lng: number }[];
  rescored: { passed: boolean };
};
const near = (id: string) => nearestArea(byId.get(id)!, BUSAN_AREAS).name;
const DAY = '2026-10-20';

describe('동네 표', () => {
  it('areas.ts is areas-02.json (중심 = 대표 지명 점, 고침 2), west → east, and that run passed after 고침 3', () => {
    expect(run.method).toBe('landmark');
    expect(run.rescored.passed).toBe(true);
    expect(BUSAN_AREAS.map(({ name, slug, landmark, lat, lng }) => ({ name, slug, landmark, lat, lng }))).toEqual(
      run.areas.map(({ name, slug, landmark, lat, lng }) => ({ name, slug, landmark, lat, lng })),
    );
    expect(BUSAN_AREAS.map((a) => a.landmark)).toEqual(['다대포해수욕장', '감천문화마을', '자갈치시장', '흰여울마을', '이바구길', '서면', '범어사', '오륙도', '광안대교', '센텀시티', '해운대해수욕장', '해동용궁사']);
  });
  it('slugs: 12, all different, none of Jeju’s 15', () => {
    const slugs = BUSAN_AREAS.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(12);
    expect(slugs.filter((s) => AREAS.some((j) => (j.slug as string) === s))).toEqual([]);
    expect(BUSAN_AREAS.filter((a) => AREAS.some((j) => (j.name as string) === a.name))).toEqual([]);
  });
  it('each 대표 지명 is in its own area; 대항 → 다대포, 일광 → 송정·기장, 구포 → 서면 (고침 3)', () => {
    const at = { 다대포: 'bs-126079', '송도·감천': 'bs-1997221', 원도심: 'bs-132190', 영도: 'bs-2684712', '부산역·초량': 'bs-2605916', 서면: 'bs-2763900', '동래·금정': 'bs-126148', '오륙도·용호': 'bs-126088', 광안리: 'bs-128164', 센텀: 'bs-702551', 해운대: 'bs-126081', '송정·기장': 'bs-126848' };
    expect(Object.entries(at).filter(([a, id]) => near(id) !== a)).toEqual([]);
    expect([near('bs-2785960'), near('bs-126098'), near('bs-1250885')]).toEqual(['다대포', '송정·기장', '서면']);
  });
});

const visible = (sub: 'sight' | 'do') => spots.filter((s) => listed(s) && s.mood === 'new' && s.sub === sub).length >= CARD_COUNT;
const COMBOS: [Button, Tab?][] = [['rest'], ['walk'], ['famous'], ['any'], ['food', 'meal'], ['food', 'cafe'], ['new', 'mix'], ...(['sight', 'do'] as const).filter(visible).map((t) => ['new', t] as [Button, Tab])];

describe('B7·D1 (낮)', () => {
  it('B7: 12 areas × 3 ranges × every button and visible tab × 비 와요 off/on — 3 cards each, never empty', () => {
    const short: string[] = [];
    for (const a of BUSAN_AREAS)
      for (const reach of ['walk', 'drive30', 'drive60'] as const)
        for (const [button, tab] of COMBOS)
          for (const indoor of [false, true]) {
            const n = pickCards(spots, a, button, {}, tab, reach, indoor, DAY, false).cards.length;
            if (n !== CARD_COUNT) short.push(`${a.name} ${reach} ${button}:${tab ?? ''}${indoor ? ' 실내' : ''} ${n}`);
          }
    expect(COMBOS).toHaveLength(9);
    expect(short).toEqual([]);
  });
  it('D1: 유명한 데, 차로 30분, 낮 — 3 places inside the range in every area, no widening', () => {
    const thin = BUSAN_AREAS.map((a) => [a.name, pool(spots, a, 'famous', undefined, 'drive30', false, DAY, false).filter((c) => withinReach('drive30', a, c.spot)).length] as const).filter(([, n]) => n < CARD_COUNT);
    expect(thin).toEqual([]);
  });
});
