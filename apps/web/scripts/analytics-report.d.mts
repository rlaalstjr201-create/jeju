export interface ReportRow {
  event: string;
  id: string;
  n7: number;
  n28: number;
}
export declare const seoulDay: (ms?: number) => string;
export declare function reportSql(today: string): string;
export declare function renderReport(rows: ReportRow[], names: Map<string, string>, today: string): string;
export declare function parseWranglerJson(stdout: string): ReportRow[];
