import type { NightCall, SourceItem } from '../night.mjs';

export declare const NIGHT_DIR: string;
export declare const BUSAN_TRAIL_WORDS: RegExp;
export declare const SAMPLE_SEED: number;
export declare const SAMPLE_SEEDS: Record<string, number>;
export declare function criteriaOf(round: string): string;
export declare const PER_MAX: number;
export declare function sampleSide(calls: Pick<NightCall, 'trail'>[]): number;
export declare function passRule(k: number): { min: number; trueToFalseMax: number };
export declare function nightInputs(spots: { id: string; name: string }[], dir?: string): Map<string, SourceItem>;
