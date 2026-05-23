import type { VisitjejuApiPort, VisitjejuRawSpot } from '../ports/VisitjejuApiPort.js';
import type { NaverSearchApiPort } from '../ports/NaverSearchApiPort.js';
import type { LlmExtractorPort } from '../ports/LlmExtractorPort.js';
import type { KakaoLocalVerifierPort } from '../ports/KakaoLocalVerifierPort.js';
import type { NaverLocalVerifierPort } from '../ports/NaverLocalVerifierPort.js';
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
  naverSnippetsTotal: number;
  naverKakaoMatched: number;
  naverKakaoUnmatched: number;
  naverLocalFallbackUsed: number;
  parentSpotFallbackUsed: number;
  naverDomainBlocked: number;
  naverAutoRejected: number;
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
    verifiedBy: null,
  };
}

const DEFAULT_NAVER_DISPLAY = 30; // 50 queries × 2 channels × 30 = 3,000/run ≈ 12% of 25,000/day

function isCategoryBlocked(category: string | null, blockedList: readonly string[]): boolean {
  if (category === null || blockedList.length === 0) return false;
  return blockedList.some(blocked => category.includes(blocked));
}

export class RunDiscoveryPipelineUseCase {
  private readonly naverDisplayPerQuery: number;
  private readonly naverLocalVerifier: NaverLocalVerifierPort | null;
  private readonly blockedUrlPatterns: readonly string[];
  private readonly blockedCategories: readonly string[];

  constructor(
    private readonly visitjejuApi: VisitjejuApiPort,
    private readonly naverApi: NaverSearchApiPort,
    private readonly llmExtractor: LlmExtractorPort,
    private readonly kakaoVerifier: KakaoLocalVerifierPort,
    private readonly candidateRepo: CurationCandidateRepository,
    private readonly naverQueries: string[],
    options?: { naverDisplayPerQuery?: number; naverLocalVerifier?: NaverLocalVerifierPort; blockedUrlPatterns?: string[]; blockedCategories?: string[] },
  ) {
    this.naverDisplayPerQuery = options?.naverDisplayPerQuery ?? DEFAULT_NAVER_DISPLAY;
    this.naverLocalVerifier = options?.naverLocalVerifier ?? null;
    this.blockedUrlPatterns = options?.blockedUrlPatterns ?? [];
    this.blockedCategories = options?.blockedCategories ?? [];
  }

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
    let naverSnippetsTotal = 0;
    let naverKakaoMatched = 0;
    let naverKakaoUnmatched = 0;
    let naverLocalFallbackUsed = 0;
    let parentSpotFallbackUsed = 0;
    let naverDomainBlocked = 0;
    let naverAutoRejected = 0;

