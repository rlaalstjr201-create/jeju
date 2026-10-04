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
export declare function loadInputs(dir?: string): Map<string, SourceItem>;
export declare function candidates<T extends { id: string; name: string; mood: string; lat: number; lng: number }>(
  spots: T[],
  inputs: Map<string, SourceItem>,
  coast: Coast,
): { id: string; why: string[]; az: number[] }[];
export declare function sampleIds(ids: string[], seed?: number, frac?: number): string[];
export declare function loadSunsetCalls(dir?: string): SunsetLoaded;
export declare function basisProblems(calls: SunsetCall[], inputs: Map<string, SourceItem>): string[];
export type SunsetPlace = { view: number[]; sea?: number[] };
export declare function placeWith(coast: Coast): (spot: { mood: string; name: string; lat: number; lng: number }) => SunsetPlace;
export declare function applySunset<T extends { id: string }>(
  spots: T[],
  loaded?: SunsetLoaded,
  viewOf?: (spot: T) => number[] | SunsetPlace,
): (T & { sunsetView?: number[]; sunsetSea?: number[] })[];
