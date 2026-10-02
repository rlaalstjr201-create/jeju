export interface Row { id: string; skipped?: string; actual?: number; p10?: number; p50?: number; p90?: number; hit?: boolean; skill_no_change?: number | null; skill_trend?: number | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Forecast = any;
export declare function skill(actual: number, model: number, nul: number): number;
export declare function adherenceOf(planned?: Record<string, number>, did?: Record<string, number>): number;
export declare function scoreRows(forecast: Forecast, actualOf: (id: string) => number | null | undefined): Row[];
export declare function verdictOf(a: { forecast: Forecast; rows: Row[]; adherence: number; currentModelHash?: string | null }): { verdict: string; why: string };
export declare function calibration(rows: Row[]): null | { n: number; hits: number; rate: number; interval_verdict: string; beat_null: number; skill_n: number; skill_median: number | null; adds_information: boolean | null; underpowered: boolean };
