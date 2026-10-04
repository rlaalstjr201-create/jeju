export interface SunsetCall {
  id: string;
  sunset: boolean;
  basis: string;
}
export interface SunsetLoaded {
  calls: SunsetCall[];
  pass: boolean;
  round?: string | null;
}
export interface SourceItem {
  id: string;
  name: string;
  tags?: string[] | null;
  intro?: string | null;
  comment?: string | null;
  summary?: string | null;
}
export type Coast = { ring: number[][]; box: number[] }[];
export declare const BASIS_MAX: number;
export declare function loadCoast(path?: string): Coast;
export declare function loadInputs(dir?: string): Map<string, SourceItem>;
export declare function sourceText(item: Partial<SourceItem>): string;
export declare function isOreum(spot: { mood: string; name: string }): boolean;
export declare function candidates<T extends { id: string; name: string; mood: string; lat: number; lng: number }>(
  spots: T[],
  inputs: Map<string, SourceItem>,
  coast: Coast,
): { id: string; why: string[]; az: number[] }[];
export declare function sampleIds(ids: string[], seed?: number, frac?: number): string[];
export declare function loadSunsetCalls(dir?: string): SunsetLoaded;
export declare function basisProblems(calls: SunsetCall[], inputs: Map<string, SourceItem>): string[];
export declare function viewWith(coast: Coast): (spot: { mood: string; name: string; lat: number; lng: number }) => number[];
export declare function applySunset<T extends { id: string }>(
  spots: T[],
  loaded?: SunsetLoaded,
  viewOf?: (spot: T) => number[],
): (T & { sunsetView?: number[] })[];
