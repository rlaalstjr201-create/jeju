import type { Pool } from 'pg';
import type { DayPlanRepository } from '../../domain/ports/DayPlanRepository.js';
import { DayPlan } from '../../domain/trip/DayPlan.js';
import { Day } from '../../domain/trip/Day.js';
import type { Spot } from '../../domain/spot/Spot.js';
import { CalendarDate } from '../../domain/shared/CalendarDate.js';
import type { Region } from '../../domain/shared/Region.js';
import type { PriceRange } from '../../domain/shared/PriceRange.js';

interface DayPlanRow {
  id: string;
  trip_id: string;
  created_at: Date;
}

interface DayRow {
  id: string;
  day_plan_id: string;
  day_index: number;
  date: Date;
}

interface PinnedSpotRow {
  day_id: string;
  spot_id: string;
  position: number;
  is_auto_filled: boolean;
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
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function rowToSpot(row: PinnedSpotRow): Spot {
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

export class PostgresDayPlanRepository implements DayPlanRepository {
  constructor(private readonly pool: Pool) {}

  async findByTripId(tripId: string): Promise<DayPlan | undefined> {
    // Load day_plan row
    const planResult = await this.pool.query<DayPlanRow>(
      'SELECT id, trip_id, created_at FROM day_plans WHERE trip_id = $1',
      [tripId],
    );
    const planRow = planResult.rows[0];
    if (planRow === undefined) return undefined;

    // Load days
    const daysResult = await this.pool.query<DayRow>(
      'SELECT id, day_plan_id, day_index, date FROM days WHERE day_plan_id = $1 ORDER BY day_index ASC',
      [planRow.id],
    );

    if (daysResult.rows.length === 0) {
      return new DayPlan({ id: planRow.id, days: [] });
    }

    const dayIds = daysResult.rows.map((r) => r.id);

    // Load pinned spots for all days in one query
    const pinnedResult = await this.pool.query<PinnedSpotRow>(
      `SELECT
         ps.day_id,
         ps.spot_id,
         ps.position,
         ps.is_auto_filled,
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
         s.lng
       FROM pinned_spots ps
       JOIN spots s ON s.id = ps.spot_id
       WHERE ps.day_id = ANY($1)
       ORDER BY ps.day_id, ps.position ASC`,
      [dayIds],
    );

    // Group pinned spots by day_id
    const pinnedByDayId = new Map<string, PinnedSpotRow[]>();
    for (const row of pinnedResult.rows) {
      const existing = pinnedByDayId.get(row.day_id);
      if (existing !== undefined) {
        existing.push(row);
      } else {
        pinnedByDayId.set(row.day_id, [row]);
      }
    }

    const days: Day[] = daysResult.rows.map((dayRow) => {
      const day = new Day({
        dayIndex: dayRow.day_index,
        date: CalendarDate.fromISO(toISO(dayRow.date)),
      });
      const pinnedRows = pinnedByDayId.get(dayRow.id) ?? [];
      for (const pr of pinnedRows) {
        day.pin(rowToSpot(pr));
      }
      return day;
    });

    return new DayPlan({ id: planRow.id, days });
  }

  async save(tripId: string, dayPlan: DayPlan, autoFilledSpotIds?: readonly string[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Upsert day_plan
      await client.query(
        `INSERT INTO day_plans (id, trip_id)
         VALUES ($1, $2)
         ON CONFLICT (trip_id) DO UPDATE SET id = EXCLUDED.id`,
        [dayPlan.id, tripId],
      );

      for (const day of dayPlan.days) {
        // Upsert day — get or create the UUID for this day
        const dayInsert = await client.query<{ id: string }>(
          `INSERT INTO days (day_plan_id, day_index, date)
           VALUES ($1, $2, $3)
           ON CONFLICT (day_plan_id, day_index) DO UPDATE
             SET date = EXCLUDED.date
           RETURNING id`,
          [dayPlan.id, day.dayIndex, day.date.toISO()],
        );
        const dayId = dayInsert.rows[0]?.id;
        if (dayId === undefined) {
          throw new Error(
            `Failed to upsert day ${day.dayIndex} for day_plan ${dayPlan.id}`,
          );
        }

        // Delete existing pinned spots then re-insert
        await client.query('DELETE FROM pinned_spots WHERE day_id = $1', [
          dayId,
        ]);
        for (let i = 0; i < day.pinnedSpots.length; i++) {
          const spot = day.pinnedSpots[i];
          if (spot === undefined) continue;
          const isAutoFilled = autoFilledSpotIds?.includes(spot.id) ?? false;
          await client.query(
            `INSERT INTO pinned_spots (day_id, spot_id, position, is_auto_filled)
             VALUES ($1, $2, $3, $4)`,
            [dayId, spot.id, i, isAutoFilled],
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updatePinnedSpots(dayPlan: DayPlan): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const day of dayPlan.days) {
        // Resolve the UUID for this day by (day_plan_id, day_index)
        const dayResult = await client.query<{ id: string }>(
          'SELECT id FROM days WHERE day_plan_id = $1 AND day_index = $2',
          [dayPlan.id, day.dayIndex],
        );
        const dayRow = dayResult.rows[0];
        if (dayRow === undefined) continue;

        await client.query('DELETE FROM pinned_spots WHERE day_id = $1', [
          dayRow.id,
        ]);
        for (let i = 0; i < day.pinnedSpots.length; i++) {
          const spot = day.pinnedSpots[i];
          if (spot === undefined) continue;
          await client.query(
            `INSERT INTO pinned_spots (day_id, spot_id, position)
             VALUES ($1, $2, $3)`,
            [dayRow.id, spot.id, i],
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
