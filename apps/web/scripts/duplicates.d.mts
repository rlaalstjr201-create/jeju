export declare const DUPLICATES: ReadonlyMap<string, { keep: string; why: string }>;
export declare function dropDuplicates<T extends { id: string }>(spots: readonly T[]): T[];
export declare const TYPO_RADIUS_M: number;
type Placed = { id: string; name: string; lat: number; lng: number };
export declare function typoTwins<T extends Placed>(spots: readonly T[]): [T, T][];
export declare function unresolvedTwins<T extends Placed>(spots: readonly T[]): [T, T][];
