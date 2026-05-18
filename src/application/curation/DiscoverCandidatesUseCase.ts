import type { TrendDiscoveryPort } from '../../domain/ports/TrendDiscoveryPort.js';
import type { CurationCandidateRepository } from '../../domain/ports/CurationCandidateRepository.js';
import type { SpotRepository } from '../../domain/ports/SpotRepository.js';
import type { CurationCandidate } from '../../domain/curation/CurationCandidate.js';

interface DiscoverCandidatesInput {
  region?: import('../../domain/shared/Region.js').Region;
  category?: string;
  limit?: number;
}

interface DiscoverCandidatesOutput {
  discovered: number;
  skippedDuplicates: number;
}

export class DiscoverCandidatesUseCase {
  constructor(
    private readonly discoveryPorts: TrendDiscoveryPort[],
    private readonly candidateRepo: CurationCandidateRepository,
    private readonly spotRepo: SpotRepository,
  ) {}

  async execute(input: DiscoverCandidatesInput): Promise<DiscoverCandidatesOutput> {
    const threshold = parseInt(process.env['DISCOVER_THRESHOLD'] ?? '60', 10);
    const limit = input.limit ?? 20;

    // 1. Fetch all candidates in parallel from all discovery ports
    const results = await Promise.allSettled(
      this.discoveryPorts.map((port) =>
        port.fetchCandidatesByRegion(input.region, input.category, limit),
      ),
    );

    const allCandidates = results.flatMap((r) =>
      r.status === 'fulfilled' ? r.value : [],
    );

    // 2. Filter by threshold
    const filtered = allCandidates.filter((c) => c.trendSignal >= threshold);

    if (filtered.length === 0) {
      return { discovered: 0, skippedDuplicates: 0 };
    }

    // 3. Batch duplicate check (P1: 2 DB calls instead of N×2)
    const kakaoPlaceIds = filtered.map((c) => c.kakaoPlaceId);
    const [existingInSpots, existingInCandidates] = await Promise.all([
      this.spotRepo.findExistingKakaoPlaceIds(kakaoPlaceIds),
      this.candidateRepo.findExistingKakaoPlaceIds(kakaoPlaceIds),
    ]);

    const existingIds = new Set([...existingInSpots, ...existingInCandidates]);

    // 4. Save new candidates only
    const newCandidates = filtered.filter((c) => !existingIds.has(c.kakaoPlaceId));
    const skippedDuplicates = filtered.length - newCandidates.length;

    const today = new Date().toISOString().slice(0, 10);

    for (const c of newCandidates) {
      const candidate: CurationCandidate = {
        id: crypto.randomUUID(),
        kakaoPlaceId: c.kakaoPlaceId,
        visitjejuContentId: null,
        sourceType: 'naver',
        name: c.name,
        region: c.region,
        category: c.category,
        llmSummary: null,
        llmTags: [],
        status: 'pending',
        discoveredAt: today,
        sourcedFrom: c.sourcedFrom,
        lat: null,
        lng: null,
        thumbnailUrl: null,
        priceRange: null,
        enrichedAt: null,
        naverSourceUrl: null,
        naverSnippet: null,
        authenticityScore: null,
        ordinarinessScore: null,
        aiEstimatedScore: null,
        aiEstimatedAt: null,
        syntheticId: null,
      };
      await this.candidateRepo.save(candidate);
    }

    return { discovered: newCandidates.length, skippedDuplicates };
  }
}
