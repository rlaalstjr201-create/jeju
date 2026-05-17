import type { Pool } from 'pg';
import type { SpotRepository } from '../../domain/ports/SpotRepository.js';
import type { Spot } from '../../domain/spot/Spot.js';
import type { Region } from '../../domain/shared/Region.js';
import type { PriceRange } from '../../domain/shared/PriceRange.js';

interface SpotRow {
  id: string;
  kakao_place_id: string;
  name: string;
  region: string;
  category: string;
  price_range: string;
  curation_score: number;
  popularity_score: number;
  curation_comment: string | null;
  lat: number;
  lng: number;
}

function rowToSpot(row: SpotRow): Spot {
  return {
    id: row.id,
    kakaoPlaceId: row.kakao_place_id,
    name: row.name,
    region: row.region as Region,
    category: row.category,
    priceRange: row.price_range as PriceRange,
    curationScore: row.curation_score,
    popularityScore: row.popularity_score,
    curationComment: row.curation_comment,
    lat: row.lat,
    lng: row.lng,
  };
}

const SELECT_COLUMNS = `
  id, kakao_place_id, name, region, category, price_range,
  curation_score, popularity_score, curation_comment, lat, lng
`;

export class PostgresSpotRepository implements SpotRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: string): Promise<Spot | undefined> {
    const result = await this.pool.query<SpotRow>(
      `SELECT ${SELECT_COLUMNS} FROM spots WHERE id = $1 AND is_active = true`,
      [id],
    );
    const row = result.rows[0];
    return row !== undefined ? rowToSpot(row) : undefined;
  }

  async findByIds(ids: string[]): Promise<Spot[]> {
    if (ids.length === 0) return [];
    const result = await this.pool.query<SpotRow>(
      `SELECT ${SELECT_COLUMNS} FROM spots WHERE id = ANY($1) AND is_active = true`,
      [ids],
    );
    return result.rows.map(rowToSpot);
  }

  async search(query: string, limit = 20): Promise<Spot[]> {
    const pattern = `%${query}%`;
    const result = await this.pool.query<SpotRow>(
      `SELECT ${SELECT_COLUMNS}
       FROM spots
       WHERE is_active = true
         AND (name ILIKE $1 OR category ILIKE $1)
       ORDER BY curation_score DESC
       LIMIT $2`,
      [pattern, limit],
    );
    return result.rows.map(rowToSpot);
  }

  async findTopByCurationScore(limit: number): Promise<Spot[]> {
    const result = await this.pool.query<SpotRow>(
      `SELECT ${SELECT_COLUMNS}
       FROM spots
       WHERE is_active = true
       ORDER BY curation_score DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map(rowToSpot);
  }

  async findByRegion(region: Region): Promise<Spot[]> {
    const result = await this.pool.query<SpotRow>(
      `SELECT ${SELECT_COLUMNS}
       FROM spots
       WHERE is_active = true AND region = $1
       ORDER BY curation_score DESC`,
      [region],
    );
    return result.rows.map(rowToSpot);
  }
}
