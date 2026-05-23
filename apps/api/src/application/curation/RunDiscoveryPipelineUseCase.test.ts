import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RunDiscoveryPipelineUseCase } from './RunDiscoveryPipelineUseCase.js';
import type { VisitjejuRawSpot } from '../../application/ports/VisitjejuApiPort.js';
import type { NaverSearchResult } from '../../application/ports/NaverSearchApiPort.js';
import type { LlmExtraction } from '../../application/ports/LlmExtractorPort.js';
import type { KakaoVerification } from '../../application/ports/KakaoLocalVerifierPort.js';
import type { CurationCandidate } from '../../domain/curation/CurationCandidate.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeVisitjejuSpot(overrides: Partial<VisitjejuRawSpot> = {}): VisitjejuRawSpot {
  return {
    contentsid: 'VJ-001',
    contentscd: 'c1',
    title: '성산일출봉',
    address: '제주 서귀포시 성산읍',
    roadaddress: '제주 서귀포시 성산읍 일출로',
    latitude: '33.458485',
    longitude: '126.942678',
    tag: '일출,오름',
    introduction: '유네스코 세계자연유산',
    repPhoto: { thumbnailpath: 'https://t.co/thumb.jpg', imgpath: 'https://t.co/img.jpg' },
    region1cd: 'A02',
    region2cd: 'A0201',
    ...overrides,
  };
}

function makeNaverResult(query = '제주 숨은 카페'): NaverSearchResult {
  return {
    query,
    items: [
      {
        title: '조용한 카페',
        link: 'https://blog.naver.com/test/1',
        description: '현지인만 아는 카페입니다.',
        postdate: '20260501',
      },
    ],
  };
}

function makeKakaoVerified(overrides: Partial<KakaoVerification> = {}): KakaoVerification {
  return {
    matched: true,
    kakaoPlaceId: 'kp-999',
    lat: 33.458485,
    lng: 126.942678,
    address: '제주 서귀포시 성산읍',
    categoryName: '여행 > 관광',
    ...overrides,
  };
}

function makeKakaoUnverified(): KakaoVerification {
  return { matched: false, kakaoPlaceId: null, lat: null, lng: null, address: null, categoryName: null };
}

