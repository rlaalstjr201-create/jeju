export interface FamousItem {
  id: string;
  name: string;
  category?: string;
  tags?: string[] | null;
}
export declare function isFamous(
  spot: { id: string; name: string; mood: string; score: number; hide?: string },
  item: FamousItem | undefined,
): boolean;
export declare function loadPop(dir?: string): Map<string, number | null>;
export declare function popScores(counts: Map<string, number | null>, ids: string[]): Map<string, number>;
export declare function applyFamous<T extends { id: string; name: string; mood: string; score: number }>(
  spots: T[],
  inputs?: Map<string, FamousItem>,
  counts?: Map<string, number | null>,
): (T & { famous?: true; pop?: number })[];
