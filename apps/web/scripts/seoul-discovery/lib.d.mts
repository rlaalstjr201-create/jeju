export interface Post { title: string; desc?: string; day: string; link: string }
export interface Cand { name: string; kind: string; word?: string; first: Post[]; firstSeen?: string; [k: string]: unknown }
export interface Ledger { names: Record<string, { status: string; day: string; cid?: string; why?: string }>; kakao: Record<string, { status: string; day: string; name: string }>; posts: Record<string, string[]>; audits: unknown[]; lastAudit: string | null }
export declare const kstDay: (now?: Date) => string;
export declare const addDays: (day: string, n: number) => string;
export declare const DAILY_MAX: number;
export declare const QUEUE_DAYS: number;
export declare const NEW_DAYS: number;
export declare const AUDIT_KEEP: number;
export declare const GATE: number;
export declare const KINDS: string[];
export declare const WORDS: string[];
export declare const stayOf: (word: string) => 'G8' | 'G4' | 'G10' | null;
export declare const norm: (s: unknown) => string;
export declare function brandOf(name: string): string;
export declare const MASS: string[];
export declare const isMass: (name: string) => boolean;
export declare const ADULT: RegExp;
export declare const LANES: string[];
export declare function laneOf(c: { kind: string; word?: string; name: string }): string;
export declare function pickDay(cands: Cand[], queue: Cand[], ledger: Ledger, day: string, max?: number): { pick: Cand[]; rest: Cand[]; skipped: Record<string, number> };
export declare function badKeep(j: Record<string, string>, row: { kakao?: { address: string } | null } | undefined, day: string): string;
export declare function sameBrandOnce(keeps: { cid: string; name: string; kind: string; total?: number }[], shipped: { name: string }[]): Record<string, string>;
export declare function closedSignal(item: { name: string; kakao: string }, kakaoIds: string[] | null, titles: string[]): string;
export declare function stillLoved(item: { name: string }, posts: { day: string; title: string }[], day: string): boolean;
export declare function sweepOf(item: { kind: string; start: string; end: string; stay?: string }, day: string): string;
export declare const BLOCKED: RegExp;
export declare function okPage(u: string): boolean;
export declare function ogOf(html: string, page: string): { image: string; site: string };
export declare function imageSize(buf: Uint8Array): { type: string; w: number; h: number } | null;
export declare const MAX_IMAGE: number;
export declare function badImage(url: string, size: { w: number; h: number } | null, bytes: number): string;
export declare function coreWord(name: string): string;
export declare function sampleOf(ids: string[], n: number, seed: number): string[];
export declare function gateOf(keepIds: string[], dropIds: string[], audit: Record<string, string>): { keep: { n: number; agree: number; rate: number | null }; drop: { n: number; agree: number; rate: number | null }; pass: boolean };
export declare function whereOf(p: { lat: number; lng: number }, hoods: { name: string; lat: number; lng: number }[], address: string): { hood?: string; where: string };
export interface Area { gus: string[]; dongs: string[]; hoods: string[] }
export declare const CRITERIA: string;
export declare const LOGO_SQUARE: number;
export declare function areaOf(placeText: string, posts: { title: string; desc?: string; day?: string; link?: string }[], hoods: { name: string; lat: number; lng: number }[]): Area;
export declare function areaMatch(doc: { address: string; jibun?: string; lat: number; lng: number }, area: Area, hoods: { name: string; lat: number; lng: number }[]): boolean;
export declare function placeOf<T extends { address: string; jibun?: string; lat: number; lng: number }>(docs: T[], area: Area, hoods: { name: string; lat: number; lng: number }[]): T | null;
