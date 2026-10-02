import type { SitePage } from './crawl-parse.mjs';
export interface Finding { id: string; severity: 'P0' | 'P1' | 'P2'; layer: string; url?: string; msg: string; fix: string }
export interface Robots { groups: { agents: string[]; allow: string[]; disallow: string[] }[]; sitemaps: string[] }
export declare const UTILITY: string[];
export declare const CRAWLERS: { search: string[]; ai: string[] };
export declare function parseRobots(txt: string | null): Robots;
export declare function blocksRoot(robots: Robots, bot: string): boolean;
export declare function auditSite(input: {
  pages: Map<string, SitePage>; files: Record<string, string | null>; origin: string; spotCount?: number;
}): Finding[];
