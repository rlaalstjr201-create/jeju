// S1' 레코드 형식, one rule for every destination's shipped file (plans/busan.md M9): tests/data.test.ts calls it for
// public/spots.json with Jeju's box, tests/busan-data.test.ts will for public/spots-busan.json with Busan's boundary.
import type { Point, Spot } from '../src/pick';

const FIELDS = ['bookable', 'id', 'image', 'indoor', 'kakaoPlaceId', 'lat', 'lng', 'mood', 'name', 'reason', 'score'];
const FOOD_FIELDS = [...FIELDS, 'sub'];

/** The box every shipped Jeju place has been inside (tighter than `inJeju`, which also holds the sea around it). */
export const JEJU_RECORD_BOX = (p: Point) => p.lat >= 33.1 && p.lat <= 33.6 && p.lng >= 126.1 && p.lng <= 127.0;

/** The ids of records that break the format: exactly the 11 fields (food, new: +sub; 오일장: +market; 체험: +book or
 * +hide, ADR-0074; 철: +season, ADR-0080; 노을: +sunsetView, +sunsetSea on filled ones, ADR-0083; 야외 산길: +trail true,
 * ADR-0091; 유명한 곳: +famous true +pop, ADR-0092), coords `inside`, https image, mood ∈ {rest,walk,new,food}. */
export function recordProblems(spots: readonly Spot[], inside: (p: Point) => boolean): string[] {
  return spots
    .filter((s) => {
      const expectedFields = [
        ...(s.mood === 'food' || s.mood === 'new' ? FOOD_FIELDS : FIELDS),
        ...('market' in s ? ['market'] : []),
        ...('season' in s ? ['season'] : []),
        ...('sunsetView' in s ? ['sunsetView'] : []),
        ...('sunsetSea' in s && 'sunsetView' in s ? ['sunsetSea'] : []),
        ...(s.trail === true ? ['trail'] : []),
        ...(s.famous === true ? ['famous', 'pop'] : []),
        ...('book' in s ? ['book'] : []),
        ...('hide' in s ? ['hide'] : []),
      ];
      return (
        Object.keys(s).sort().join() !== [...expectedFields].sort().join() ||
        !inside(s) ||
        !s.image.startsWith('https://') ||
        !['rest', 'walk', 'new', 'food'].includes(s.mood) ||
        typeof s.bookable !== 'boolean' ||
        (s.kakaoPlaceId !== null && typeof s.kakaoPlaceId !== 'string')
      );
    })
    .map((s) => s.id);
}
