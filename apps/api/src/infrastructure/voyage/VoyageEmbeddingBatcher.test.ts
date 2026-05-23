import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { VoyageEmbeddingBatcher, VoyageApiError } from './VoyageEmbeddingBatcher.js';
import type { SpotForEmbedding, EmbeddingStoragePort } from './VoyageEmbeddingBatcher.js';
import type { SpotMetaInference } from '../../application/ports/SpotMetaInfererPort.js';

// ---------------------------------------------------------------------------
// MSW server
// ---------------------------------------------------------------------------

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMBEDDING_VECTOR = Array.from({ length: 1024 }, (_, i) => i * 0.001);

function makeVoyageResponse(count: number) {
  return {
    object: 'list',
    data: Array.from({ length: count }, (_, i) => ({
      object: 'embedding',
      embedding: EMBEDDING_VECTOR,
      index: i,
    })),
    model: 'voyage-3-large',
    usage: { total_tokens: count * 100 },
  };
}

function makeSpot(id: string, overrides: Partial<SpotForEmbedding> = {}): SpotForEmbedding {
  return {
    id,
    name: `장소 ${id}`,
    introduction: '아름다운 제주의 숨은 명소입니다.',
    tags: '자연,오름,힐링',
    ...overrides,
  };
}

function makeMeta(): SpotMetaInference {
  return {
    atmosphere: '조용하고 자연적인',
    crowd_level: '주말 혼잡',
    best_time: '평일 오전',
    target_visitor: '자연 애호가',
  };
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeStorage(spots: SpotForEmbedding[]): EmbeddingStoragePort {
  return {
    findForEmbedding: vi.fn().mockResolvedValue(spots),
    saveEmbedding: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMetaInferer(meta: SpotMetaInference = makeMeta()) {
  return { infer: vi.fn().mockResolvedValue(meta) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VoyageEmbeddingBatcher.run', () => {
  it('processes all spots and saves embeddings', async () => {
    const spots = [makeSpot('s1'), makeSpot('s2')];
    const storage = makeStorage(spots);
    const metaInferer = makeMetaInferer();

    server.use(http.post(VOYAGE_URL, () => HttpResponse.json(makeVoyageResponse(2))));

    const batcher = new VoyageEmbeddingBatcher('test-voyage-key', metaInferer as never, storage);
    const result = await batcher.run();

    expect(result.processed).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.failedIds).toHaveLength(0);
    expect(storage.saveEmbedding).toHaveBeenCalledTimes(2);
    expect(storage.saveEmbedding).toHaveBeenCalledWith('s1', EMBEDDING_VECTOR);
    expect(storage.saveEmbedding).toHaveBeenCalledWith('s2', EMBEDDING_VECTOR);
  });

  it('sends Authorization header and correct model', async () => {
    let capturedRequest: Request | undefined;
    server.use(
      http.post(VOYAGE_URL, ({ request }) => {
        capturedRequest = request;
        return HttpResponse.json(makeVoyageResponse(1));
      }),
    );

    const storage = makeStorage([makeSpot('s1')]);
    const batcher = new VoyageEmbeddingBatcher('voyage-secret', makeMetaInferer() as never, storage);
    await batcher.run();

    expect(capturedRequest!.headers.get('Authorization')).toBe('Bearer voyage-secret');
    const body = await capturedRequest!.clone().json() as { model: string };
    expect(body.model).toBe('voyage-3-large');
  });

  it('concatenates introduction + SpotMetaInferer 4-axis as embedding input', async () => {
    let capturedBody: { input: string[] } | undefined;
    server.use(
      http.post(VOYAGE_URL, async ({ request }) => {
        capturedBody = (await request.json()) as { input: string[] };
        return HttpResponse.json(makeVoyageResponse(1));
      }),
    );

    const storage = makeStorage([makeSpot('s1', {
      introduction: '아름다운 오름',
      tags: '오름,자연',
    })]);
    const metaInferer = makeMetaInferer({
      atmosphere: '열린 자연',
      crowd_level: '한산함',
      best_time: '일출',
      target_visitor: '사진가',
    });

    const batcher = new VoyageEmbeddingBatcher('key', metaInferer as never, storage);
    await batcher.run();

    const input = capturedBody!.input[0]!;
    expect(input).toContain('아름다운 오름');
    expect(input).toContain('열린 자연');
    expect(input).toContain('한산함');
    expect(input).toContain('일출');
    expect(input).toContain('사진가');
  });

  it('spotIds filter — only fetches specified spots', async () => {
    const storage = makeStorage([makeSpot('s3')]);
    server.use(http.post(VOYAGE_URL, () => HttpResponse.json(makeVoyageResponse(1))));

    const batcher = new VoyageEmbeddingBatcher('key', makeMetaInferer() as never, storage);
    await batcher.run(['s3']);

    expect(storage.findForEmbedding).toHaveBeenCalledWith(['s3']);
  });

  it('no spots → returns 0 processed, no Voyage call', async () => {
    const storage = makeStorage([]);
    const voyageCalled = vi.fn();
    server.use(http.post(VOYAGE_URL, () => { voyageCalled(); return HttpResponse.json(makeVoyageResponse(0)); }));

    const batcher = new VoyageEmbeddingBatcher('key', makeMetaInferer() as never, storage);
    const result = await batcher.run();

    expect(result.processed).toBe(0);
    expect(voyageCalled).not.toHaveBeenCalled();
  });

  it('Voyage API error for one spot → adds to failedIds, continues others', async () => {
    const spots = [makeSpot('s1'), makeSpot('s2')];
    const storage = makeStorage(spots);
    const metaInferer = makeMetaInferer();
    let callCount = 0;

    server.use(
      http.post(VOYAGE_URL, () => {
        callCount++;
        if (callCount === 1) return HttpResponse.json({ error: 'rate_limit' }, { status: 429 });
        return HttpResponse.json(makeVoyageResponse(1));
      }),
    );

    const batcher = new VoyageEmbeddingBatcher('key', metaInferer as never, storage);
    const result = await batcher.run();

    expect(result.failedIds).toHaveLength(1);
    expect(result.failedIds[0]).toBe('s1');
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('MetaInferer failure for a spot → adds to failedIds', async () => {
    const spots = [makeSpot('s1'), makeSpot('s2')];
    const storage = makeStorage(spots);
    const metaInferer = {
      infer: vi.fn()
        .mockRejectedValueOnce(new Error('LLM error'))
        .mockResolvedValue(makeMeta()),
    };
    server.use(http.post(VOYAGE_URL, () => HttpResponse.json(makeVoyageResponse(1))));

    const batcher = new VoyageEmbeddingBatcher('key', metaInferer as never, storage);
    const result = await batcher.run();

    expect(result.failedIds).toContain('s1');
    expect(result.processed).toBe(1);
  });
});

describe('VoyageEmbeddingBatcher.runSingle', () => {
  it('embeds one spot and saves', async () => {
    const storage: EmbeddingStoragePort = {
      findForEmbedding: vi.fn().mockResolvedValue([makeSpot('single-1')]),
      saveEmbedding: vi.fn().mockResolvedValue(undefined),
    };
    server.use(http.post(VOYAGE_URL, () => HttpResponse.json(makeVoyageResponse(1))));

    const batcher = new VoyageEmbeddingBatcher('key', makeMetaInferer() as never, storage);
    await batcher.runSingle('single-1');

    expect(storage.findForEmbedding).toHaveBeenCalledWith(['single-1']);
    expect(storage.saveEmbedding).toHaveBeenCalledWith('single-1', EMBEDDING_VECTOR);
  });

  it('spot not found → throws VoyageApiError', async () => {
    const storage: EmbeddingStoragePort = {
      findForEmbedding: vi.fn().mockResolvedValue([]),
      saveEmbedding: vi.fn(),
    };

    const batcher = new VoyageEmbeddingBatcher('key', makeMetaInferer() as never, storage);
    await expect(batcher.runSingle('missing-id')).rejects.toBeInstanceOf(VoyageApiError);
  });
});
