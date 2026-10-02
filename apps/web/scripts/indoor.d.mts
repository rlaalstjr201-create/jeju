export declare function loadIndoorCalls(path?: string): Map<string, boolean>;
export declare function indoorOf(id: string, category: string | undefined, calls: Map<string, boolean>): boolean;
export declare function applyIndoor<T extends { id: string }>(
  spots: T[],
  categories?: Map<string, string>,
  calls?: Map<string, boolean>,
): (T & { indoor: boolean })[];
