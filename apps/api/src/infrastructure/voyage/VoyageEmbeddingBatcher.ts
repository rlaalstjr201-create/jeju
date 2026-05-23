import type { EmbeddingBatcherPort, EmbeddingBatchResult } from '../../application/ports/EmbeddingBatcherPort.js';
import type { SpotMetaInfererPort } from '../../application/ports/SpotMetaInfererPort.js';

export interface SpotForEmbedding {
  readonly id: string;
  readonly name: string;
  readonly introduction: string;
  readonly tags: string;
}

export interface EmbeddingStoragePort {
  findForEmbedding(spotIds?: string[]): Promise<SpotForEmbedding[]>;
  saveEmbedding(spotId: string, embedding: number[]): Promise<void>;
}

export class VoyageApiError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'VoyageApiError';
  }
}

const VOYAGE_ENDPOINT = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3-large';

function buildEmbeddingText(spot: SpotForEmbedding, meta: { atmosphere: string; crowd_level: string; best_time: string; target_visitor: string }): string {
  return [
    spot.introduction,
    meta.atmosphere,
    meta.crowd_level,
    meta.best_time,
    meta.target_visitor,
  ]
    .filter(Boolean)
    .join(' | ');
}

async function callVoyage(apiKey: string, inputs: string[]): Promise<number[][]> {
  let res: Response;
  try {
    res = await fetch(VOYAGE_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: VOYAGE_MODEL, input: inputs }),
    });
  } catch (err) {
    throw new VoyageApiError('Voyage AI network error', err);
  }

  if (!res.ok) {
    throw new VoyageApiError(`Voyage AI returned ${res.status}`);
  }

  const data = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export class VoyageEmbeddingBatcher implements EmbeddingBatcherPort {
  constructor(
    private readonly apiKey: string,
    private readonly metaInferer: SpotMetaInfererPort,
    private readonly storage: EmbeddingStoragePort,
  ) {}

  async run(spotIds?: string[]): Promise<EmbeddingBatchResult> {
    const spots = await this.storage.findForEmbedding(spotIds);

    if (spots.length === 0) {
      return { processed: 0, failed: 0, failedIds: [] };
    }

    const failedIds: string[] = [];
    let processed = 0;

    // Process one-by-one to isolate failures and allow partial success
    for (const spot of spots) {
      try {
        await this.embedAndStore(spot);
        processed++;
      } catch {
        failedIds.push(spot.id);
      }
    }

    return { processed, failed: failedIds.length, failedIds };
  }

  async runSingle(spotId: string): Promise<void> {
    const spots = await this.storage.findForEmbedding([spotId]);
    if (spots.length === 0) {
      throw new VoyageApiError(`Spot not found for embedding: ${spotId}`);
    }
    await this.embedAndStore(spots[0]!);
  }

  private async embedAndStore(spot: SpotForEmbedding): Promise<void> {
    // May throw — caller handles failure tracking
    const meta = await this.metaInferer.infer({
      name: spot.name,
      introduction: spot.introduction,
      tags: spot.tags,
    });

    const text = buildEmbeddingText(spot, meta);
    const [embedding] = await callVoyage(this.apiKey, [text]);
    if (!embedding) {
      throw new VoyageApiError(`No embedding returned for spot ${spot.id}`);
    }

    await this.storage.saveEmbedding(spot.id, embedding);
  }
}
