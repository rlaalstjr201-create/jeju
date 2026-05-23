/**
 * Phase 0 E2E Tests
 *
 * G1: Full pipeline (visitjeju + naver → curation_candidates)
 * G2: Curator decision (Label Studio webhook → curation_decisions + spot creation)
 * G3: Embedding batch (approved spots → Voyage AI → embedding saved)
 *
 * All external HTTP (visitjeju, naver, kakao, Claude, Voyage) is mocked via vi.fn().
 * Repositories are in-memory mocks tracking calls and state.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll, beforeAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createHmac } from 'node:crypto';

// ── Use Cases ────────────────────────────────────────────────────────────────
import { RunDiscoveryPipelineUseCase } from '../../src/application/curation/RunDiscoveryPipelineUseCase.js';
import { PersistCurationDecisionUseCase } from '../../src/application/curation/PersistCurationDecisionUseCase.js';
import { ApproveCandidateUseCase, buildSyntheticId } from '../../src/application/curation/ApproveCandidateUseCase.js';
import { VoyageEmbeddingBatcher } from '../../src/infrastructure/voyage/VoyageEmbeddingBatcher.js';
import { LabelStudioBridge } from '../../src/infrastructure/labelstudio/LabelStudioBridge.js';

// ── Domain types ─────────────────────────────────────────────────────────────
import type { CurationCandidate } from '../../src/domain/curation/CurationCandidate.js';
import type { CurationDecision } from '../../src/domain/curation/CurationDecision.js';
import type { Spot } from '../../src/domain/spot/Spot.js';
import type { VisitjejuRawSpot } from '../../src/application/ports/VisitjejuApiPort.js';
import type { KakaoVerification } from '../../src/application/ports/KakaoLocalVerifierPort.js';
import type { LlmExtraction } from '../../src/application/ports/LlmExtractorPort.js';
import type { SpotForEmbedding } from '../../src/infrastructure/voyage/VoyageEmbeddingBatcher.js';

// ── MSW server (Voyage API only — other adapters are vi.fn() mocks) ──────────
const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const EMBEDDING_VECTOR = Array.from({ length: 1024 }, (_, i) => i * 0.001);

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ─────────────────────────────────────────────────────────────────────────────
// Shared fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeVjSpot(id: string, lat: number, lng: number): VisitjejuRawSpot {
  return {
    contentsid: id,
    contentscd: 'c1',
    title: `장소_${id}`,
    address: '제주시',
    roadaddress: '제주시',
    latitude: String(lat),
    longitude: String(lng),
    tag: '자연,오름',
    introduction: `${id} 소개`,
    repPhoto: { thumbnailpath: `https://cdn.vj/${id}/thumb.jpg`, imgpath: `https://cdn.vj/${id}/img.jpg` },
    region1cd: 'A01',
    region2cd: 'A0101',
  };
}

function makeKakaoMatch(kakaoPlaceId: string, lat: number, lng: number): KakaoVerification {
  return { matched: true, kakaoPlaceId, lat, lng, address: '제주시', categoryName: '관광' };
}

const KAKAO_NO_MATCH: KakaoVerification = {
  matched: false, kakaoPlaceId: null, lat: null, lng: null, address: null, categoryName: null,
};

function makeLlmExtraction(spotName: string | null, overrides: Partial<LlmExtraction> = {}): LlmExtraction {
  return {
    spot_name: spotName,
    category: 'natural',
    authenticity_score: 0.85,
    ordinariness_score: 0.15,
    summary: spotName ? `${spotName} 요약` : '',
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// G1: Full Pipeline E2E
// ─────────────────────────────────────────────────────────────────────────────

describe('G1 — Full Pipeline E2E', () => {
  /**
   * Scenario:
   * visitjeju: 3 spots (VJ-1 lat=33.4/lng=126.5, VJ-2 lat=33.5/lng=126.6, VJ-3 lat=33.6/lng=126.7)
   *   → all Kakao-matched → status='pending'
   *
   * naver (1 query), blog=[N-null, N-dup], cafe=[N-unverified, N-normal]:
   *   N-null      → spot_name=null → naverDroppedUnidentifiable (AC-2)
   *   N-dup       → Kakao returns coords near VJ-1 (100m radius) → naverDeduplicated
   *   N-unverified→ Kakao no match → status='kakao_unverified', lat/lng=null (OQ-5)
   *   N-normal    → Kakao unique coords (33.7/126.8) → status='pending'
   *
   * Expected: visitjejuSaved=3, naverSaved=2, naverDeduplicated=1, naverDroppedUnidentifiable=1
   * Total candidateRepo.save calls = 5
   */

  it('pipes 3 visitjeju + 4 naver items through all stages, saves 5 candidates', async () => {
    // ── visitjeju mock ──────────────────────────────────────────────────────
    const vjSpots = [
      makeVjSpot('VJ-001', 33.4, 126.5),
      makeVjSpot('VJ-002', 33.5, 126.6),
      makeVjSpot('VJ-003', 33.6, 126.7),
    ];

    const visitjejuApi = {
      fetchAll: vi.fn().mockImplementation(async function* () {
        for (const s of vjSpots) yield s;
      }),
    };

    // ── naver mock ──────────────────────────────────────────────────────────
    const naverApi = {
      searchBlog: vi.fn().mockResolvedValue({
        query: '제주 숨은 오름',
        items: [
          { title: '글1', link: 'https://blog.naver.com/1', description: '광고성 글', postdate: '20260101' },
          { title: '글2', link: 'https://blog.naver.com/2', description: '성산일출봉 근처 카페', postdate: '20260102' },
        ],
      }),
      searchCafe: vi.fn().mockResolvedValue({
        query: '제주 숨은 오름',
        items: [
          { title: '카페글1', link: 'https://cafe.naver.com/1', description: '현지인만 아는 맛집', postdate: '20260103' },
          { title: '카페글2', link: 'https://cafe.naver.com/2', description: '제주 새로운 오름', postdate: '20260104' },
        ],
      }),
    };

    // ── LLM extractor mock (4 items: N-null, N-dup, N-unverified, N-normal) ─
    const llmExtractor = {
      extract: vi.fn()
        .mockResolvedValueOnce(makeLlmExtraction(null))                                    // N-null
        .mockResolvedValueOnce(makeLlmExtraction('성산카페', { authenticity_score: 0.3 })) // N-dup
        .mockResolvedValueOnce(makeLlmExtraction('숨은맛집', { authenticity_score: 0.9 })) // N-unverified
        .mockResolvedValueOnce(makeLlmExtraction('새오름', { authenticity_score: 0.8 })),  // N-normal
    };

    // ── Kakao mock: VJ-1/2/3 matched, N-dup near VJ-1, N-unverified no match, N-normal unique ──
    const kakaoVerifier = {
      verify: vi.fn()
        .mockResolvedValueOnce(makeKakaoMatch('kp-vj1', 33.4, 126.5))        // VJ-001
        .mockResolvedValueOnce(makeKakaoMatch('kp-vj2', 33.5, 126.6))        // VJ-002
        .mockResolvedValueOnce(makeKakaoMatch('kp-vj3', 33.6, 126.7))        // VJ-003
        .mockResolvedValueOnce(makeKakaoMatch('kp-dup', 33.400005, 126.500005)) // N-dup ≈0.5m from VJ-1
        .mockResolvedValueOnce(KAKAO_NO_MATCH)                                // N-unverified
        .mockResolvedValueOnce(makeKakaoMatch('kp-normal', 33.7, 126.8)),    // N-normal
    };

    // ── Candidate repo mock ─────────────────────────────────────────────────
    const saved: CurationCandidate[] = [];
    const candidateRepo = {
      findById: vi.fn(),
      findByStatus: vi.fn(),
      findExistingKakaoPlaceIds: vi.fn().mockResolvedValue(new Set()),
      findExistingVisitjejuContentIds: vi.fn().mockResolvedValue(new Set()),
      findAllWithCoordinates: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockImplementation((c: CurationCandidate) => { saved.push(c); }),
      updateStatusConditional: vi.fn().mockResolvedValue(true),
      setSyntheticId: vi.fn(),
    };

    const useCase = new RunDiscoveryPipelineUseCase(
      visitjejuApi as never,
      naverApi as never,
      llmExtractor as never,
      kakaoVerifier as never,
      candidateRepo as never,
      ['제주 숨은 오름'],
    );

    const result = await useCase.execute();

    // ── Counts ──────────────────────────────────────────────────────────────
    expect(result.visitjejuSaved).toBe(3);
    expect(result.visitjejuSkipped).toBe(0);
    expect(result.naverSaved).toBe(2);        // N-unverified + N-normal
    expect(result.naverDeduplicated).toBe(1); // N-dup
    expect(result.naverDroppedUnidentifiable).toBe(1); // N-null

    // ── Total saves ─────────────────────────────────────────────────────────
    expect(saved).toHaveLength(5);

    // ── visitjeju candidates: authenticityScore/ordinarinessScore must be null (AC-2) ──
    const vjCandidates = saved.filter((c) => c.sourceType === 'visitjeju');
    expect(vjCandidates).toHaveLength(3);
    for (const c of vjCandidates) {
      expect(c.authenticityScore).toBeNull();
      expect(c.ordinarinessScore).toBeNull();
      expect(c.status).toBe('pending');
    }

    // ── LLM bypassed for visitjeju ──────────────────────────────────────────
    // LLM called exactly 4 times (for naver items only)
    expect(llmExtractor.extract).toHaveBeenCalledTimes(4);

    // ── N-normal: status='pending', LLM scores present ─────────────────────
    const nNormal = saved.find((c) => c.sourceType === 'naver' && c.status === 'pending');
    expect(nNormal).toBeDefined();
    expect(nNormal!.name).toBe('새오름');
    expect(nNormal!.kakaoPlaceId).toBe('kp-normal');
    expect(nNormal!.authenticityScore).toBe(0.8);
    expect(nNormal!.lat).toBeCloseTo(33.7, 4);

    // ── N-unverified: status='kakao_unverified', lat/lng=null (OQ-5) ───────
    const nUnverified = saved.find((c) => c.sourceType === 'naver' && c.status === 'kakao_unverified');
    expect(nUnverified).toBeDefined();
    expect(nUnverified!.name).toBe('숨은맛집');
    expect(nUnverified!.kakaoPlaceId).toBeNull();
    expect(nUnverified!.lat).toBeNull();
    expect(nUnverified!.lng).toBeNull();
    expect(nUnverified!.authenticityScore).toBe(0.9); // LLM scores still set
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G2: Curator Decision E2E
// ─────────────────────────────────────────────────────────────────────────────

describe('G2 — Curator Decision E2E', () => {
  const WEBHOOK_SECRET = 'e2e-test-secret';

  // ── Shared mock factories ─────────────────────────────────────────────────

  function makePendingCandidate(overrides: Partial<CurationCandidate> = {}): CurationCandidate {
    return {
      id: 'cand-001',
      kakaoPlaceId: 'kp-001',
      visitjejuContentId: 'VJ-001',
      sourceType: 'visitjeju',
      name: '성산일출봉',
      region: 'seogwipo',
      category: 'c1',
      llmSummary: '유네스코 세계자연유산',
      llmTags: ['일출', '오름'],
      status: 'pending',
      discoveredAt: '2026-05-01',
      sourcedFrom: 'visitjeju',
      lat: 33.458,
      lng: 126.942,
      thumbnailUrl: 'https://cdn.vj/thumb.jpg',
      priceRange: null,
      enrichedAt: '2026-05-01T00:00:00Z',
      naverSourceUrl: null,
      naverSnippet: null,
      authenticityScore: null,
      ordinarinessScore: null,
      aiEstimatedScore: null,
      aiEstimatedAt: null,
      syntheticId: null,
      ...overrides,
    };
  }

  function makeWebhookPayload(
    candidateId: string,
    decision: 'approve' | 'reject' | 'hold',
    extras: Record<string, unknown> = {},
  ) {
    const result = [
      { from_name: 'decision', value: { choices: [decision] } },
      ...Object.entries(extras).map(([from_name, value]) => ({ from_name, value })),
    ];
    return {
      action: 'ANNOTATION_CREATED',
      annotation: {
        id: 100,
        result,
        completed_by: { username: 'curator-alice' },
      },
      task: { data: { candidate_id: candidateId } },
    };
  }

  function signPayload(payload: unknown): string {
    const body = JSON.stringify(payload);
    return createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
  }

  // ─────────────────────────────────────────────────────────────────────────

  it('G2a: approve webhook → curation_decisions saved, candidateStatus updated', async () => {
    const savedDecisions: CurationDecision[] = [];
    const decisionRepo = {
      save: vi.fn().mockImplementation((d: CurationDecision) => { savedDecisions.push(d); }),
      findByCandidateId: vi.fn(),
    };
    const candidateRepo = {
      findById: vi.fn(),
      findByStatus: vi.fn(),
      findExistingKakaoPlaceIds: vi.fn(),
      findExistingVisitjejuContentIds: vi.fn(),
      findAllWithCoordinates: vi.fn(),
      save: vi.fn(),
      updateStatusConditional: vi.fn().mockResolvedValue(true),
      setSyntheticId: vi.fn(),
    };

    const persistUseCase = new PersistCurationDecisionUseCase(
      decisionRepo as never,
      candidateRepo as never,
    );
    const bridge = new LabelStudioBridge(persistUseCase, WEBHOOK_SECRET);

    const payload = makeWebhookPayload('cand-001', 'approve', {
      curation_score: { number: 8 },
      free_memo: { text: ['훌륭한 숨은 명소'] },
    });
    const rawBody = JSON.stringify(payload);
    const sig = signPayload(payload);

    await bridge.handleWebhookWithSignature(rawBody, sig);

    // Decision saved to DB
    expect(savedDecisions).toHaveLength(1);
    expect(savedDecisions[0]!.decision).toBe('approve');
    expect(savedDecisions[0]!.curationScore).toBe(8);
    expect(savedDecisions[0]!.candidateId).toBe('cand-001');
    expect(savedDecisions[0]!.decidedBy).toBe('curator-alice');
    expect(savedDecisions[0]!.freeMemo).toBe('훌륭한 숨은 명소');
    // v1 fields always null
    expect(savedDecisions[0]!.aiEstimatedScore).toBeNull();
    expect(savedDecisions[0]!.curatorOverride).toBeNull();

    // Candidate status updated to 'approved'
    expect(candidateRepo.updateStatusConditional).toHaveBeenCalledWith('cand-001', 'approved', 'pending');
  });

  it('G2b: reject webhook → rejection_reason_enum=\'ad\' saved to curation_decisions (AC-5)', async () => {
    const savedDecisions: CurationDecision[] = [];
    const decisionRepo = {
      save: vi.fn().mockImplementation((d: CurationDecision) => { savedDecisions.push(d); }),
      findByCandidateId: vi.fn(),
    };
    const candidateRepo = {
      findById: vi.fn(),
      findByStatus: vi.fn(),
      findExistingKakaoPlaceIds: vi.fn(),
      findExistingVisitjejuContentIds: vi.fn(),
      findAllWithCoordinates: vi.fn(),
      save: vi.fn(),
      updateStatusConditional: vi.fn().mockResolvedValue(true),
      setSyntheticId: vi.fn(),
    };

    const persistUseCase = new PersistCurationDecisionUseCase(
      decisionRepo as never,
      candidateRepo as never,
    );
    const bridge = new LabelStudioBridge(persistUseCase, WEBHOOK_SECRET);

    const payload = makeWebhookPayload('cand-002', 'reject', {
      rejection_reason: { choices: ['ad'] },
      rejection_reason_text: { text: ['광고성 블로그 글'] },
    });
    const rawBody = JSON.stringify(payload);
    const sig = signPayload(payload);

    await bridge.handleWebhookWithSignature(rawBody, sig);

    expect(savedDecisions).toHaveLength(1);
    expect(savedDecisions[0]!.decision).toBe('reject');
    expect(savedDecisions[0]!.rejectionReasonEnum).toBe('ad');
    expect(savedDecisions[0]!.rejectionReasonText).toBe('광고성 블로그 글');
    expect(candidateRepo.updateStatusConditional).toHaveBeenCalledWith('cand-002', 'rejected', 'pending');
  });

  it('G2c: ApproveCandidateUseCase Path A (kakao-matched) → spot saved with kakaoPlaceId + syntheticId', async () => {
    const candidate = makePendingCandidate({
      id: 'cand-path-a',
      kakaoPlaceId: 'kp-001',
      name: '성산일출봉',
      lat: 33.458,
      lng: 126.942,
    });

    const savedSpots: Spot[] = [];
    const candidateRepo = {
      findById: vi.fn().mockResolvedValue(candidate),
      updateStatusConditional: vi.fn().mockResolvedValue(true),
      setSyntheticId: vi.fn(),
      save: vi.fn(),
      findByStatus: vi.fn(),
      findExistingKakaoPlaceIds: vi.fn(),
      findExistingVisitjejuContentIds: vi.fn(),
      findAllWithCoordinates: vi.fn(),
    };
    const spotRepo = {
      save: vi.fn(),
      saveReturningId: vi.fn().mockImplementation((s: Spot) => {
        savedSpots.push(s);
        return Promise.resolve('spot-path-a-id');
      }),
      findById: vi.fn(),
      findByIds: vi.fn(),
      search: vi.fn(),
      findTopByCurationScore: vi.fn(),
      findByRegion: vi.fn(),
      deactivate: vi.fn(),
      updateScores: vi.fn(),
      findExistingKakaoPlaceIds: vi.fn(),
      findAllActiveIds: vi.fn(),
      findForEmbedding: vi.fn(),
      saveEmbedding: vi.fn(),
    };
    const txManager = {
      run: vi.fn().mockImplementation((fn: () => Promise<string>) => fn()),
    };

    const approveUseCase = new ApproveCandidateUseCase(
      candidateRepo as never,
      spotRepo as never,
      txManager as never,
    );

    const output = await approveUseCase.execute({ candidateId: 'cand-path-a', curationScore: 9 });

    expect(output.spotId).toBe('spot-path-a-id');
    expect(savedSpots).toHaveLength(1);
    expect(savedSpots[0]!.kakaoPlaceId).toBe('kp-001');        // Path A: kakaoPlaceId set
    expect(savedSpots[0]!.syntheticId).toMatch(/^synth_[0-9a-f]{12}$/);
    expect(savedSpots[0]!.curationScore).toBe(9);

    // SyntheticId is deterministic
    const expected = buildSyntheticId('성산일출봉', 33.458, 126.942);
    expect(savedSpots[0]!.syntheticId).toBe(expected);

    // setSyntheticId called to persist syntheticId on the candidate
    expect(candidateRepo.setSyntheticId).toHaveBeenCalledWith('cand-path-a', expected);
  });

  it('G2d: ApproveCandidateUseCase Path B (kakao_unverified) → spot saved with null kakaoPlaceId + syntheticId', async () => {
    const candidate = makePendingCandidate({
      id: 'cand-path-b',
      kakaoPlaceId: null,
      status: 'kakao_unverified',
      name: '숨은오름',
      lat: 33.5,
      lng: 126.6,
    });

    const savedSpots: Spot[] = [];
    const candidateRepo = {
      findById: vi.fn().mockResolvedValue(candidate),
      updateStatusConditional: vi.fn().mockResolvedValue(true),
      setSyntheticId: vi.fn(),
      save: vi.fn(),
      findByStatus: vi.fn(),
      findExistingKakaoPlaceIds: vi.fn(),
      findExistingVisitjejuContentIds: vi.fn(),
      findAllWithCoordinates: vi.fn(),
    };
    const spotRepo = {
      save: vi.fn(),
      saveReturningId: vi.fn().mockImplementation((s: Spot) => {
        savedSpots.push(s);
        return Promise.resolve('spot-path-b-id');
      }),
      findById: vi.fn(),
      findByIds: vi.fn(),
      search: vi.fn(),
      findTopByCurationScore: vi.fn(),
      findByRegion: vi.fn(),
      deactivate: vi.fn(),
      updateScores: vi.fn(),
      findExistingKakaoPlaceIds: vi.fn(),
      findAllActiveIds: vi.fn(),
      findForEmbedding: vi.fn(),
      saveEmbedding: vi.fn(),
    };
    const txManager = {
      run: vi.fn().mockImplementation((fn: () => Promise<string>) => fn()),
    };

    const approveUseCase = new ApproveCandidateUseCase(
      candidateRepo as never,
      spotRepo as never,
      txManager as never,
    );

    const output = await approveUseCase.execute({ candidateId: 'cand-path-b', curationScore: 7 });

    expect(output.spotId).toBe('spot-path-b-id');
    expect(savedSpots[0]!.kakaoPlaceId).toBeNull();             // Path B: no kakaoPlaceId
    expect(savedSpots[0]!.syntheticId).toMatch(/^synth_[0-9a-f]{12}$/);

    // Deterministic syntheticId for same name+coords
    const expected = buildSyntheticId('숨은오름', 33.5, 126.6);
    expect(savedSpots[0]!.syntheticId).toBe(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G3: Embedding Batch E2E
// ─────────────────────────────────────────────────────────────────────────────

describe('G3 — Embedding Batch E2E', () => {
  /**
   * Scenario:
   * - 2 approved spots ready for embedding
   * - SpotMetaInferer returns 4-axis metadata (mocked)
   * - Voyage API (MSW): first call succeeds, second call fails (429)
   * - Expected: processed=1, failed=1, failedIds=['spot-2']
   *   and saveEmbedding called once for the successful spot
   */

  it('processes 2 spots: 1 success, 1 Voyage failure → failedIds=[spot-2]', async () => {
    const spots: SpotForEmbedding[] = [
      { id: 'spot-1', name: '성산일출봉', introduction: '유네스코 세계자연유산', tags: 'c1' },
      { id: 'spot-2', name: '만장굴', introduction: '세계 최장 용암 동굴', tags: 'c1' },
    ];

    const savedEmbeddings: { spotId: string; embedding: number[] }[] = [];
    const storage = {
      findForEmbedding: vi.fn().mockResolvedValue(spots),
      saveEmbedding: vi.fn().mockImplementation((spotId: string, embedding: number[]) => {
        savedEmbeddings.push({ spotId, embedding });
      }),
    };

    const metaInferer = {
      infer: vi.fn().mockResolvedValue({
        atmosphere: '한적한 해안 절벽',
        crowd_level: '평일 오전 한산',
        best_time: '일출 직후',
        target_visitor: '자연 사진 애호가',
      }),
    };

    let voyageCallCount = 0;
    server.use(
      http.post(VOYAGE_URL, () => {
        voyageCallCount++;
        if (voyageCallCount === 1) {
          return HttpResponse.json({
            data: [{ embedding: EMBEDDING_VECTOR, index: 0 }],
          });
        }
        return HttpResponse.json({ error: 'rate_limit' }, { status: 429 });
      }),
    );

    const batcher = new VoyageEmbeddingBatcher('voyage-key', metaInferer as never, storage as never);
    const result = await batcher.run();

    // Counts
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failedIds).toEqual(['spot-2']);

    // Only spot-1 embedding saved
    expect(savedEmbeddings).toHaveLength(1);
    expect(savedEmbeddings[0]!.spotId).toBe('spot-1');
    expect(savedEmbeddings[0]!.embedding).toHaveLength(1024);

    // SpotMetaInferer called for each spot (called before Voyage)
    expect(metaInferer.infer).toHaveBeenCalledTimes(2);
    expect(metaInferer.infer).toHaveBeenCalledWith({
      name: '성산일출봉',
      introduction: '유네스코 세계자연유산',
      tags: 'c1',
    });
  });

  it('spotIds filter → only fetches and embeds specified spots', async () => {
    const storage = {
      findForEmbedding: vi.fn().mockResolvedValue([
        { id: 'spot-3', name: '비자림', introduction: '자연 휴양', tags: 'c1' },
      ]),
      saveEmbedding: vi.fn().mockResolvedValue(undefined),
    };
    const metaInferer = {
      infer: vi.fn().mockResolvedValue({
        atmosphere: '울창한 숲',
        crowd_level: '평일 한산',
        best_time: '오전',
        target_visitor: '산책 애호가',
      }),
    };
    server.use(
      http.post(VOYAGE_URL, () =>
        HttpResponse.json({ data: [{ embedding: EMBEDDING_VECTOR, index: 0 }] }),
      ),
    );

    const batcher = new VoyageEmbeddingBatcher('key', metaInferer as never, storage as never);
    await batcher.run(['spot-3']);

    expect(storage.findForEmbedding).toHaveBeenCalledWith(['spot-3']);
    expect(storage.saveEmbedding).toHaveBeenCalledWith('spot-3', EMBEDDING_VECTOR);
  });

  it('empty spot list → 0 processed, Voyage never called (AC-4)', async () => {
    const storage = {
      findForEmbedding: vi.fn().mockResolvedValue([]),
      saveEmbedding: vi.fn(),
    };
    const voyageCalled = vi.fn();
    server.use(
      http.post(VOYAGE_URL, () => {
        voyageCalled();
        return HttpResponse.json({ data: [] });
      }),
    );

    const batcher = new VoyageEmbeddingBatcher('key', { infer: vi.fn() } as never, storage as never);
    const result = await batcher.run();

    expect(result.processed).toBe(0);
    expect(result.failedIds).toHaveLength(0);
    expect(voyageCalled).not.toHaveBeenCalled();
  });
});
