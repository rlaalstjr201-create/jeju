export interface FamousItem {
  id: string;
  name: string;
  category?: string;
  tags?: string[] | null;
}
export declare function isFamous(
  spot: { name: string; mood: string; score: number; hide?: string },
  item: FamousItem | undefined,
): boolean;
export declare function applyFamous<T extends { id: string; name: string; mood: string; score: number }>(spots: T[], inputs?: Map<string, FamousItem>): (T & { famous?: true })[];
