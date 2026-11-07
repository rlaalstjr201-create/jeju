export interface FeedbackRow {
  day: string;
  went: string | null;
  pains: string | null;
  pain: string | null;
  wish: string | null;
  v: string;
}
export declare function reportSql(since: string): string;
export declare function countSql(since: string): string;
export declare function renderFeedback(rows: FeedbackRow[], since: string, today: string, capped?: number): string;
export declare function cappedSql(since: string): string;
export declare const KEEP_DAYS: number;
export declare function pruneSql(today: string): string;
export declare function userText(s: string): string;
