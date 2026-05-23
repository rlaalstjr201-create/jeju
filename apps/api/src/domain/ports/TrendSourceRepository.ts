export interface TrendSourceRepository {
  getStatus(sourceName: string): Promise<{ consecutiveFailures: number } | null>;
  updateStatus(
    sourceName: string,
    status: 'success' | 'failure',
    consecutiveFailures: number,
  ): Promise<void>;
}
