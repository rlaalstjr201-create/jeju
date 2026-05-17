export interface TrendSourceRepository {
  updateStatus(
    sourceName: string,
    status: 'success' | 'failure',
    consecutiveFailures: number,
  ): Promise<void>;
}
