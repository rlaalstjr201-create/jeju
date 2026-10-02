export interface Correction {
  id: string;
  action: 'remove' | 'set';
  fields: Partial<Record<'name' | 'score' | 'kakaoPlaceId', string | number | null>>;
  reason: string;
  evidence: string;
}
export declare function loadCorrections(copyDir?: string): Correction[];
export declare function applyCorrections<T extends { id: string }>(spots: T[], corrections: Correction[]): T[];
