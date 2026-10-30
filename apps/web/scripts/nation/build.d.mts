import type { NationScopeRecord } from './collect.mjs';

export interface NationRule {
  id: string;
  keep: boolean;
  mood?: string;
  sub?: string;
  indoor?: boolean;
}
export interface NationShipRecord {
  id: string;
  name: string;
  lat: number;
  lng: number;
  sgg: string;
  cat: [string, string, string];
  image: string;
  moods: string[];
  sub?: 'meal' | 'cafe' | 'sight';
  indoor?: true;
}
export interface NationIndex {
  v: 1;
  rules: { moods: string[]; indoor: boolean };
  sido: { c: string; n: string; s: string }[];
  sgg: { c: string; n: string; s: string; lat: number; lng: number; f: string; p: number[] }[];
  files: Record<string, string>;
}
export interface NationBuild {
  files: Record<string, NationShipRecord[]>;
  sgg: NationIndex['sgg'];
  sido: NationIndex['sido'];
  rules: NationIndex['rules'];
  ambiguous: { c: string; names: [string, number][] }[];
  dropped: number;
}
export declare const IN_DIR: string;
export declare const OUT_DIR: string;
export declare const SIDO_LIST: string[][];
export declare const GZIP_LIMIT: number;
export declare function cleanName(s: unknown): string;
export declare function median(xs: number[]): number;
export declare const ANCHORS: number;
export declare function anchors(pts: { lat: number; lng: number }[], k?: number): { lat: number; lng: number }[];
export declare function anchorDeltas(pts: { lat: number; lng: number }[], centre: { lat: number; lng: number }): number[];
export declare function sggNameOf(addr1: string, sidoCode: string): string;
export declare function shipRecord(r: NationScopeRecord, rule: NationRule | undefined): NationShipRecord | null;
export declare function build(input: { scopes: Record<string, NationScopeRecord[]>; results: NationRule[]; rules?: NationIndex['rules'] }): NationBuild;
export declare function serialize(v: unknown): string;
export declare function hash10(text: string): string;
export declare function render(b: NationBuild): { texts: Record<string, string>; index: NationIndex };
export declare function loadInputs(dir?: string): { scopes: Record<string, NationScopeRecord[]>; results: NationRule[] };
