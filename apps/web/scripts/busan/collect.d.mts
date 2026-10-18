export interface TourItem {
  contentid: string | number;
  contenttypeid: string | number;
  title?: string;
  addr1?: string;
  mapx?: string;
  mapy?: string;
  firstimage?: string;
  firstimage2?: string;
  cpyrhtDivCd?: string;
  cat1?: string;
  cat2?: string;
  cat3?: string;
  lclsSystm1?: string;
  lclsSystm2?: string;
  lclsSystm3?: string;
  modifiedtime?: string;
}
export interface ScopeRecord {
  id: string;
  contentid: string;
  contenttypeid: number;
  title: string | undefined;
  addr1: string;
  lat: number;
  lng: number;
  image: string;
  cpyrhtDivCd: string;
  cat1: string;
  cat2: string;
  cat3: string;
  lclsSystm1: string;
  lclsSystm2: string;
  lclsSystm3: string;
  modifiedtime: string;
  detail: boolean;
}
export interface CollectSummary {
  source: string;
  counts: Record<string, { listed: number; totalCount: number; inScope: number; detailed: number }>;
  places: number;
  detailed: number;
}
export declare const LIST_TYPES: number[];
export declare const DAY_LIMIT: number;
export declare const NUM_OF_ROWS: number;
export declare const MARKET_LCLS: Set<string>;
export declare function inScope(item: TourItem): boolean;
export declare function spotId(item: TourItem): string;
export declare function toHttps(url: string | undefined | null): string;
export declare function imageOf(item: TourItem): string;
export declare function kstDay(now?: Date): string;
export declare function callsOn(logText: string, day: string): number;
export declare function pageCount(totalCount: number | string, rows?: number): number;
export declare function needsDetail(item: TourItem, saved: { modifiedtime?: string } | null): boolean;
export declare function itemsOf(body: unknown): TourItem[];
export declare function scopeRecord(item: TourItem, detailed: boolean): ScopeRecord;
export declare function collect(opts: {
  dir: string;
  fetchJson: (op: string, params: Record<string, string | number>) => Promise<unknown>;
  now?: () => Date;
  limit?: number;
  types?: number[];
  refresh?: boolean;
}): Promise<{ calls: number; stopped: 'done' | 'limit' | 'error'; message?: string; summary: CollectSummary }>;
export declare function tourApi(key: string): (op: string, params: Record<string, string | number>) => Promise<unknown>;
