import type { Pool, PoolClient } from 'pg';
import type { SpotRepository } from '../../domain/ports/SpotRepository.js';
import type { Spot } from '../../domain/spot/Spot.js';
import type { Region } from '../../domain/shared/Region.js';
import type { PriceRange } from '../../domain/shared/PriceRange.js';
import { transactionContext } from './transactionContext.js';

interface SpotRow {
  id: string;
  kakao_place_id: string | null;
  synthetic_id: string | null;
  name: string;
  region: string;
  category: string;
  price_range: string;
  curation_score: number;
  popularity_score: number;
  trend_score: number;
  curation_comment: string | null;
  thumbnail_url: string | null;
  lat: number;
  lng: number;
  tier: string;
  awards: unknown;
  curator_comment: string | null;
  curator_comment_source: string | null;
  curator_comment_retry_count: number;
}

function rowToSpot(row: SpotRow): Spot {
  return {
    id: row.id,
    kakaoPlaceId: row.kakao_place_id,
    syntheticId: row.synthetic_id,
    name: row.name,
    region: row.region as Region,
    category: row.category,
    priceRange: row.price_range as PriceRange,
    curationScore: row.curation_score,
    popularityScore: row.popularity_score,
    trendScore: row.trend_score,
    curationComment: row.curation_comment,
    thumbnailUrl: row.thumbnail_url,
    lat: row.lat,
    lng: row.lng,
    tier: (row.tier as 'reference' | 'hidden') ?? 'hidden',
    awards: (row.awards as string[]) ?? [],
    curatorComment: row.curator_comment,
    curatorCommentSource: row.curator_comment_source as 'gemma' | 'claude_fallback' | 'curator_edit' | null,
    curatorCommentRetryCount: row.curator_comment_retry_count ?? 0,
  };
}

const SELECT_COLUMNS = `
  id, kakao_place_id, synthetic_id, name, region, category, price_range,
  curation_score, popularity_score, trend_score, curation_comment, thumbnail_url, lat, lng,
  tier, awards, curator_comment, curator_comment_source, curator_comment_retry_count
`.trim();

// Kakao-verified spots: conflict on kakao_place_id
const KAKAO_UPSERT_SQL = `
  INSERT INTO spots (
    id, kakao_place_id, synthetic_id, name, region, category, price_range,
    curation_score, popularity_score, trend_score, curation_comment,
    thumbnail_url, lat, lng,
    tier, awards, curator_comment, curator_comment_source, curator_comment_retry_count,
    is_active, updated_at
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18,$19,true,now())
  ON CONFLICT (kakao_place_id) DO UPDATE SET
    synthetic_id                = EXCLUDED.synthetic_id,
    name                        = EXCLUDED.name,
    region                      = EXCLUDED.region,
    category                    = EXCLUDED.category,
    price_range                 = EXCLUDED.price_range,
    curation_score              = EXCLUDED.curation_score,
    popularity_score            = EXCLUDED.popularity_score,
    trend_score                 = EXCLUDED.trend_score,
    curation_comment            = EXCLUDED.curation_comment,
    thumbnail_url               = EXCLUDED.thumbnail_url,
    lat                         = EXCLUDED.lat,
    lng                         = EXCLUDED.lng,
    tier                        = EXCLUDED.tier,
    awards                      = EXCLUDED.awards,
    curator_comment             = EXCLUDED.curator_comment,
    curator_comment_source      = EXCLUDED.curator_comment_source,
    curator_comment_retry_count = EXCLUDED.curator_comment_retry_count,
    is_active                   = true,
    updated_at                  = now()
`;

// Synthetic spots (no kakao_place_id): plain INSERT — ApproveCandidateUseCase
// ensures no duplicate via transaction + dedup upstream
const SYNTHETIC_INSERT_SQL = `
  INSERT INTO spots (
    id, kakao_place_id, synthetic_id, name, region, category, price_range,
    curation_score, popularity_score, trend_score, curation_comment,
    thumbnail_url, lat, lng,
    tier, awards, curator_comment, curator_comment_source, curator_comment_retry_count,
    is_active, updated_at
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18,$19,true,now())
`;

function spotParams(spot: Spot): unknown[] {
  return [
    spot.id,
    spot.kakaoPlaceId,
    spot.syntheticId,
    spot.name,
    spot.region,
    spot.category,
    spot.priceRange,
    spot.curationScore,
    spot.popularityScore,
    spot.trendScore,
    spot.curationComment,
    spot.thumbnailUrl,
    spot.lat,
    spot.lng,
    spot.tier,
    JSON.stringify(spot.awards),
    spot.curatorComment,
    spot.curatorCommentSource,
    spot.curatorCommentRetryCount,
  ];
}

export class PostgresSpotRepository implements SpotRepository {
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

  async findById(id: string): Promise<Spot | undefined> {
    return this.withClient(async (client) => {
      const result = await client.query<SpotRow>(
        `SELECT ${SELECT_COLUMNS} FROM spots WHERE id = $1 AND is_active = true`,
        [id],
      );
      const row = result.rows[0];
      return row !== undefined ? rowToSpot(row) : undefined;
    });
  }

