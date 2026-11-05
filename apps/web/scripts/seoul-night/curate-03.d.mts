export interface Evidence {
  total?: number;
  posts?: { date: string; title: string }[];
  failed?: boolean;
}
export declare function brandOf(name: string): string;
export declare function kw(name: string): string;
export declare function okCategory(category: string): boolean;
export declare const ADULT: RegExp;
export declare const MASS: string[];
export declare function branded(category: string): boolean;
export declare function isMass(name: string, category?: string): boolean;
export declare const LP_JAZZ: RegExp;
export declare function r6Out(p: { id: string; name: string; category: string }, fun: Set<string>): boolean;
export declare const CUT: { volume: number; volumeNullBlog: number; blog: number; since: string; max: number; per: number };
export declare const SEED: number;
export declare const PER: number;
export declare const LABELS: string[];
export declare function passes(volume: number | null, ev: Evidence | undefined): boolean;
export declare const KINDS: string[];
export declare function kindOf(category: string, name: string, words: string[]): string;
export declare function oneEach(keeps: { id: string; name: string; total?: number }[]): { keep: Set<string>; out: { id: string; name: string; why: string }[] };
export declare const OWNER_DROP: Record<string, string>;