function makeLlmExtraction(overrides: Partial<LlmExtraction> = {}): LlmExtraction {
  return {
    spot_name: '조용한 카페',
    parent_spot_hint: null,
    category: 'cafe',
    authenticity_score: 0.85,
    ordinariness_score: 0.15,
    summary: '현지인만 아는 조용한 카페',
    extraction_confidence: 1.0,
    verification_status: 'unverified',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mocks factory
// ---------------------------------------------------------------------------

function makeMocks() {
  const visitjejuSpots: VisitjejuRawSpot[] = [makeVisitjejuSpot()];

  const visitjejuApi = {
    fetchAll: vi.fn().mockImplementation(async function* () {
      for (const s of visitjejuSpots) yield s;
    }),
  };

  const naverApi = {
    searchBlog: vi.fn().mockResolvedValue(makeNaverResult()),
    searchCafe: vi.fn().mockResolvedValue(makeNaverResult()),
  };

  const llmExtractor = {
    extract: vi.fn().mockResolvedValue(makeLlmExtraction()),
  };

  const kakaoVerifier = {
    verify: vi.fn().mockResolvedValue(makeKakaoVerified()),
  };

  const candidateRepo = {
    findById: vi.fn(),
    findByStatus: vi.fn(),
    findExistingKakaoPlaceIds: vi.fn().mockResolvedValue(new Set()),
    findExistingVisitjejuContentIds: vi.fn().mockResolvedValue(new Set()),
    findAllWithCoordinates: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue(undefined),
    updateStatusConditional: vi.fn().mockResolvedValue(true),
    setSyntheticId: vi.fn(),
    patchCoordinates: vi.fn().mockResolvedValue(undefined),
  };

  return { visitjejuApi, naverApi, llmExtractor, kakaoVerifier, candidateRepo, visitjejuSpots };
}

function makeUseCase(
  mocks: ReturnType<typeof makeMocks>,
  queries: string[] = ['제주 숨은 카페'],
  options?: { blockedUrlPatterns?: string[]; blockedCategories?: string[] },
) {
  return new RunDiscoveryPipelineUseCase(
    mocks.visitjejuApi as never,
    mocks.naverApi as never,
    mocks.llmExtractor as never,
    mocks.kakaoVerifier as never,
    mocks.candidateRepo as never,
    queries,
    options,
  );
}

function makeNaverVerifier(overrides: Partial<{ matched: boolean; lat: number; lng: number; category: string | null }> = {}) {
  return {
    verify: vi.fn().mockResolvedValue({
      matched: overrides.matched ?? true,
      lat: overrides.lat ?? 33.5,
      lng: overrides.lng ?? 126.7,
      category: overrides.category !== undefined ? overrides.category : null,
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RunDiscoveryPipelineUseCase', () => {
  describe('Stage 1 — visitjeju processing', () => {
    it('visitjeju spot bypasses LlmExtractor and is saved as visitjeju candidate', async () => {
      const mocks = makeMocks();
      const useCase = makeUseCase(mocks, []);

      const result = await useCase.execute();

      expect(mocks.llmExtractor.extract).not.toHaveBeenCalled();
      expect(mocks.candidateRepo.save).toHaveBeenCalledOnce();
      const saved = mocks.candidateRepo.save.mock.calls[0]![0] as CurationCandidate;
      expect(saved.sourceType).toBe('visitjeju');
      expect(saved.visitjejuContentId).toBe('VJ-001');
    });

    it('visitjeju kakao matched → status=pending with kakaoPlaceId', async () => {
      const mocks = makeMocks();
      mocks.kakaoVerifier.verify.mockResolvedValue(makeKakaoVerified({ kakaoPlaceId: 'kp-001' }));
      const useCase = makeUseCase(mocks, []);

      await useCase.execute();

      const saved = mocks.candidateRepo.save.mock.calls[0]![0] as CurationCandidate;
      expect(saved.status).toBe('pending');
      expect(saved.kakaoPlaceId).toBe('kp-001');
    });

    it('visitjeju kakao unverified → status=kakao_unverified, uses visitjeju lat/lng', async () => {
      const mocks = makeMocks();
      mocks.kakaoVerifier.verify.mockResolvedValue(makeKakaoUnverified());
      const useCase = makeUseCase(mocks, []);

      await useCase.execute();

      const saved = mocks.candidateRepo.save.mock.calls[0]![0] as CurationCandidate;
      expect(saved.status).toBe('kakao_unverified');
      expect(saved.kakaoPlaceId).toBeNull();
      expect(saved.lat).toBeCloseTo(33.458485, 4);
      expect(saved.lng).toBeCloseTo(126.942678, 4);
    });

    it('visitjeju spot already in DB → skipped (dedup by visitjejuContentId)', async () => {
      const mocks = makeMocks();
      mocks.candidateRepo.findExistingVisitjejuContentIds.mockResolvedValue(new Set(['VJ-001']));
      const useCase = makeUseCase(mocks, []);

      const result = await useCase.execute();

      expect(mocks.candidateRepo.save).not.toHaveBeenCalled();
      expect(result.visitjejuSaved).toBe(0);
      expect(result.visitjejuSkipped).toBe(1);
    });
  });

  describe('Stage 2–3 — naver + LLM', () => {
    it('naver result goes through LlmExtractor — visitjeju bypasses it', async () => {
      const mocks = makeMocks();
      const useCase = makeUseCase(mocks, ['제주 숨은 카페']);

      await useCase.execute();

      // LLM called once per naver result (1 blog + 1 cafe item = 2 calls)
      // but each returns 1 item, so 2 total extractions
      expect(mocks.llmExtractor.extract).toHaveBeenCalled();
    });

    it('LLM spot_name null → naver result dropped (unidentifiable)', async () => {
      const mocks = makeMocks();
      mocks.llmExtractor.extract.mockResolvedValue(makeLlmExtraction({ spot_name: null }));
      mocks.visitjejuSpots.length = 0; // no visitjeju results
      const useCase = makeUseCase(mocks, ['제주 숨은 곳']);

      const result = await useCase.execute();

      expect(mocks.candidateRepo.save).not.toHaveBeenCalled();
      expect(result.naverDroppedUnidentifiable).toBeGreaterThan(0);
    });

    it('naver candidate saved with LLM scores and source metadata', async () => {
      const mocks = makeMocks();
      mocks.visitjejuSpots.length = 0; // clear visitjeju so naver is easier to inspect
      mocks.kakaoVerifier.verify.mockResolvedValue(makeKakaoVerified({
        kakaoPlaceId: 'kp-naver',
        lat: 33.5000,
        lng: 126.8000,
      }));
      const useCase = makeUseCase(mocks, ['제주 카페']);

      await useCase.execute();

      const saved = mocks.candidateRepo.save.mock.calls[0]![0] as CurationCandidate;
      expect(saved.sourceType).toBe('naver');
      expect(saved.authenticityScore).toBe(0.85);
      expect(saved.ordinarinessScore).toBe(0.15);
      expect(saved.naverSourceUrl).toBeDefined();
    });
  });

  describe('Stage 5 — CandidateDeduper (visitjeju first)', () => {
    it('naver spot within 100 m of visitjeju spot → dropped as duplicate', async () => {
      const mocks = makeMocks();
      // visitjeju at 33.458485, 126.942678
      // kakao verifier returns same coords for naver result too → within 100m
      mocks.kakaoVerifier.verify.mockResolvedValue(makeKakaoVerified({
        lat: 33.458490, lng: 126.942680, // ~1 m away
      }));
      const useCase = makeUseCase(mocks, ['제주 성산']);

      const result = await useCase.execute();

      // visitjeju should be saved; naver duplicate should be dropped
      const savedSources = mocks.candidateRepo.save.mock.calls.map(
        (c) => (c[0] as CurationCandidate).sourceType,
      );
      expect(savedSources).toContain('visitjeju');
      expect(result.naverDeduplicated).toBeGreaterThan(0);
    });

    it('naver spot > 100 m from visitjeju → saved separately', async () => {
      const mocks = makeMocks();
      // visitjeju at 33.458485, 126.942678; naver verifies to 33.5000, 126.8000 (~17 km away)
      let callCount = 0;
      mocks.kakaoVerifier.verify.mockImplementation(async () => {
        callCount++;
        return callCount === 1
          ? makeKakaoVerified({ lat: 33.458485, lng: 126.942678 }) // visitjeju
          : makeKakaoVerified({ lat: 33.5000, lng: 126.8000, kakaoPlaceId: 'kp-far' }); // naver
      });
      const useCase = makeUseCase(mocks, ['제주 만장굴']);

      await useCase.execute();

      const savedSources = mocks.candidateRepo.save.mock.calls.map(
        (c) => (c[0] as CurationCandidate).sourceType,
      );
      expect(savedSources).toContain('visitjeju');
      expect(savedSources).toContain('naver');
    });
  });

  describe('pipeline result summary', () => {
    it('returns counts for all stages', async () => {
      const mocks = makeMocks();
      const useCase = makeUseCase(mocks, ['q1']);

      const result = await useCase.execute();

      expect(result).toMatchObject({
        visitjejuSaved: expect.any(Number),
        visitjejuSkipped: expect.any(Number),
        naverSaved: expect.any(Number),
        naverDeduplicated: expect.any(Number),
        naverDroppedUnidentifiable: expect.any(Number),
      });
    });
  });

  describe('domain blocking', () => {
    it('item from blocked domain → skipped, LLM not called', async () => {
      const mocks = makeMocks();
      mocks.visitjejuSpots.length = 0;
      mocks.naverApi.searchBlog.mockResolvedValue({
        query: '제주 카페',
        items: [{ title: '이벤트', link: 'https://cafeflex.naver.com/event/1', description: '...', postdate: '20260501' }],
      });
      mocks.naverApi.searchCafe.mockResolvedValue({ query: '제주 카페', items: [] });

      const useCase = makeUseCase(mocks, ['제주 카페'], { blockedUrlPatterns: ['cafeflex.naver.com'] });
      const result = await useCase.execute();

      expect(mocks.llmExtractor.extract).not.toHaveBeenCalled();
      expect(result.naverDomainBlocked).toBe(1);
    });

    it('item from non-blocked domain → proceeds normally', async () => {
      const mocks = makeMocks();
      mocks.visitjejuSpots.length = 0;
      mocks.kakaoVerifier.verify.mockResolvedValue(makeKakaoVerified());

      const useCase = makeUseCase(mocks, ['제주 카페'], { blockedUrlPatterns: ['cafeflex.naver.com'] });
      await useCase.execute();

      expect(mocks.llmExtractor.extract).toHaveBeenCalled();
    });

    it('cafe.naver.com/cafeflex URL → blocked by substring match', async () => {
      const mocks = makeMocks();
      mocks.visitjejuSpots.length = 0;
      mocks.naverApi.searchBlog.mockResolvedValue({
        query: '제주 공방',
        items: [{ title: '이벤트', link: 'http://cafe.naver.com/cafeflex/31415', description: '...', postdate: '20260501' }],
      });
      mocks.naverApi.searchCafe.mockResolvedValue({ query: '제주 공방', items: [] });

      const useCase = makeUseCase(mocks, ['제주 공방'], { blockedUrlPatterns: ['cafe.naver.com/cafeflex'] });
      const result = await useCase.execute();

      expect(mocks.llmExtractor.extract).not.toHaveBeenCalled();
      expect(result.naverDomainBlocked).toBe(1);
    });
  });

  describe('Stage 4 all-fail → auto_rejected', () => {
    it('kakao + naver + parent all fail → saves as auto_rejected', async () => {
      const mocks = makeMocks();
      mocks.visitjejuSpots.length = 0;
      mocks.kakaoVerifier.verify.mockResolvedValue(makeKakaoUnverified());
      mocks.llmExtractor.extract.mockResolvedValue(makeLlmExtraction({ spot_name: '어떤카페', parent_spot_hint: null }));

      const useCase = makeUseCase(mocks, ['제주 카페']);
      await useCase.execute();

      const saved = mocks.candidateRepo.save.mock.calls[0]![0] as CurationCandidate;
      expect(saved.status).toBe('auto_rejected');
      expect(saved.lat).toBeNull();
      expect(saved.lng).toBeNull();
    });

    it('auto_rejected increments naverAutoRejected counter', async () => {
      const mocks = makeMocks();
      mocks.visitjejuSpots.length = 0;
      mocks.kakaoVerifier.verify.mockResolvedValue(makeKakaoUnverified());
      mocks.llmExtractor.extract.mockResolvedValue(makeLlmExtraction({ spot_name: '어떤카페' }));

      const useCase = makeUseCase(mocks, ['제주 카페']);
      const result = await useCase.execute();

      expect(result.naverAutoRejected).toBeGreaterThan(0);
    });
  });

  describe('name dedup', () => {
    it('kakao_unverified same spot_name twice → second deduplicated', async () => {
      const mocks = makeMocks();
      mocks.visitjejuSpots.length = 0;
      mocks.kakaoVerifier.verify.mockResolvedValue(makeKakaoUnverified());
      mocks.llmExtractor.extract.mockResolvedValue(makeLlmExtraction({ spot_name: '메종드백' }));
      mocks.naverApi.searchBlog.mockResolvedValue({
        query: 'q',
        items: [
          { title: 't1', link: 'https://blog.naver.com/1', description: 'd1', postdate: '20260501' },
          { title: 't2', link: 'https://blog.naver.com/2', description: 'd2', postdate: '20260501' },
        ],
      });
      mocks.naverApi.searchCafe.mockResolvedValue({ query: 'q', items: [] });

      const useCase = makeUseCase(mocks, ['q']);
      const result = await useCase.execute();

      expect(mocks.candidateRepo.save).toHaveBeenCalledTimes(1);
      expect(result.naverDeduplicated).toBe(1);
    });

    it('kakao-verified same spot_name twice → second deduplicated by name', async () => {
      const mocks = makeMocks();
      mocks.visitjejuSpots.length = 0;
      let kakaoCall = 0;
      mocks.kakaoVerifier.verify.mockImplementation(async () => {
        kakaoCall++;
        // Different coords each call so coord dedup won't trigger
        return makeKakaoVerified({ lat: 33.4 + kakaoCall * 0.01, lng: 126.9 });
      });
      mocks.llmExtractor.extract.mockResolvedValue(makeLlmExtraction({ spot_name: '어떤가게' }));
      mocks.naverApi.searchBlog.mockResolvedValue({
        query: 'q',
        items: [
          { title: 't1', link: 'https://blog.naver.com/1', description: 'd1', postdate: '20260501' },
          { title: 't2', link: 'https://blog.naver.com/2', description: 'd2', postdate: '20260501' },
        ],
      });
      mocks.naverApi.searchCafe.mockResolvedValue({ query: 'q', items: [] });

      const useCase = makeUseCase(mocks, ['q']);
      const result = await useCase.execute();

      expect(mocks.candidateRepo.save).toHaveBeenCalledTimes(1);
      expect(result.naverDeduplicated).toBe(1);
    });
  });

  describe('Stage 4 — category filtering (Layer 2)', () => {
    it('kakao matched but category is blocked → treated as unmatched → auto_rejected', async () => {
      const mocks = makeMocks();
      mocks.visitjejuSpots.length = 0;
      mocks.kakaoVerifier.verify.mockResolvedValue(makeKakaoVerified({
        categoryName: '스포츠,레저 > 스포츠시설 > 필라테스',
      }));
      mocks.llmExtractor.extract.mockResolvedValue(makeLlmExtraction({ spot_name: '제주필라테스' }));
      mocks.naverApi.searchBlog.mockResolvedValue(makeNaverResult());
      mocks.naverApi.searchCafe.mockResolvedValue({ query: 'q', items: [] });

      const useCase = makeUseCase(mocks, ['q'], { blockedCategories: ['필라테스'] });
      await useCase.execute();

      const saved = mocks.candidateRepo.save.mock.calls[0]![0] as CurationCandidate;
      expect(saved.status).toBe('auto_rejected');
    });

    it('kakao matched with allowed category → saved as pending', async () => {
      const mocks = makeMocks();
      mocks.visitjejuSpots.length = 0;
      mocks.kakaoVerifier.verify.mockResolvedValue(makeKakaoVerified({
        categoryName: '음식점 > 한식 > 흑돼지',
      }));
      mocks.llmExtractor.extract.mockResolvedValue(makeLlmExtraction({ spot_name: '흑돼지식당' }));
      mocks.naverApi.searchBlog.mockResolvedValue(makeNaverResult());
      mocks.naverApi.searchCafe.mockResolvedValue({ query: 'q', items: [] });

      const useCase = makeUseCase(mocks, ['q'], { blockedCategories: ['필라테스'] });
      await useCase.execute();

      const saved = mocks.candidateRepo.save.mock.calls.find(
        c => (c[0] as CurationCandidate).sourceType === 'naver',
      )![0] as CurationCandidate;
      expect(saved.status).toBe('pending');
    });
  });

  describe('Stage 4 — naver→kakao cross-check (Layer 3)', () => {
    it('naver matched but kakao cross-check fails → auto_rejected (false positive blocked)', async () => {
      const mocks = makeMocks();
      mocks.visitjejuSpots.length = 0;
      // ALL kakao calls fail (direct + cross-check)
      mocks.kakaoVerifier.verify.mockResolvedValue(makeKakaoUnverified());
      const naverVerifier = makeNaverVerifier({ matched: true, lat: 33.5, lng: 126.7, category: null });
      mocks.llmExtractor.extract.mockResolvedValue(makeLlmExtraction({ spot_name: '돌핀뷰' }));
      mocks.naverApi.searchBlog.mockResolvedValue(makeNaverResult('q'));
      mocks.naverApi.searchCafe.mockResolvedValue({ query: 'q', items: [] });

      const useCase = new RunDiscoveryPipelineUseCase(
        mocks.visitjejuApi as never,
        mocks.naverApi as never,
        mocks.llmExtractor as never,
        mocks.kakaoVerifier as never,
        mocks.candidateRepo as never,
        ['q'],
        { naverLocalVerifier: naverVerifier as never },
      );

      await useCase.execute();

      const naverSave = mocks.candidateRepo.save.mock.calls.find(
        c => (c[0] as CurationCandidate).sourceType === 'naver',
      );
      // Should be auto_rejected (naver matched but cross-check failed)
      expect((naverSave![0] as CurationCandidate).status).toBe('auto_rejected');
    });

    it('naver matched and kakao cross-check passes → verified_by=naver_kakao_cross', async () => {
      const mocks = makeMocks();
      mocks.visitjejuSpots.length = 0;
      let kakaoCallCount = 0;
      mocks.kakaoVerifier.verify.mockImplementation(async () => {
        kakaoCallCount++;
        // 1st call: direct kakao verify → no match
        if (kakaoCallCount === 1) return makeKakaoUnverified();
        // 2nd call: cross-check after naver → match
        return makeKakaoVerified({ kakaoPlaceId: 'kp-cross', lat: 33.5, lng: 126.7, categoryName: '스포츠,레저 > 레저 > 해양레포츠' });
      });
      const naverVerifier = makeNaverVerifier({ matched: true, lat: 33.5, lng: 126.7, category: null });
      mocks.llmExtractor.extract.mockResolvedValue(makeLlmExtraction({ spot_name: '씨유다이브' }));
      mocks.naverApi.searchBlog.mockResolvedValue(makeNaverResult('q'));
      mocks.naverApi.searchCafe.mockResolvedValue({ query: 'q', items: [] });

      const useCase = new RunDiscoveryPipelineUseCase(
        mocks.visitjejuApi as never,
        mocks.naverApi as never,
        mocks.llmExtractor as never,
        mocks.kakaoVerifier as never,
        mocks.candidateRepo as never,
        ['q'],
        { naverLocalVerifier: naverVerifier as never },
      );

      await useCase.execute();

      const naverSave = mocks.candidateRepo.save.mock.calls.find(
        c => (c[0] as CurationCandidate).sourceType === 'naver',
      );
      expect((naverSave![0] as CurationCandidate).verifiedBy).toBe('naver_kakao_cross');
      expect((naverSave![0] as CurationCandidate).status).toBe('pending');
    });
  });
});
