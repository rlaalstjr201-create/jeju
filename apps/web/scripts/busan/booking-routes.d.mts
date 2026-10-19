export interface Route {
  kind: string;
  url: string;
  evidence: string;
  verdict: string;
}
export interface NaverPlace {
  name: string;
  lat: number;
  lng: number;
  address?: string;
  phone?: string | null;
  booking?: string | null;
  homepage?: string | null;
  closed?: boolean;
}
export interface FetchResult {
  status?: number;
  url?: string;
  html?: string;
  error?: string;
}
export declare const ROUTES: string;
export declare const SEARCH_CAP: number;
export declare const RADIUS_M: number;
export declare const KINDS: string[];
export declare function queryOf(name: string): string;
export declare function nameForms(name: string): string[];
export declare function namesMatch(a: string, b: string): boolean;
export declare function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number;
export declare function phoneOf(text: unknown): string | null;
export declare function urlsIn(text: unknown): string[];
export declare function snsOrPortal(url: string): string | null;
export declare function textHasName(text: string, names: string[]): boolean;
export declare function homepageVerdict(url: string, res: FetchResult, names: string[]): { verdict: string; note: string };
export declare function addressWords(addr: string): string[];
export declare function naverBookingVerdict(res: FetchResult, names: string[], addr: string): { verdict: string; note: string };
export declare function naverPlaces(html: string): NaverPlace[] | null;
export declare function matchNaver(places: NaverPlace[] | null, spot: { name: string; lat: number; lng: number }): (NaverPlace & { distance: number }) | null;
export declare function decide(routes: Route[], naver: Partial<NaverPlace> | null, naverFailed: boolean): { best: string | null; call?: 'closed' | 'noroute'; reason?: string };
