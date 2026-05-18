import type { Pool, PoolClient } from 'pg';
import type { CurationCandidateRepository, CandidateCoordinate } from '../../domain/ports/CurationCandidateRepository.js';
import type { CurationCandidate, CandidateStatus } from '../../domain/curation/CurationCandidate.js';
import type { Region } from '../../domain/shared/Region.js';
import { transactionContext } from './transactionContext.js';

interface CandidateRow {
  id: string;
  kakao_place_id: string | null;
  visitjeju_content_id: string | null;
  source_type: string;
  name: string;
  region: string;
  category: string;
  llm_summary: string | null;
  llm_tags: string[];
  status: string;
  discovered_at: string;
  sourced_from: string;
  lat: number | null;
  lng: number | null;
  thumbnail_url: string | null;
  price_range: string | null;
  enriched_at: string | null;
  naver_source_url: string | null;
  naver_snippet: string | null;
  authenticity_score: number | null;
  ordinariness_score: number | null;
  ai_estimated_score: number | null;
  ai_estimated_at: string | null;
  synthetic_id: string | null;
}

function rowToCandidate(row: CandidateRow): CurationCandidate {
  return {
    id: row.id,
    kakaoPlaceId: row.kakao_place_id,
    visitjejuContentId: row.visitjeju_content_id,
    sourceType: (row.source_type as 'visitjeju' | 'naver'),
    name: row.name,
    region: row.region as Region,
    category: row.category,
    llmSummary: row.llm_summary,
    llmTags: row.llm_tags,
    status: row.status as CandidateStatus,
    discoveredAt: row.discovered_at,
    sourcedFrom: row.sourced_from,
    lat: row.lat,
    lng: row.lng,
    thumbnailUrl: row.thumbnail_url,
    priceRange: row.price_range,
    enrichedAt: row.enriched_at,
    naverSourceUrl: row.naver_source_url,
    naverSnippet: row.naver_snippet,
    authenticityScore: row.authenticity_score,
    ordinarinessScore: row.ordinariness_score,
    aiEstimatedScore: row.ai_estimated_score,
    aiEstimatedAt: row.ai_estimated_at,
    syntheticId: row.synthetic_id,
  };
}

const SELECT_COLS = `
  id, kakao_place_id, visitjeju_content_id, source_type,
  name, region, category, llm_summary, llm_tags,
  status, discovered_at, sourced_from, lat, lng,
  thumbnail_url, price_range, enriched_at,
  naver_source_url, naver_snippet, authenticity_score, ordinariness_score,
  ai_estimated_score, ai_estimated_at, synthetic_id
`.trim();

export class PostgresCurationCandidateRepository implements CurationCandidateRepository {
  constructor(private readonly pool: Pool) {}

