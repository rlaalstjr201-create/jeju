import type { Candidate } from './keyword-gate.mjs';
export interface GscRow { query: string; clicks: number; impressions: number; ctr: number | null; position: number }
export interface TrackLine {
  week: string; google_pos?: number; impressions?: number; clicks?: number; gsc?: 'absent' | 'check_failed';
  naver?: 'found' | 'not_found' | 'check_failed'; naver_pos?: number; naver_block?: string;
}
export interface NaverResult { query: string; status?: string; found?: boolean; block?: string; position_in_block?: number }
export declare function validateGscExport(doc: unknown): { errors: string[]; rows: GscRow[] };
export declare function normQuery(q: string): string;
export declare function trackLinesOf(candidates: Candidate[], week: string, gscRows: GscRow[] | null, naver: { results: NaverResult[] } | null): { query: string; line: TrackLine }[];
export declare function appendTrack<C extends Candidate>(c: C, line: TrackLine): C;
export declare function dropsOf(candidates: Candidate[], today: string): {
  flagged: { query: string; engine: 'google' | 'naver'; from: number; to: number; why: string }[];
  suppressed: { query: string; why: string }[];
};
export declare function parseSitemap(xml: string): { urls: { loc: string; lastmod: string | null }[]; sitemaps: string[] };
export declare function indexnowDiff(state: { urls?: Record<string, string | null> } | null, current: { loc: string; lastmod?: string | null }[]): { added: string[]; changed: string[]; removed: string[] };
