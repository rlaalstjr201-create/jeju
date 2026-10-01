export declare function loadCategories(inputDir?: string): Map<string, string>;
export declare function loadNewSubCalls(path?: string): Map<string, 'sight' | 'do'>;
export declare function newSub(id: string, category: string | undefined, calls: Map<string, string>): 'sight' | 'do';
export declare function applyNewSub<T extends { id: string; mood: string }>(
  spots: T[],
  categories?: Map<string, string>,
  calls?: Map<string, string>,
): T[];
