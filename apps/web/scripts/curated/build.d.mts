import type { Spot } from '../../src/pick/pick';

export interface CuratedInputs {
  dest: string;
  cities: string[];
  items: { id: string; title: string; addr1: string; city: string; contenttypeid: number; lat: number; lng: number; image: string; lclsSystm3: string }[];
  verdicts: Map<string, { id: string; keep: boolean; mood: string; sub?: string; indoor: boolean; reason: string; basis: string[] }>;
  fixes: { id: string; field: string; before: string; after: string }[];
  overrides?: { id: string; name?: string; field: string; before: string; after: string; why?: string }[];
  kakao: { id: string; status: string; rule: string; kakaoPlaceId: string | null }[];
  pop: { id: string; volume: number | null }[];
}
export type CuratedSpot = Spot & { area: string };
export declare const OUT: (dest: string) => string;
export declare const BOXES: Record<string, { lat: [number, number]; lng: [number, number] }>;
export declare const BUSAN_KEEP: number;
export declare const BUSAN_FAMOUS: number;
export declare const CAFE_WORDS: RegExp;
export declare function famousCount(keep: number): number;
export declare function inBox(city: string, p: { lat: number; lng: number }): boolean;
export declare function displayName(title: string, city: string): string;
export declare function bracketTag(name: string): string;
export declare function adminTag(name: string): string;
export declare function shownName(title: string, city: string): string;
export declare function townOf(item: { addr1: string; city: string }): string;
export declare function loadInputs(dest?: string, cities?: string[], dir?: string): CuratedInputs;
export declare function dedupe<T extends { item: { id: string; title: string; addr1: string; city: string; lat: number; lng: number }; v: { mood: string } }>(
  kept: T[],
): { rest: T[]; merged: { name: string; kept: string; dropped: string }[]; renamed: Map<string, string> };
export declare function famousIds(candidates: string[], volumeById: Map<string, number | null>, n?: number): string[];
export declare function kakaoIds(rows: CuratedInputs['kakao'], shipped: Set<string>): Map<string, string | null>;
export declare function quintileScores(volumes: Map<string, number>): Map<string, number>;
export declare function reasonProblem(reason: string): string | null;
export declare function build(inputs?: CuratedInputs): {
  spots: CuratedSpot[];
  closed: string[];
  unknownPosition: string[];
  keepTotal: number;
  merged: { name: string; kept: string; dropped: string }[];
  renamed: [string, string][];
};
export declare function buildSpots(inputs?: CuratedInputs): CuratedSpot[];
