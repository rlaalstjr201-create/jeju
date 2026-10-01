export type Verdict = 'target' | 'watch' | 'kill' | 'brand' | 'invalid';
export interface Candidate {
  query: string; brand?: boolean; head?: boolean; verdict?: string; rationale?: string; landing?: string;
  scores?: Partial<Record<'demand' | 'competition' | 'intent_fit' | 'uniqueness' | 'inventory', number>>;
  kills?: string[]; serp?: { checked_at?: string; source?: string; observed?: boolean | string; naver_observed?: boolean };
  indexed_at?: string; track?: { week: string; google_pos?: number; naver_pos?: number; impressions?: number; clicks?: number }[];
}
export declare const RUBRIC_VERSION: number;
export declare const AXES: string[];
export declare const KILLS: Record<string, string>;
export declare function judge(c: Candidate): { total: number | null; verdict: Verdict; why: string };
export declare function validateKeywords(doc: { rubric_version?: number; candidates?: Candidate[] } | null): { errors: string[]; warns: string[] };
export declare function pivotOf(e: Candidate, today: string): { action: 'wait' | 'push' | 'meta' | 'hold' | 'pivot' | 'kill'; why: string };
