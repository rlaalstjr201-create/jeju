import type { Pool } from 'pg';
import type { TrendSourceRepository } from '../../domain/ports/TrendSourceRepository.js';

export class PostgresTrendSourceRepository implements TrendSourceRepository {
  constructor(private readonly pool: Pool) {}

  async getStatus(sourceName: string): Promise<{ consecutiveFailures: number } | null> {
    const result = await this.pool.query<{ consecutive_failures: number }>(
      `SELECT consecutive_failures FROM trend_sources WHERE source_name = $1`,
      [sourceName],
    );
    const row = result.rows[0];
    return row !== undefined ? { consecutiveFailures: row.consecutive_failures } : null;
  }

  async updateStatus(
    sourceName: string,
    status: 'success' | 'failure',
    consecutiveFailures: number,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO trend_sources (source_name, last_fetched_at, last_status, consecutive_failures, updated_at)
       VALUES ($1, now(), $2, $3, now())
       ON CONFLICT (source_name) DO UPDATE SET
         last_fetched_at      = now(),
         last_status          = EXCLUDED.last_status,
         consecutive_failures = EXCLUDED.consecutive_failures,
         updated_at           = now()`,
      [sourceName, status, consecutiveFailures],
    );
  }
}
