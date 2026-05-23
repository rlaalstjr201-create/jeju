import type { Pool } from 'pg';
import type { TripRepository } from '../../domain/ports/TripRepository.js';
import { Trip } from '../../domain/trip/Trip.js';
import { CalendarDate } from '../../domain/shared/CalendarDate.js';
import type { TripPhase } from '../../domain/shared/TripPhase.js';

interface TripRow {
  id: string;
  traveller_id: string;
  start_date: Date;
  end_date: Date;
  phase: string;
  date_inferred: boolean;
  created_at: Date;
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function rowToTrip(row: TripRow): Trip {
  return new Trip({
    id: row.id,
    travellerId: row.traveller_id,
    dateRange: {
      start: CalendarDate.fromISO(toISO(row.start_date)),
      end: CalendarDate.fromISO(toISO(row.end_date)),
    },
    phase: row.phase as TripPhase,
    dateInferred: row.date_inferred,
  });
}

export class PostgresTripRepository implements TripRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: string): Promise<Trip | undefined> {
    const result = await this.pool.query<TripRow>(
      `SELECT id, traveller_id, start_date, end_date, phase, date_inferred, created_at
       FROM trips WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row !== undefined ? rowToTrip(row) : undefined;
  }

  async findByTravellerId(travellerId: string): Promise<Trip[]> {
    const result = await this.pool.query<TripRow>(
      `SELECT id, traveller_id, start_date, end_date, phase, date_inferred, created_at
       FROM trips WHERE traveller_id = $1 ORDER BY created_at DESC`,
      [travellerId],
    );
    return result.rows.map(rowToTrip);
  }

  async save(trip: Trip): Promise<void> {
    await this.pool.query(
      `INSERT INTO trips (id, traveller_id, start_date, end_date, phase, date_inferred)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE
         SET traveller_id  = EXCLUDED.traveller_id,
             start_date    = EXCLUDED.start_date,
             end_date      = EXCLUDED.end_date,
             phase         = EXCLUDED.phase,
             date_inferred = EXCLUDED.date_inferred`,
      [
        trip.id,
        trip.travellerId,
        trip.dateRange.start.toISO(),
        trip.dateRange.end.toISO(),
        trip.phase,
        trip.dateInferred,
      ],
    );
  }
}