    for (let qi = 0; qi < this.naverQueries.length; qi++) {
      const query = this.naverQueries[qi]!;

      if (qi > 0 && qi % 10 === 0) {
        process.stdout.write(
          `[pipeline] naver progress: ${qi}/${this.naverQueries.length} queries ` +
          `(saved=${naverSaved} dedup=${naverDeduplicated} dropped=${naverDroppedUnidentifiable})\n`,
        );
      }

      const [blogResult, cafeResult] = await Promise.all([
        this.naverApi.searchBlog(query, this.naverDisplayPerQuery),
        this.naverApi.searchCafe(query, this.naverDisplayPerQuery),
      ]);

      const allItems = [...blogResult.items, ...cafeResult.items];
      naverSnippetsTotal += allItems.length;

      for (const item of allItems) {
        // URL pattern blocking (substring match)
        if (this.blockedUrlPatterns.some(p => item.link.includes(p))) {
          naverDomainBlocked++;
          continue;
        }

        // Stage 3: LLM extraction (naver only)
        let extraction;
        try {
          extraction = await this.llmExtractor.extract({
            snippet: item.description,
            query,
          });
        } catch {
          naverDroppedUnidentifiable++;
          continue;
        }

        if (extraction.spot_name === null) {
          naverDroppedUnidentifiable++;
          continue;
        }

        // Stage 4: Fallback chain — kakao → naver→kakao cross-check → kakao(parent_spot_hint)
        try {
        let resolvedLat: number | null = null;
        let resolvedLng: number | null = null;
        let resolvedKakaoPlaceId: string | null = null;
        let resolvedVerifiedBy: 'kakao' | 'naver' | 'kakao_parent' | 'naver_kakao_cross' | null = null;

        // 1st: Kakao verify spot_name (Layer 2 — category check)
        const kakaoVerification = await this.kakaoVerifier.verify(extraction.spot_name);
        if (kakaoVerification.matched && kakaoVerification.lat !== null && kakaoVerification.lng !== null) {
          if (!isCategoryBlocked(kakaoVerification.categoryName, this.blockedCategories)) {
            resolvedLat = kakaoVerification.lat;
            resolvedLng = kakaoVerification.lng;
            resolvedKakaoPlaceId = kakaoVerification.kakaoPlaceId;
            resolvedVerifiedBy = 'kakao';
          }
          // If category blocked: resolvedVerifiedBy stays null → continue to next step
        }

        // 2nd: Naver local verify + Kakao cross-check (Layer 3)
        if (resolvedVerifiedBy === null && this.naverLocalVerifier !== null) {
          const naverVerification = await this.naverLocalVerifier.verify(extraction.spot_name);
          if (naverVerification.matched && naverVerification.lat !== null && naverVerification.lng !== null
              && !isCategoryBlocked(naverVerification.category, this.blockedCategories)) {
            // Kakao cross-check (Layer 3)
            const kakaoXCheck = await this.kakaoVerifier.verify(
              extraction.spot_name, naverVerification.lat, naverVerification.lng,
            );
            if (kakaoXCheck.matched && kakaoXCheck.lat !== null && kakaoXCheck.lng !== null
                && !isCategoryBlocked(kakaoXCheck.categoryName, this.blockedCategories)) {
              resolvedLat = kakaoXCheck.lat;
              resolvedLng = kakaoXCheck.lng;
              resolvedKakaoPlaceId = kakaoXCheck.kakaoPlaceId;
              resolvedVerifiedBy = 'naver_kakao_cross';
              naverLocalFallbackUsed++;
            }
            // If cross-check fails: resolvedVerifiedBy stays null
          }
        }

        // 3rd: Kakao verify parent_spot_hint (if naver also failed and hint exists)
        if (resolvedVerifiedBy === null && extraction.parent_spot_hint !== null) {
          const parentKakaoVerification = await this.kakaoVerifier.verify(extraction.parent_spot_hint);
          if (parentKakaoVerification.matched && parentKakaoVerification.lat !== null && parentKakaoVerification.lng !== null) {
            resolvedLat = parentKakaoVerification.lat;
            resolvedLng = parentKakaoVerification.lng;
            resolvedKakaoPlaceId = null; // spot_name stays original, no kakaoPlaceId for parent
            resolvedVerifiedBy = 'kakao_parent';
            parentSpotFallbackUsed++;
          }
        }

        if (resolvedVerifiedBy === null) {
          naverKakaoUnmatched++;
          // OQ-5 resolution: hold for curator (kakao_unverified) rather than drop.
          // No spatial dedup possible without coords — name dedup only.
          if (deduper.isNameDuplicate(extraction.spot_name)) {
            naverDeduplicated++;
            continue;
          }
          await this.candidateRepo.save({
            id: crypto.randomUUID(),
            kakaoPlaceId: null,
            visitjejuContentId: null,
            sourceType: 'naver',
            name: extraction.spot_name,
            region: 'jeju-city',
            category: extraction.category,
            llmSummary: 'Stage 4 모든 검증 실패 (kakao·naver·parent 모두 미등록)',
            llmTags: [],
            status: 'auto_rejected',
            discoveredAt: new Date().toISOString().slice(0, 10),
            sourcedFrom: `naver:${query}`,
            lat: null,
            lng: null,
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
            verifiedBy: null,
          });
          deduper.acceptName(extraction.spot_name);
          naverAutoRejected++;
          continue;
        }

        naverKakaoMatched++;

        // Stage 5: name dedup first, then coordinate dedup
        if (deduper.isNameDuplicate(extraction.spot_name)) {
          naverDeduplicated++;
          continue;
        }

        if (deduper.isDuplicate(resolvedLat!, resolvedLng!)) {
          naverDeduplicated++;
          continue;
        }

        const candidate: CurationCandidate = {
          id: crypto.randomUUID(),
          kakaoPlaceId: resolvedKakaoPlaceId,
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
          lat: resolvedLat,
          lng: resolvedLng,
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
          verifiedBy: resolvedVerifiedBy,
        };

        await this.candidateRepo.save(candidate);
        deduper.accept(resolvedLat!, resolvedLng!);
        deduper.acceptName(extraction.spot_name);
        naverSaved++;
        } catch {
          naverDroppedUnidentifiable++;
        }
      }
    }

    return {
      visitjejuSaved,
      visitjejuSkipped,
      naverSaved,
      naverDeduplicated,
      naverDroppedUnidentifiable,
      naverSnippetsTotal,
      naverKakaoMatched,
      naverKakaoUnmatched,
      naverLocalFallbackUsed,
      parentSpotFallbackUsed,
      naverDomainBlocked,
      naverAutoRejected,
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
