export type SeasonEntry = { kind: string; months: number[] } | { kind: string; from: string; to: string };
export interface SeasonCall {
  id: string;
  kind: string;
  months: number[] | null;
  cultivation?: string | null;
}
export interface Station {
  stn: number;
  name: string;
  lat: number;
  lon: number;
  species: string[];
}
export interface Blooms {
  year: number;
  status?: Record<string, string>;
  records?: { species: string; station: number; firstBloom: string; source?: string; fetched?: string }[];
}
export interface SeasonObs {
  stations: Station[];
  blooms: Blooms | null;
  year: number;
}
export declare const SEASON_KINDS: string[];
export declare function loadSeasonCalls(dir?: string): { calls: SeasonCall[]; pass: Set<string> };
export declare function loadBlooms(year: number, dir?: string): Blooms | null;
export declare function loadStations(dir?: string): Station[];
export declare function observedWindow(
  spot: { lat: number; lng: number },
  species: string,
  stations: Station[],
  blooms: Blooms | null,
  year: number,
): { from: string; to: string } | null;
export declare function applySeason<T extends { id: string }>(
  spots: T[],
  loaded?: { calls: SeasonCall[]; pass: Set<string> },
  obs?: SeasonObs,
): (T & { season?: SeasonEntry[] })[];
