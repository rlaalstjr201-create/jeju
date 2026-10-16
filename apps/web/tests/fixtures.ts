import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Button, Spot } from '../src/pick';

/** public/spots.json exactly as shipped — build-spots.mjs already applied every S1' rule. */
export const fileSpots = JSON.parse(readFileSync(resolve(__dirname, '../public/spots.json'), 'utf8')) as Spot[];
/** Kept for the app/tests that used to distinguish "card-safe" from "raw file" — now identical. */
export const realSpots = fileSpots;

/** plan S2 대표 좌표 */
export const ORIGINS = {
  제주시: { lat: 33.4996, lng: 126.5312 },
  서귀포: { lat: 33.2541, lng: 126.56 },
  '동쪽(성산)': { lat: 33.458, lng: 126.931 },
  '서쪽(한림)': { lat: 33.4125, lng: 126.265 },
} as const;
export const BUTTONS: Button[] = ['rest', 'walk', 'new', 'famous', 'food', 'any'];
export const SUBS = ['meal', 'cafe'] as const;
