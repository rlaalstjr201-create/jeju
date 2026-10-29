export interface PlanRow {
  id: string;
  name: string;
  keywords: { keyword: string; why: string }[];
}
export declare const BROAD: Record<string, ReadonlySet<string>>;
export declare function keyword1(place: { title: string; contenttypeid: number }, city: string): { k: string; why: string };
export declare function keywordsOf(place: { title: string; contenttypeid: number }, city: string, otherK1?: ReadonlySet<string>): { k: string; why: string }[];
export declare function targets(dir: string, city: string): { id: string; title: string; contenttypeid: number; mood: string }[];
export declare function plan(list: { id: string; title: string; contenttypeid: number }[], city: string): PlanRow[];
