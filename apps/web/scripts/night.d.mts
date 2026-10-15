export interface NightCall {
  id: string;
  trail: boolean;
  basis: string;
}
export interface NightLoaded {
  calls: NightCall[];
  pass: boolean;
  round?: string | null;
}
export interface SourceItem {
  id: string;
  name: string;
  tags?: string[] | null;
  intro?: string | null;
  comment?: string | null;
  summary?: string | null;
}
export interface NightCandidate {
  id: string;
  name: string;
  mood: string;
  tags: string[];
  intro: string | null;
  comment: string | null;
  summary: string | null;
}
export interface BlindCall {
  id: string;
  trail: boolean;
  reason?: string;
}
export interface NightAgreement {
  n: number;
  agree: number;
  rate: number;
  threshold: number;
  trueToFalse: number;
  trueToFalseMax: number;
  pass: boolean;
}
export declare function candidates<T extends { id: string; name: string; mood: string }>(spots: T[], inputs: Map<string, SourceItem>): NightCandidate[];
export declare function drawSample(calls: { id: string; trail: boolean }[], seed?: number, per?: number): string[];
export declare function loadNightCalls(dir?: string): NightLoaded;
export declare function basisProblems(calls: NightCall[], inputs: Map<string, SourceItem>): string[];
export declare function roundProblems(calls: NightCall[], candidateIds: string[], inputs: Map<string, SourceItem>): string[];
export declare function scoreAudit(
  calls: { id: string; trail: boolean }[],
  ids: string[],
  judgments: BlindCall[],
): { agreement: NightAgreement; rows: { id: string; first: boolean; audit: boolean; agree: boolean; reason?: string }[] };
export declare function applyNight<T extends { id: string }>(spots: T[], loaded?: NightLoaded): (T & { trail?: true })[];
