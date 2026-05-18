export interface EmbeddingBatchResult {
  readonly processed: number;
  readonly failed: number;
  readonly failedIds: string[];
}

export interface EmbeddingBatcherPort {
  run(spotIds?: string[]): Promise<EmbeddingBatchResult>;
  runSingle(spotId: string): Promise<void>;
}
