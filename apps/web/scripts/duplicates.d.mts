export declare const DUPLICATES: ReadonlyMap<string, { keep: string; why: string }>;
export declare function dropDuplicates<T extends { id: string }>(spots: readonly T[]): T[];
