/**
 * Pure functions for popularity score computation.
 * OQ-CUR-1: z-score normalization, weights 1:1:1 (config-driven).
 */

export function computeZScore(values: number[]): number[] {
  if (values.length === 0) return [];
  if (values.length === 1) return [0];

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return values.map(() => 0);

  return values.map((v) => (v - mean) / stdDev);
}

export function computePopularityScore(
  signals: { cardSales: number; navi: number; mobility: number },
  weights: { w1: number; w2: number; w3: number },
): number {
  const zScores = computeZScore([signals.cardSales, signals.navi, signals.mobility]);
  const z1 = zScores[0] ?? 0;
  const z2 = zScores[1] ?? 0;
  const z3 = zScores[2] ?? 0;

  const raw = z1 * weights.w1 + z2 * weights.w2 + z3 * weights.w3;
  // Normalize to 0-100 range (clip)
  const normalized = ((raw + 3) / 6) * 100;
  return Math.min(100, Math.max(0, Math.round(normalized)));
}
