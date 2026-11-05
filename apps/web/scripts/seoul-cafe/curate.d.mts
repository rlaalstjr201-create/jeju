export interface Evidence {
  total?: number;
  posts?: { date: string; title: string }[];
  failed?: boolean;
}
export declare const THEME: RegExp;
export declare const MASS: string[];
export declare function isMass(name: string): boolean;
export declare function kw(name: string): string;
export declare const CUT: { volume: number; volumeNullBlog: number; blog: number; since: string; max: number; per: number };
export declare const SEED: number;
export declare const PER: number;
export declare const LABELS: string[];
export declare function passes(volume: number | null, ev: Evidence | undefined): boolean;
export declare function mulberry32(a: number): () => number;
export declare function drawSample(verdicts: { id: string; label: string }[], seed?: number, per?: number): string[];
export declare function kindOf(category: string, name: string, words: string[]): string;
