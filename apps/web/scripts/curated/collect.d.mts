export interface DestConfig {
  dest: string;
  sido: number;
  cities: Array<{ code: string; name: string }> | null;
}
export declare const DESTS: DestConfig[];
export declare const DAY_LIMIT: number;
export declare const MAX_CONSECUTIVE_FAILS: number;
export declare function usedOn(day: string, logs: Array<string | undefined>): number;
export declare function citiesOf(cfg: DestConfig, nationDir: string): Array<{ code: string; name: string; items: Array<{ id: string; modifiedtime: string; lDongSignguCd: string; [k: string]: unknown }> }>;
export interface CityProgress {
  inScope: number;
  detailed: number;
  remaining: number;
}
export declare function collect(opts: {
  outDir: string;
  nationDir: string;
  fetchJson: (op: string, params: Record<string, string | number>) => Promise<unknown>;
  otherLogs?: string[];
  now?: () => Date;
  limit?: number;
  dests?: DestConfig[];
}): Promise<{
  calls: number;
  stopped: 'done' | 'limit' | 'error';
  message?: string;
  errors: string[];
  summary: Record<string, { lDongRegnCd: number; inScope: number; detailed: number; remaining: number; cities: Record<string, CityProgress> }>;
}>;
