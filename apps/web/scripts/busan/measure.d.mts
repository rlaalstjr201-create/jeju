export interface MeasurePlace {
  id?: string;
  title: string;
  contenttypeid: number;
  mood?: string;
}
export interface Keyword {
  k: string;
  why: string;
}
export interface PlanRow {
  id: string;
  name: string;
  keywords: { keyword: string; why: string }[];
}
export declare const CRITERIA: string;
export declare const BATCH: number;
export declare const GAP_MS: number;
export declare const RETRIES: number;
export declare const RETRY_WAIT_MS: number[];
export declare const FOOD_TYPE: number;
export declare const SUFFIX: string[];
export declare const BROAD: ReadonlySet<string>;
export declare function squash(s: string): string;
export declare function mainOf(name: string): string;
export declare function keyword1(place: MeasurePlace): Keyword;
export declare function keywordsOf(place: MeasurePlace, otherK1?: ReadonlySet<string>): Keyword[];
export declare function targets(dir?: string): (MeasurePlace & { id: string; mood: string })[];
export declare function plan(list?: (MeasurePlace & { id: string })[]): PlanRow[];
export declare function placeVolume(keywords: { volume?: number | null }[]): number | null;
export declare function callWithRetry(
  batch: string[],
  keys: { customer: string; api: string; secret: string },
  tool?: (batch: string[], keys: { customer: string; api: string; secret: string }) => Promise<{ status: number | 'network'; rows: unknown[] | null }>,
  sleep?: (ms: number) => Promise<void>,
): Promise<{ status: number | 'network'; rows: unknown[] | null; tries: number }>;
