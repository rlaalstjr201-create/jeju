import type { TourItem } from '../busan/collect.mjs';
export interface NationScopeRecord {
  id: string;
  title: string | undefined;
  addr1: string;
  lDongRegnCd: string;
  lDongSignguCd: string;
  lat: number;
  lng: number;
  contenttypeid: number;
  lclsSystm1: string;
  lclsSystm2: string;
  lclsSystm3: string;
  cat1?: string;
  cat2?: string;
  cat3?: string;
  image: string;
  modifiedtime: string;
}
export declare const SIDOS: number[];
export declare const SKIPPED_SIDOS: number[];
export declare const LIST_TYPES: number[];
export declare const DAY_LIMIT: number;
export declare const NUM_OF_ROWS: number;
export declare function spotId(item: TourItem): string;
export declare function scopeRecord(item: TourItem & { lDongRegnCd?: string | number; lDongSignguCd?: string | number }, sido: number): NationScopeRecord;
export declare function usedOn(day: string, logs: { busanLog?: string; nationLog?: string }): number;
export declare function lclsNames(body: unknown): Record<string, string>;
export declare function collect(opts: {
  dir: string;
  fetchJson: (op: string, params: Record<string, string | number>) => Promise<unknown>;
  busanLog?: string;
  now?: () => Date;
  limit?: number;
  sidos?: number[];
  types?: number[];
  refresh?: boolean;
}): Promise<{ calls: number; stopped: 'done' | 'limit' | 'error'; message?: string; summary: Record<string, number> }>;
