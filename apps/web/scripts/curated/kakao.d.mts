export interface KakaoPlace {
  id?: string;
  title: string;
  lat: number;
  lng: number;
  contenttypeid: number;
  mood: string;
}
export interface KakaoPick {
  status: 'matched' | 'unmatched' | 'closed';
  rule: 'exact' | 'contains' | 'none';
  kakaoPlaceId: string | null;
  placeUrl: string | null;
}
export declare const DAY_LIMIT: number;
export declare const PASS_RATE: number;
export declare function queryOf(title: string): string;
export declare function nameRule(ours: string, theirs: string, city: string): 'exact' | 'contains' | null;
export declare function pick(place: KakaoPlace, docs: Record<string, unknown>[], city: string): KakaoPick;
export declare function targets(dir: string, city: string): (KakaoPlace & { id: string })[];
