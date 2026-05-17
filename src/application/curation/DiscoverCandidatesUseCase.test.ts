import { describe, it, expect, vi } from 'vitest';
import { DiscoverCandidatesUseCase } from './DiscoverCandidatesUseCase.js';
import type { TrendDiscoveryPort, TrendCandidate } from '../../domain/ports/TrendDiscoveryPort.js';

function makeTrendCandidate(kakaoPlaceId: string, trendSignal = 80): TrendCandidate {
  return {
    kakaoPlaceId,
    name: `Place ${kakaoPlaceId}`,
    region: 'jeju-city',
    category: 'cafe',
    trendSignal,
    sourcedFrom: 'discovery-datalab',
  };
}

function makeMocks() {
  const discoveryPort = {
    fetchCandidatesByRegion: vi.fn(),
    sourceName: 'test-source',
  };
  const candidateRepo = {
    findById: vi.fn(),
    findByStatus: vi.fn(),
    existsByKakaoPlaceId: vi.fn(),
    findExistingKakaoPlaceIds: vi.fn(),
    save: vi.fn(),
  };
  const spotRepo = {
    findById: vi.fn(),
    findByIds: vi.fn(),
    search: vi.fn(),
    findTopByCurationScore: vi.fn(),
    findByRegion: vi.fn(),
    save: vi.fn(),
    existsByKakaoPlaceId: vi.fn(),
    findExistingKakaoPlaceIds: vi.fn(),
    deactivate: vi.fn(),
    updateScores: vi.fn(),
  };
  return { discoveryPort, candidateRepo, spotRepo };
}

describe('DiscoverCandidatesUseCase', () => {
  it('saves new candidates that pass the threshold', async () => {
    const { discoveryPort, candidateRepo, spotRepo } = makeMocks();

    discoveryPort.fetchCandidatesByRegion.mockResolvedValue([
      makeTrendCandidate('kp-new-1', 80),
      makeTrendCandidate('kp-new-2', 75),
    ]);
    spotRepo.findExistingKakaoPlaceIds.mockResolvedValue(new Set());
    candidateRepo.findExistingKakaoPlaceIds.mockResolvedValue(new Set());
    candidateRepo.save.mockResolvedValue(undefined);

    process.env['DISCOVER_THRESHOLD'] = '60';

    const useCase = new DiscoverCandidatesUseCase(
      [discoveryPort as unknown as TrendDiscoveryPort],
      candidateRepo as never,
      spotRepo as never,
    );

    const result = await useCase.execute({});

    expect(result.discovered).toBe(2);
    expect(result.skippedDuplicates).toBe(0);
    expect(candidateRepo.save).toHaveBeenCalledTimes(2);
  });

  it('filters out candidates below the threshold', async () => {
    const { discoveryPort, candidateRepo, spotRepo } = makeMocks();

    discoveryPort.fetchCandidatesByRegion.mockResolvedValue([
      makeTrendCandidate('kp-good', 80),
      makeTrendCandidate('kp-bad', 30), // below threshold
    ]);
    spotRepo.findExistingKakaoPlaceIds.mockResolvedValue(new Set());
    candidateRepo.findExistingKakaoPlaceIds.mockResolvedValue(new Set());
    candidateRepo.save.mockResolvedValue(undefined);

    process.env['DISCOVER_THRESHOLD'] = '60';

    const useCase = new DiscoverCandidatesUseCase(
      [discoveryPort as unknown as TrendDiscoveryPort],
      candidateRepo as never,
      spotRepo as never,
    );

    const result = await useCase.execute({});

    expect(result.discovered).toBe(1);
    expect(candidateRepo.save).toHaveBeenCalledTimes(1);
  });

  it('skips duplicates that already exist in spots (batch check — 2 DB calls)', async () => {
    const { discoveryPort, candidateRepo, spotRepo } = makeMocks();

    discoveryPort.fetchCandidatesByRegion.mockResolvedValue([
      makeTrendCandidate('kp-exists-in-spots', 80),
      makeTrendCandidate('kp-new', 80),
    ]);
    spotRepo.findExistingKakaoPlaceIds.mockResolvedValue(new Set(['kp-exists-in-spots']));
    candidateRepo.findExistingKakaoPlaceIds.mockResolvedValue(new Set());
    candidateRepo.save.mockResolvedValue(undefined);

    process.env['DISCOVER_THRESHOLD'] = '60';

    const useCase = new DiscoverCandidatesUseCase(
      [discoveryPort as unknown as TrendDiscoveryPort],
      candidateRepo as never,
      spotRepo as never,
    );

    const result = await useCase.execute({});

    expect(result.discovered).toBe(1);
    expect(result.skippedDuplicates).toBe(1);
    // Verify batch check pattern: exactly 1 call each
    expect(spotRepo.findExistingKakaoPlaceIds).toHaveBeenCalledTimes(1);
    expect(candidateRepo.findExistingKakaoPlaceIds).toHaveBeenCalledTimes(1);
  });

  it('skips duplicates that already exist in candidates', async () => {
    const { discoveryPort, candidateRepo, spotRepo } = makeMocks();

    discoveryPort.fetchCandidatesByRegion.mockResolvedValue([
      makeTrendCandidate('kp-exists-in-candidates', 80),
    ]);
    spotRepo.findExistingKakaoPlaceIds.mockResolvedValue(new Set());
    candidateRepo.findExistingKakaoPlaceIds.mockResolvedValue(
      new Set(['kp-exists-in-candidates']),
    );
    candidateRepo.save.mockResolvedValue(undefined);

    process.env['DISCOVER_THRESHOLD'] = '60';

    const useCase = new DiscoverCandidatesUseCase(
      [discoveryPort as unknown as TrendDiscoveryPort],
      candidateRepo as never,
      spotRepo as never,
    );

    const result = await useCase.execute({});

    expect(result.discovered).toBe(0);
    expect(result.skippedDuplicates).toBe(1);
    expect(candidateRepo.save).not.toHaveBeenCalled();
  });

  it('handles partial source failure — saves successful results', async () => {
    const { candidateRepo, spotRepo } = makeMocks();

    const goodPort = {
      fetchCandidatesByRegion: vi.fn().mockResolvedValue([makeTrendCandidate('kp-good', 80)]),
      sourceName: 'good-source',
    };
    const failPort = {
      fetchCandidatesByRegion: vi.fn().mockRejectedValue(new Error('API error')),
      sourceName: 'fail-source',
    };

    spotRepo.findExistingKakaoPlaceIds.mockResolvedValue(new Set());
    candidateRepo.findExistingKakaoPlaceIds.mockResolvedValue(new Set());
    candidateRepo.save.mockResolvedValue(undefined);

    process.env['DISCOVER_THRESHOLD'] = '60';

    const useCase = new DiscoverCandidatesUseCase(
      [goodPort as unknown as TrendDiscoveryPort, failPort as unknown as TrendDiscoveryPort],
      candidateRepo as never,
      spotRepo as never,
    );

    const result = await useCase.execute({});

    expect(result.discovered).toBe(1);
    expect(candidateRepo.save).toHaveBeenCalledTimes(1);
  });
});
