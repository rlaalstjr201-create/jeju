import type { Pool } from 'pg';
import type { TravellerRepository } from '../../domain/ports/TravellerRepository.js';
import type { Traveller } from '../../domain/traveller/Traveller.js';
import { CalendarDate } from '../../domain/shared/CalendarDate.js';

interface TravellerRow {
  id: string;
  kakao_id: string;
  created_at: Date;
}

function rowToTraveller(row: TravellerRow): Traveller {
  return {
    id: row.id,
    kakaoId: row.kakao_id,
    // created_at from Postgres DATE/TIMESTAMPTZ comes as a JS Date; format to YYYY-MM-DD
    createdAt: CalendarDate.fromISO(row.created_at.toISOString().slice(0, 10)),
  };
}

export class PostgresTravellerRepository implements TravellerRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: string): Promise<Traveller | undefined> {
    const result = await this.pool.query<TravellerRow>(
      'SELECT id, kakao_id, created_at FROM travellers WHERE id = $1',
      [id],
    );
    const row = result.rows[0];
    return row !== undefined ? rowToTraveller(row) : undefined;
  }

  async findByKakaoId(kakaoId: string): Promise<Traveller | undefined> {
    const result = await this.pool.query<TravellerRow>(
      'SELECT id, kakao_id, created_at FROM travellers WHERE kakao_id = $1',
      [kakaoId],
    );
    const row = result.rows[0];
    return row !== undefined ? rowToTraveller(row) : undefined;
  }

  async save(traveller: Traveller): Promise<void> {
    await this.pool.query(
      `INSERT INTO travellers (id, kakao_id, created_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE
         SET kakao_id = EXCLUDED.kakao_id`,
      [traveller.id, traveller.kakaoId, traveller.createdAt.toISO()],
    );
  }
}