  private async withClient<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const txClient = transactionContext.getStore();
    if (txClient !== undefined) return work(txClient);
    const client = await this.pool.connect();
    try {
      return await work(client);
    } finally {
      client.release();
    }
  }

  async findById(id: string): Promise<CurationCandidate | undefined> {
    return this.withClient(async (client) => {
      const result = await client.query<CandidateRow>(
        `SELECT ${SELECT_COLS} FROM curation_candidates WHERE id = $1`,
        [id],
      );
      const row = result.rows[0];
      return row !== undefined ? rowToCandidate(row) : undefined;
    });
  }

  async findByStatus(
    status: CandidateStatus,
    opts?: { limit: number; offset: number },
  ): Promise<CurationCandidate[]> {
    const limit = opts?.limit ?? 20;
    const offset = opts?.offset ?? 0;
    return this.withClient(async (client) => {
      const result = await client.query<CandidateRow>(
        `SELECT ${SELECT_COLS}
         FROM curation_candidates
         WHERE status = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [status, limit, offset],
      );
      return result.rows.map(rowToCandidate);
    });
  }

  async findExistingKakaoPlaceIds(kakaoPlaceIds: string[]): Promise<Set<string>> {
    if (kakaoPlaceIds.length === 0) return new Set();
    return this.withClient(async (client) => {
      const result = await client.query<{ kakao_place_id: string }>(
        `SELECT kakao_place_id FROM curation_candidates
         WHERE kakao_place_id = ANY($1) AND kakao_place_id IS NOT NULL`,
        [kakaoPlaceIds],
      );
      return new Set(result.rows.map((r) => r.kakao_place_id));
    });
  }

  async findExistingVisitjejuContentIds(contentIds: string[]): Promise<Set<string>> {
    if (contentIds.length === 0) return new Set();
    return this.withClient(async (client) => {
      const result = await client.query<{ visitjeju_content_id: string }>(
        `SELECT visitjeju_content_id FROM curation_candidates
         WHERE visitjeju_content_id = ANY($1) AND visitjeju_content_id IS NOT NULL`,
        [contentIds],
      );
      return new Set(result.rows.map((r) => r.visitjeju_content_id));
    });
  }

  async findAllWithCoordinates(): Promise<CandidateCoordinate[]> {
    return this.withClient(async (client) => {
      const result = await client.query<{
        id: string;
        lat: number;
        lng: number;
        source_type: string;
      }>(
        `SELECT id, lat, lng, source_type
         FROM curation_candidates
         WHERE lat IS NOT NULL AND lng IS NOT NULL`,
      );
      return result.rows.map((r) => ({
        id: r.id,
        lat: r.lat,
        lng: r.lng,
        sourceType: r.source_type as 'visitjeju' | 'naver',
      }));
    });
  }

  async save(candidate: CurationCandidate): Promise<void> {
    await this.withClient(async (client) => {
      await client.query(
        `INSERT INTO curation_candidates (
           id, kakao_place_id, visitjeju_content_id, source_type,
           name, region, category,
           llm_summary, llm_tags, status, discovered_at, sourced_from,
           lat, lng, thumbnail_url, price_range, enriched_at,
           naver_source_url, naver_snippet,
           authenticity_score, ordinariness_score,
           ai_estimated_score, ai_estimated_at, synthetic_id,
           updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
           $13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,now()
         )
         ON CONFLICT (id) DO UPDATE SET
           kakao_place_id     = EXCLUDED.kakao_place_id,
           visitjeju_content_id = EXCLUDED.visitjeju_content_id,
           source_type        = EXCLUDED.source_type,
           name               = EXCLUDED.name,
           region             = EXCLUDED.region,
           category           = EXCLUDED.category,
           llm_summary        = EXCLUDED.llm_summary,
           llm_tags           = EXCLUDED.llm_tags,
           status             = EXCLUDED.status,
           sourced_from       = EXCLUDED.sourced_from,
           lat                = EXCLUDED.lat,
           lng                = EXCLUDED.lng,
           thumbnail_url      = EXCLUDED.thumbnail_url,
           price_range        = EXCLUDED.price_range,
           enriched_at        = EXCLUDED.enriched_at,
           naver_source_url   = EXCLUDED.naver_source_url,
           naver_snippet      = EXCLUDED.naver_snippet,
           authenticity_score = EXCLUDED.authenticity_score,
           ordinariness_score = EXCLUDED.ordinariness_score,
           ai_estimated_score = EXCLUDED.ai_estimated_score,
           ai_estimated_at    = EXCLUDED.ai_estimated_at,
           synthetic_id       = EXCLUDED.synthetic_id,
           updated_at         = now()`,
        [
          candidate.id,
          candidate.kakaoPlaceId,
          candidate.visitjejuContentId,
          candidate.sourceType,
          candidate.name,
          candidate.region,
          candidate.category,
          candidate.llmSummary,
          candidate.llmTags,
          candidate.status,
          candidate.discoveredAt,
          candidate.sourcedFrom,
          candidate.lat,
          candidate.lng,
          candidate.thumbnailUrl,
          candidate.priceRange,
          candidate.enrichedAt,
          candidate.naverSourceUrl,
          candidate.naverSnippet,
          candidate.authenticityScore,
          candidate.ordinarinessScore,
          candidate.aiEstimatedScore,
          candidate.aiEstimatedAt,
          candidate.syntheticId,
        ],
      );
    });
  }

  async updateStatusConditional(
    id: string,
    newStatus: 'approved' | 'rejected',
    expectedCurrentStatus: CandidateStatus,
  ): Promise<boolean> {
    return this.withClient(async (client) => {
      const result = await client.query(
        `UPDATE curation_candidates
         SET status = $2, updated_at = now()
         WHERE id = $1 AND status = $3`,
        [id, newStatus, expectedCurrentStatus],
      );
      return (result.rowCount ?? 0) > 0;
    });
  }

  async setSyntheticId(id: string, syntheticId: string): Promise<void> {
    await this.withClient(async (client) => {
      await client.query(
        `UPDATE curation_candidates
         SET synthetic_id = $2, updated_at = now()
         WHERE id = $1`,
        [id, syntheticId],
      );
    });
  }
}
