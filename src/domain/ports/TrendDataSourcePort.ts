export interface TrendSignal {
  readonly spotId: string;
  readonly popularitySignal: number;
  readonly trendSignal: number;
  readonly fetchedAt: string;
}

export interface TrendDataSourcePort {
  fetchSignalsForSpots(spotIds: string[]): Promise<TrendSignal[]>;
  readonly sourceName: string;
}
