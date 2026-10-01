export interface Link { to: string; text: string }
export interface JsonLdBlock { ok: boolean; types: string[]; error?: string }
export interface Page {
  fragment: boolean; lang: string; title: string; description: string;
  canonicalRaw: string | null; canonical: string | null; noindex: boolean;
  og: Record<string, string>; verification: string[]; jsonld: JsonLdBlock[];
  links: Link[]; h1s: string[]; textChars: number; hasNoscript: boolean; uncrawlable: string[];
}
export type SitePage = Page & { url: string; file?: string };
export declare function normUrl(u: unknown, origin?: string): string | null;
export declare function fileToUrl(rel: string): string;
export declare const strip: (s: unknown) => string;
export declare function visibleText(html: string): string;
export declare function parseJsonLd(html: string): JsonLdBlock[];
export declare function parsePage(html: string, origin?: string): Page;
export declare const GENERIC_ANCHOR: RegExp;
export declare const FINGERPRINT_FIELDS: Record<string, string>;
export declare function fingerprintOf(page: Page): Record<string, string | number | boolean | null>;
export declare function buildGraph(pages: Map<string, { url: string; links: { to: string }[] }>, root?: string): {
  inbound: Map<string, number>; depth: Map<string, number>; adj: Map<string, string[]>;
};
