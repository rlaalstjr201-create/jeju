import type { Pool, PoolClient } from 'pg';
import type { ShortlistRepository } from '../../domain/ports/ShortlistRepository.js';
import { transactionContext } from './transactionContext.js';
import { Shortlist } from '../../domain/shortlist/Shortlist.js';
import type { Spot } from '../../domain/spot/Spot.js';
import type { Region } from '../../domain/shared/Region.js';
import type { PriceRange } from '../../domain/shared/PriceRange.js';

interface ShortlistSpotRow {
  spot_id: string;
  kakao_place_id: string;
  name: string;
  region: string;
  category: string;
  price_range: string;
  curation_score: number;
  popularity_score: number;
  curation_comment: string | null;
  thumbnail_url: string | null;
  lat: number;
  lng: number;
  is_auto_filled: boolean;
}

function rowToSpot(row: ShortlistSpotRow): Spot {
  return {
    id: row.spot_id,
    kakaoPlaceId: row.kakao_place_id,
    name: row.name,
    region: row.region as Region,
    category: row.category,
    priceRange: row.price_range as PriceRange,
    curationScore: row.curation_score,
    popularityScore: row.popularity_score,
    curationComment: row.curation_comment,
    thumbnailUrl: row.thumbnail_url,
    lat: row.lat,
    lng: row.lng,
  };
}

export class PostgresShortlistRepository implements ShortlistRepository {
  constructor(private readonly pool: Pool) {}

  private async withClient<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const txClient = transactionContext.getStore();
    if (txClient) {
      return work(txClient);
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async findByTravellerId(travellerId: string): Promise<Shortlist> {
    const result = await this.pool.query<ShortlistSpotRow>(
      `SELECT
         ss.spot_id,
         s.kakao_place_id,
         s.name,
         s.region,
         s.category,
         s.price_range,
         s.curation_score,
         s.popularity_score,
         s.curation_comment,
         s.thumbnail_url,
         s.lat,
         s.lng,
         ss.is_auto_filled
       FROM shortlist_spots ss
       JOIN spots s ON s.id = ss.spot_id
       WHERE ss.traveller_id = $1
       ORDER BY ss.added_at ASC`,
      [travellerId],
    );
    const spots = result.rows.map(rowToSpot);
    return new Shortlist(spots);
  }

  async save(travellerId: string, shortlist: Shortlist, autoFilledSpotIds?: readonly string[]): Promise<void> {
    await this.withClient(async (client) => {
      // Fetch existing rows to preserve is_auto_filled flags
      const existing = await client.query<{
        spot_id: string;
        is_auto_filled: boolean;
      }>(
        'SELECT spot_id, is_auto_filled FROM shortlist_spots WHERE traveller_id = $1',
        [travellerId],
      );
      const existingMap = new Map<string, boolean>(
        existing.rows.map((r) => [r.spot_id, r.is_auto_filled]),
      );

      const desiredIds = new Set(shortlist.spots.map((s) => s.id));

      // Delete spots no longer in shortlist
      const toDelete = [...existingMap.keys()].filter(
        (id) => !desiredIds.has(id),
      );
      if (toDelete.length > 0) {
        await client.query(
          'DELETE FROM shortlist_spots WHERE traveller_id = $1 AND spot_id = ANY($2)',
          [travellerId, toDelete],
        );
      }

      // Upsert current spots (preserve is_auto_filled for existing rows)
      for (const spot of shortlist.spots) {
        const isAutoFilled = existingMap.get(spot.id) ?? autoFilledSpotIds?.includes(spot.id) ?? false;
        await client.query(
          `INSERT INTO shortlist_spots (traveller_id, spot_id, is_auto_filled)
           VALUES ($1, $2, $3)
           ON CONFLICT (traveller_id, spot_id) DO UPDATE
             SET is_auto_filled = EXCLUDED.is_auto_filled`,
          [travellerId, spot.id, isAutoFilled],
        );
      }
    });
  }
}
