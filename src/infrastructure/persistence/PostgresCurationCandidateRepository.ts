import type { Pool, PoolClient } from 'pg';
import type { CurationCandidateRepository } from '../../domain/ports/CurationCandidateRepository.js';
import type { CurationCandidate } from '../../domain/curation/CurationCandidate.js';
import type { Region } from '../../domain/shared/Region.js';
import { transactionContext } from './transactionContext.js';

interface CandidateRow {
  id: string;
  kakao_place_id: string;
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
}

function rowToCandidate(row: CandidateRow): CurationCandidate {
  return {
    id: row.id,
    kakaoPlaceId: row.kakao_place_id,
    name: row.name,
    region: row.region as Region,
    category: row.category,
    llmSummary: row.llm_summary,
    llmTags: row.llm_tags,
    status: row.status as 'pending' | 'approved' | 'rejected',
    discoveredAt: row.discovered_at,
    sourcedFrom: row.sourced_from,
    lat: row.lat,
    lng: row.lng,
    thumbnailUrl: row.thumbnail_url,
    priceRange: row.price_range,
    enrichedAt: row.enriched_at,
  };
}

const SELECT_COLS = `id, kakao_place_id, name, region, category, llm_summary, llm_tags,
              status, discovered_at, sourced_from, lat, lng, thumbnail_url, price_range, enriched_at`;

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
    status: 'pending' | 'approved' | 'rejected',
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
        `SELECT kakao_place_id FROM curation_candidates WHERE kakao_place_id = ANY($1)`,
        [kakaoPlaceIds],
      );
      return new Set(result.rows.map((r) => r.kakao_place_id));
    });
  }

  async save(candidate: CurationCandidate): Promise<void> {
    await this.withClient(async (client) => {
      await client.query(
        `INSERT INTO curation_candidates (
           id, kakao_place_id, name, region, category,
           llm_summary, llm_tags, status, discovered_at, sourced_from,
           lat, lng, thumbnail_url, price_range, enriched_at,
           updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now())
         ON CONFLICT (kakao_place_id) DO UPDATE SET
           name           = EXCLUDED.name,
           region         = EXCLUDED.region,
           category       = EXCLUDED.category,
           llm_summary    = EXCLUDED.llm_summary,
           llm_tags       = EXCLUDED.llm_tags,
           status         = EXCLUDED.status,
           sourced_from   = EXCLUDED.sourced_from,
           lat            = EXCLUDED.lat,
           lng            = EXCLUDED.lng,
           thumbnail_url  = EXCLUDED.thumbnail_url,
           price_range    = EXCLUDED.price_range,
           enriched_at    = EXCLUDED.enriched_at,
           updated_at     = now()`,
        [
          candidate.id,
          candidate.kakaoPlaceId,
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
        ],
      );
    });
  }

  async updateStatusConditional(
    id: string,
    newStatus: 'approved' | 'rejected',
    expectedCurrentStatus: 'pending' | 'approved',
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
}