  async findByIds(ids: string[]): Promise<Spot[]> {
    if (ids.length === 0) return [];
    return this.withClient(async (client) => {
      const result = await client.query<SpotRow>(
        `SELECT ${SELECT_COLUMNS} FROM spots WHERE id = ANY($1) AND is_active = true`,
        [ids],
      );
      return result.rows.map(rowToSpot);
    });
  }

  async search(query: string, limit = 20): Promise<Spot[]> {
    const pattern = `%${query}%`;
    return this.withClient(async (client) => {
      const result = await client.query<SpotRow>(
        `SELECT ${SELECT_COLUMNS}
         FROM spots
         WHERE is_active = true
           AND (name ILIKE $1 OR category ILIKE $1)
         ORDER BY curation_score DESC
         LIMIT $2`,
        [pattern, limit],
      );
      return result.rows.map(rowToSpot);
    });
  }

  async findTopByCurationScore(limit: number): Promise<Spot[]> {
    return this.withClient(async (client) => {
      const result = await client.query<SpotRow>(
        `SELECT ${SELECT_COLUMNS}
         FROM spots
         WHERE is_active = true
         ORDER BY curation_score DESC
         LIMIT $1`,
        [limit],
      );
      return result.rows.map(rowToSpot);
    });
  }

  async findByRegion(region: Region): Promise<Spot[]> {
    return this.withClient(async (client) => {
      const result = await client.query<SpotRow>(
        `SELECT ${SELECT_COLUMNS}
         FROM spots
         WHERE is_active = true AND region = $1
         ORDER BY curation_score DESC`,
        [region],
      );
      return result.rows.map(rowToSpot);
    });
  }

  async save(spot: Spot): Promise<void> {
    await this.withClient(async (client) => {
      const sql = spot.kakaoPlaceId !== null ? KAKAO_UPSERT_SQL : SYNTHETIC_INSERT_SQL;
      await client.query(sql, spotParams(spot));
    });
  }

  async saveReturningId(spot: Spot): Promise<string> {
    return this.withClient(async (client) => {
      const sql = spot.kakaoPlaceId !== null
        ? `${KAKAO_UPSERT_SQL} RETURNING id`
        : `${SYNTHETIC_INSERT_SQL} RETURNING id`;
      const result = await client.query<{ id: string }>(sql, spotParams(spot));
      return result.rows[0]!.id;
    });
  }

  async findExistingKakaoPlaceIds(kakaoPlaceIds: string[]): Promise<Set<string>> {
    if (kakaoPlaceIds.length === 0) return new Set();
    return this.withClient(async (client) => {
      const result = await client.query<{ kakao_place_id: string }>(
        `SELECT kakao_place_id FROM spots
         WHERE kakao_place_id = ANY($1) AND kakao_place_id IS NOT NULL`,
        [kakaoPlaceIds],
      );
      return new Set(result.rows.map((r) => r.kakao_place_id));
    });
  }

  async findAllActiveIds(): Promise<string[]> {
    return this.withClient(async (client) => {
      const result = await client.query<{ id: string }>(
        `SELECT id FROM spots WHERE is_active = true`,
      );
      return result.rows.map((r) => r.id);
    });
  }

  async deactivate(kakaoPlaceId: string): Promise<void> {
    await this.withClient(async (client) => {
      await client.query(
        `UPDATE spots SET is_active = false, curation_score = 0, updated_at = now()
         WHERE kakao_place_id = $1`,
        [kakaoPlaceId],
      );
    });
  }

  async updateScores(
    updates: { spotId: string; popularityScore: number; trendScore: number }[],
  ): Promise<void> {
    if (updates.length === 0) return;
    for (const u of updates) {
      await this.withClient(async (client) => {
        await client.query(
          `UPDATE spots SET popularity_score = $1, trend_score = $2, updated_at = now()
           WHERE id = $3`,
          [u.popularityScore, u.trendScore, u.spotId],
        );
      });
    }
  }

  async findForEmbedding(spotIds?: string[]): Promise<{ id: string; name: string; introduction: string; tags: string }[]> {
    return this.withClient(async (client) => {
      type EmbedRow = { id: string; name: string; curator_comment: string | null; curation_comment: string | null; category: string };
      let result;
      if (spotIds !== undefined) {
        result = await client.query<EmbedRow>(
          `SELECT id, name, curator_comment, curation_comment, category FROM spots WHERE id = ANY($1) AND is_active = true`,
          [spotIds],
        );
      } else {
        result = await client.query<EmbedRow>(
          `SELECT id, name, curator_comment, curation_comment, category FROM spots WHERE is_active = true AND embedding IS NULL`,
        );
      }
      return result.rows.map((r) => ({
        id: r.id,
        name: r.name,
        introduction: r.curator_comment ?? r.curation_comment ?? '',
        tags: r.category,
      }));
    });
  }

  async saveEmbedding(spotId: string, embedding: number[]): Promise<void> {
    await this.withClient(async (client) => {
      await client.query(
        `UPDATE spots SET embedding = $1::vector WHERE id = $2`,
        [JSON.stringify(embedding), spotId],
      );
    });
  }
}
