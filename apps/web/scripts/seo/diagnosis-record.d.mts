export declare const SCHEMA: number;
export declare const DISQUALIFIED: string[];
export declare const VERDICTS: string[];
export declare const SEVERITIES: string[];
export declare const LAYERS: string[];
// Records are free-form JSON written by the agent; the validator is what types them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = any;
export declare function sortOrderOf<T extends Record<string, unknown>>(interventions: T[]): T[];
export declare function validateRecord(rec: Rec, opts?: { filename?: string; maxInterventions?: number }): { errors: string[]; warns: string[] };
export declare function renderRecord(rec: Rec): string;
