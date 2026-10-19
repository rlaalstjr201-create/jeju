export declare function popQuery(name: string): string;
export declare function popQuery02(name: string): string;
export declare const ALIAS03: Record<string, [string, string]>;
export declare function keyword03(name: string): string;
export declare function volume03(row: { monthlyPcQcCnt?: unknown; monthlyMobileQcCnt?: unknown } | undefined): number | null;
export declare function keywords04(name: string): { k: string; why: string }[];
export declare function keywordstool(
  keywords: string[],
  keys: { customer: string; api: string; secret: string },
): Promise<{ status: number | 'network'; rows: { relKeyword: string; monthlyPcQcCnt?: unknown; monthlyMobileQcCnt?: unknown }[] | null }>;
export declare function env(key: string): string;
