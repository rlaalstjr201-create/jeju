import type { VisitjejuApiPort, VisitjejuRawSpot } from '../ports/VisitjejuApiPort.js';
import type { NaverSearchApiPort } from '../ports/NaverSearchApiPort.js';
import type { LlmExtractorPort } from '../ports/LlmExtractorPort.js';
import type { KakaoLocalVerifierPort } from '../ports/KakaoLocalVerifierPort.js';
import type { CurationCandidateRepository } from '../../domain/ports/CurationCandidateRepository.js';
import type { CurationCandidate } from '../../domain/curation/CurationCandidate.js';
import type { Region } from '../../domain/shared/Region.js';
import { CandidateDeduper } from '../../domain/curation/CandidateDeduper.js';

export interface DiscoveryPipelineResult {
  visitjejuSaved: number;
  visitjejuSkipped: number;
  naverSaved: number;
  naverDeduplicated: number;
  naverDroppedUnidentifiable: number;
}

// Maps visitjeju region1cd codes to domain Region values
const REGION_MAP: Record<string, Region> = {
  A01: 'jeju-city',
  A02: 'seogwipo',
};

function toRegion(code: string): Region {
  return REGION_MAP[code] ?? 'jeju-city';
}

function visitjejuToCandidate(
  spot: VisitjejuRawSpot,
  kakaoPlaceId: string | null,
  lat: number,
  lng: number,
  status: 'pending' | 'kakao_unverified',
): CurationCandidate {
  return {
    id: crypto.randomUUID(),
    kakaoPlaceId,
    visitjejuContentId: spot.contentsid,
    sourceType: 'visitjeju',
    name: spot.title,
    region: toRegion(spot.region1cd),
    category: spot.contentscd,
    llmSummary: spot.introduction || null,
    llmTags: spot.tag ? spot.tag.split(',').map((t) => t.trim()) : [],
    status,
    discoveredAt: new Date().toISOString().slice(0, 10),
    sourcedFrom: 'visitjeju',
    lat,
    lng,
    thumbnailUrl: spot.repPhoto?.thumbnailpath ?? null,
    priceRange: null,
    enrichedAt: new Date().toISOString(),
    naverSourceUrl: null,
    naverSnippet: null,
    authenticityScore: null,
    ordinarinessScore: null,
    aiEstimatedScore: null,
    aiEstimatedAt: null,
    syntheticId: null,
  };
}

export class RunDiscoveryPipelineUseCase {
  constructor(
    private readonly visitjejuApi: VisitjejuApiPort,
    private readonly naverApi: NaverSearchApiPort,
    private readonly llmExtractor: LlmExtractorPort,
    private readonly kakaoVerifier: KakaoLocalVerifierPort,
    private readonly candidateRepo: CurationCandidateRepository,
    private readonly naverQueries: string[],
  ) {}

  async execute(): Promise<DiscoveryPipelineResult> {
    // Load existing candidate coordinates for dedup baseline
    const existingCoords = await this.candidateRepo.findAllWithCoordinates();
    const deduper = new CandidateDeduper(
      existingCoords.map((c) => ({ lat: c.lat, lng: c.lng })),
    );

    // ── Stage 1: visitjeju ────────────────────────────────────────────────
    const existingContentIds = await this.candidateRepo.findExistingVisitjejuContentIds(
      await this.collectVisitjejuContentIds(),
    );

    let visitjejuSaved = 0;
    let visitjejuSkipped = 0;

    for await (const raw of this.visitjejuApi.fetchAll()) {
      if (existingContentIds.has(raw.contentsid)) {
        visitjejuSkipped++;
        continue;
      }

      const rawLat = parseFloat(raw.latitude);
      const rawLng = parseFloat(raw.longitude);

      // Stage 4: Kakao verify (with hint coords from visitjeju)
      const verification = await this.kakaoVerifier.verify(raw.title, rawLat, rawLng);

      const lat = verification.matched ? (verification.lat ?? rawLat) : rawLat;
      const lng = verification.matched ? (verification.lng ?? rawLng) : rawLng;

      if (deduper.isDuplicate(lat, lng)) {
        visitjejuSkipped++;
        continue;
      }

      const candidate = visitjejuToCandidate(
        raw,
        verification.matched ? verification.kakaoPlaceId : null,
        lat,
        lng,
        verification.matched ? 'pending' : 'kakao_unverified',
      );

      await this.candidateRepo.save(candidate);
      deduper.accept(lat, lng);
      visitjejuSaved++;
    }

    // ── Stage 2–5: naver ─────────────────────────────────────────────────
    let naverSaved = 0;
    let naverDeduplicated = 0;
    let naverDroppedUnidentifiable = 0;

    for (const query of this.naverQueries) {
      const [blogResult, cafeResult] = await Promise.all([
        this.naverApi.searchBlog(query),
        this.naverApi.searchCafe(query),
      ]);

      const allItems = [...blogResult.items, ...cafeResult.items];

      for (const item of allItems) {
        // Stage 3: LLM extraction (naver only)
        const extraction = await this.llmExtractor.extract({
          snippet: item.description,
          query,
        });

        if (extraction.spot_name === null) {
          naverDroppedUnidentifiable++;
          continue;
        }

        // Stage 4: Kakao verify (no hint coords for naver)
        const verification = await this.kakaoVerifier.verify(extraction.spot_name);

        if (!verification.matched || verification.lat === null || verification.lng === null) {
          // Naver without coords cannot be deduped spatially — skip (OQ-5: drop vs hold)
          naverDroppedUnidentifiable++;
          continue;
        }

        // Stage 5: dedup against visitjeju + prior naver
        if (deduper.isDuplicate(verification.lat, verification.lng)) {
          naverDeduplicated++;
          continue;
        }

        const candidate: CurationCandidate = {
          id: crypto.randomUUID(),
          kakaoPlaceId: verification.kakaoPlaceId,
          visitjejuContentId: null,
          sourceType: 'naver',
          name: extraction.spot_name,
          region: 'jeju-city',
          category: extraction.category,
          llmSummary: extraction.summary,
          llmTags: [],
          status: 'pending',
          discoveredAt: new Date().toISOString().slice(0, 10),
          sourcedFrom: `naver:${query}`,
          lat: verification.lat,
          lng: verification.lng,
          thumbnailUrl: null,
          priceRange: null,
          enrichedAt: new Date().toISOString(),
          naverSourceUrl: item.link,
          naverSnippet: item.description,
          authenticityScore: extraction.authenticity_score,
          ordinarinessScore: extraction.ordinariness_score,
          aiEstimatedScore: null,
          aiEstimatedAt: null,
          syntheticId: null,
        };

        await this.candidateRepo.save(candidate);
        deduper.accept(verification.lat, verification.lng);
        naverSaved++;
      }
    }

    return {
      visitjejuSaved,
      visitjejuSkipped,
      naverSaved,
      naverDeduplicated,
      naverDroppedUnidentifiable,
    };
  }

  // Pre-collect all visitjeju content IDs for batch dedup check
  private async collectVisitjejuContentIds(): Promise<string[]> {
    const ids: string[] = [];
    for await (const raw of this.visitjejuApi.fetchAll()) {
      ids.push(raw.contentsid);
    }
    return ids;
  }
}
