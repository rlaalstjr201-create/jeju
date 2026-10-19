import type { Spot } from '../../src/pick';

export interface BuildInputs {
  items: { id: string; title: string; contenttypeid: number; lat: number; lng: number; image: string; lclsSystm3: string }[];
  verdicts: Map<string, { id: string; keep: boolean; mood: string; sub?: string; indoor: boolean; reason: string; basis: string[] }>;
  fixes: { id: string; field: string; before: string; after: string }[];
  kakao: { id: string; status: string; rule: string; kakaoPlaceId: string | null }[];
  pop: { id: string; volume: number | null }[];
  booking: Record<string, { name: string; routes: { kind: string; url: string; evidence: string; verdict: string }[]; best: string | null; call?: string; reason?: string }>;
}
export declare const OUT: string;
export declare const FAMOUS_N: number;
export declare const FAMOUS_TYPE: number;
export declare const CAFE_WORDS: RegExp;
export declare const LEPORTS_TYPE: number;
export declare const OWNER_FAMOUS: string[];
export declare const BOOK_KINDS: string[];
export declare function bookingOf(id: string, r: BuildInputs['booking'][string] | undefined): { fields?: Record<string, unknown>; problem?: string };
export declare function inBusanBox(p: { lat: number; lng: number }): boolean;
export declare function loadInputs(dir?: string): BuildInputs;
export declare function quintileScores(volumes: Map<string, number>): Map<string, number>;
export declare function famousCandidate(item: { contenttypeid: number }, spot: { mood: string; name: string }): boolean;
export declare function famousIds(candidates: string[], volumeById: Map<string, number | null>, n?: number): string[];
export declare function kakaoIds(rows: BuildInputs['kakao'], shipped: Set<string>): Map<string, string | null>;
export declare function reasonProblem(reason: string): string | null;
export declare function build(inputs?: BuildInputs): { spots: Spot[]; unknownPosition: string[] };
export declare function buildSpots(inputs?: BuildInputs): Spot[];
