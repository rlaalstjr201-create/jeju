export interface KakaoPlace {
  id?: string;
  title: string;
  lat: number;
  lng: number;
  contenttypeid: number;
  mood: string;
}
export interface KakaoDoc {
  id: string;
  place_name?: string;
  place_url?: string;
  category_group_code?: string;
  x: string;
  y: string;
}
export interface KakaoRow {
  id: string;
  query: string;
  status: 'matched' | 'unmatched' | 'closed';
  rule: 'exact' | 'contains' | 'none';
  kakaoPlaceId: string | null;
  placeUrl: string | null;
}
export interface KakaoSummary {
  targets: number;
  done: number;
  status: { matched: number; unmatched: number; closed: number };
  rule: { exact: number; contains: number; none: number };
  matchedRate: number;
  pass: boolean | null;
}
export type Search = (query: string, at: { x: number; y: number; radius: number }) => Promise<{ status: number; body?: { documents: KakaoDoc[] } }>;
export declare const DAY_LIMIT: number;
export declare const PASS_RATE: number;
export declare const FOOD_TYPE: number;
export declare const RADIUS: { food: number; other: number };
export declare function queryOf(title: string): string;
export declare function normName(s: string): string;
export declare function nameRule(ours: string, theirs: string): 'exact' | 'contains' | null;
export declare function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number;
export declare function radiusOf(place: { contenttypeid: number }): number;
export declare function pick(place: KakaoPlace, docs: KakaoDoc[]): Omit<KakaoRow, 'id' | 'query'>;
export declare function targets(dir: string): (KakaoPlace & { id: string })[];
export declare function summarize(rows: KakaoRow[], total: number): KakaoSummary;
export declare function run(opts: {
  dir: string;
  search: Search;
  now?: () => Date;
  limit?: number;
  sleep?: (ms: number) => Promise<void>;
  pause?: number;
}): Promise<{ calls: number; stopped: 'done' | 'limit' | 'auth' | 'errors'; failed: number; summary: KakaoSummary & { criteria: string; calls: number; rows: KakaoRow[] } }>;
export declare function kakaoLocal(key: string): Search;
