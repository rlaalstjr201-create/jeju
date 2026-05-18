import type { Pool } from 'pg';
import type { Recommender } from '../../domain/recommender/Recommender.js';
import type { RecommendationContext } from '../../domain/recommender/RecommendationContext.js';
import type { RecommendationResult } from '../../domain/recommender/RecommendationResult.js';
import type { Spot } from '../../domain/spot/Spot.js';
import type { Region } from '../../domain/shared/Region.js';
import type { PriceRange } from '../../domain/shared/PriceRange.js';

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
  };
}

const SELECT_COLUMNS = `
  id, kakao_place_id, synthetic_id, name, region, category, price_range,
  curation_score, popularity_score, trend_score, curation_comment, thumbnail_url, lat, lng
`;

export class PostgresRecommenderAdapter implements Recommender {
  constructor(
    private readonly pool: Pool,
    private readonly limit = 12,
  ) {}

  async recommendForShortlist(context: RecommendationContext): Promise<RecommendationResult> {
    const [curatedSpots, popularSpots] = await Promise.all([
      this.recommendCurated(context),
      this.recommendPopular(context),
    ]);

    // Deduplicate: spots in curatedPicks are excluded from popularSpots
    const curatedIds = new Set(curatedSpots.map((s) => s.id));
    const deduplicatedPopular = popularSpots.filter((s) => !curatedIds.has(s.id));

    return {
      curatedPicks: {
        kind: 'curated',
        spots: curatedSpots,
        coldStart: context.preferences.isEmpty,
      },
      popularSpots: {
        kind: 'popular',
        spots: deduplicatedPopular,
        coldStart: false,
      },
    };
  }

  private async recommendCurated(context: RecommendationContext): Promise<Spot[]> {
    const curatedLimit = Math.round(this.limit * context.calibration.curatedRatio);
    if (curatedLimit === 0) return [];

    if (context.preferences.isEmpty) {
      const result = await this.pool.query<SpotRow>(
        `SELECT ${SELECT_COLUMNS}
         FROM spots
         WHERE is_active = true
         ORDER BY curation_score DESC
         LIMIT $1`,
        [curatedLimit],
      );
      return result.rows.map(rowToSpot);
    }

    return this.warm(context, curatedLimit);
  }

  private async recommendPopular(context: RecommendationContext): Promise<Spot[]> {
    const popularLimit = Math.round(this.limit * context.calibration.popularRatio);
    if (popularLimit === 0) return [];

    const result = await this.pool.query<SpotRow>(
      `SELECT ${SELECT_COLUMNS}
       FROM spots
       WHERE is_active = true
       ORDER BY (popularity_score * 0.6 + trend_score * 0.4) DESC
       LIMIT $1`,
      [popularLimit],
    );
    return result.rows.map(rowToSpot);
  }

  // v1 limitation (ADR-0015): warm path only considers Spots whose category
  // appears in the Traveller's existing Shortlist. Cross-category discoveries
  // are not surfaced until the cold-start or a future embedding-based path.
  private async warm(context: RecommendationContext, curatedLimit: number): Promise<Spot[]> {
    const weights = context.preferences.weights;
    const entries = Object.entries(weights);

    // Build parameterized CASE WHEN clauses.
    // $1 ... $N = alternating category string / weight value pairs
    // $categories = array of categories (ANY clause)
    // $limit = LIMIT value
    //
    // Parameter layout:
    //   For each entry i (0-based):
    //     category param index = 2*i + 1   (1-based)
    //     weight   param index = 2*i + 2   (1-based)
    //   categories array param index = 2*entries.length + 1
    //   limit param index             = 2*entries.length + 2

    const caseWhenClauses: string[] = [];
    const params: (string | number | string[])[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      // noUncheckedIndexedAccess guard
      if (entry === undefined) continue;
      const [category, weight] = entry;
      const catParamIdx = 2 * i + 1;
      const weightParamIdx = 2 * i + 2;
      caseWhenClauses.push(
        `WHEN $${catParamIdx} THEN curation_score * $${weightParamIdx}`,
      );
      params.push(category, weight);
    }

    const categoriesParamIdx = 2 * entries.length + 1;
    const limitParamIdx = 2 * entries.length + 2;

    const categories = entries.map(([cat]) => cat);
    params.push(categories, curatedLimit);

    const sql = `
      SELECT ${SELECT_COLUMNS},
             CASE category
               ${caseWhenClauses.join('\n               ')}
               ELSE curation_score * 0.1
             END AS weighted_score
      FROM spots
      WHERE is_active = true
        AND category = ANY($${categoriesParamIdx})
      ORDER BY weighted_score DESC
      LIMIT $${limitParamIdx}
    `;

    const result = await this.pool.query<SpotRow>(sql, params);
    return result.rows.map(rowToSpot);
  }
}
