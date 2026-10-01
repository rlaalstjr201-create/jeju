export interface MarketRule {
  days: number[];
  label: string;
  noFirstAfter31?: true;
}
export declare function loadMarketVerdicts(path?: string): { id: string; keep: boolean; mood: string; reason: string; basis: string }[];
export declare function loadMarketDays(path?: string): Map<string, MarketRule>;
export declare function applyMarketDays<T extends { id: string }>(
  spots: T[],
  rules?: Map<string, MarketRule>,
  categories?: Map<string, string>,
): (T & { market?: MarketRule })[];
export declare function marketSpots(inputPath?: string): Record<string, unknown>[];
