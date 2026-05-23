import type { Pool } from 'pg';
import type { CalibrationProfileRepository } from '../../domain/ports/CalibrationProfileRepository.js';
import { CalibrationProfile } from '../../domain/recommender/CalibrationProfile.js';

interface CalibrationRow {
  trip_id: string;
  curated_ratio: number;
  is_user_adjusted: boolean;
}

export class PostgresCalibrationProfileRepository implements CalibrationProfileRepository {
  constructor(private readonly pool: Pool) {}

  async findByTripId(tripId: string): Promise<CalibrationProfile> {
    const result = await this.pool.query<CalibrationRow>(
      `SELECT trip_id, curated_ratio, is_user_adjusted
       FROM calibration_profiles WHERE trip_id = $1`,
      [tripId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      return CalibrationProfile.default();
    }
    return row.is_user_adjusted
      ? CalibrationProfile.fromUserInput(row.curated_ratio)
      : CalibrationProfile.default();
  }

  async save(tripId: string, profile: CalibrationProfile): Promise<void> {
    await this.pool.query(
      `INSERT INTO calibration_profiles (trip_id, curated_ratio, is_user_adjusted, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (trip_id) DO UPDATE SET
         curated_ratio    = EXCLUDED.curated_ratio,
         is_user_adjusted = EXCLUDED.is_user_adjusted,
         updated_at       = now()`,
      [tripId, profile.curatedRatio, profile.isUserAdjusted],
    );
  }
}
