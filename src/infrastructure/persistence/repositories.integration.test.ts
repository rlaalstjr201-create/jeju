import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';
import type { StartedTestContainer } from 'testcontainers';
import { runMigrations } from './migrationRunner.js';
import { PostgresTravellerRepository } from './PostgresTravellerRepository.js';
import { PostgresTripRepository } from './PostgresTripRepository.js';
import { PostgresSpotRepository } from './PostgresSpotRepository.js';
import { PostgresShortlistRepository } from './PostgresShortlistRepository.js';
import { PostgresDayPlanRepository } from './PostgresDayPlanRepository.js';
import { CalendarDate } from '../../domain/shared/CalendarDate.js';
import { Trip } from '../../domain/trip/Trip.js';
import { DayPlan } from '../../domain/trip/DayPlan.js';
import { Day } from '../../domain/trip/Day.js';
import { Shortlist } from '../../domain/shortlist/Shortlist.js';
import type { Traveller } from '../../domain/traveller/Traveller.js';
import type { Spot } from '../../domain/spot/Spot.js';

// ---------------------------------------------------------------------------
// Docker availability check (synchronous spawnSync)
// ---------------------------------------------------------------------------

function isDockerAvailable(): boolean {
  try {
    const result = spawnSync('docker', ['info'], { timeout: 5000 });
    return result.status === 0;
  } catch {
    return false;
  }
}

const dockerAvailable = isDockerAvailable();
const maybeDescribe = dockerAvailable ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSpotRow(overrides: Partial<{
  id: string;
  kakaoPlaceId: string;
  name: string;
  region: string;
  category: string;
  priceRange: string;
  curationScore: number;
  popularityScore: number;
  lat: number;
  lng: number;
}>): Spot {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    kakaoPlaceId: overrides.kakaoPlaceId ?? `kp-${crypto.randomUUID()}`,
    name: overrides.name ?? 'Test Spot',
    region: (overrides.region ?? 'jeju-city') as Spot['region'],
    category: overrides.category ?? 'restaurant',
    priceRange: (overrides.priceRange ?? 'mid') as Spot['priceRange'],
    curationScore: overrides.curationScore ?? 50,
    popularityScore: overrides.popularityScore ?? 30,
    curationComment: null,
    thumbnailUrl: null,
    trendScore: 0,
    lat: overrides.lat ?? 33.4996,
    lng: overrides.lng ?? 126.5312,
  };
}

async function insertSpot(pool: Pool, spot: Spot): Promise<void> {
  await pool.query(
    `INSERT INTO spots
       (id, kakao_place_id, name, region, category, price_range,
        curation_score, popularity_score, lat, lng, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())`,
    [
      spot.id,
      spot.kakaoPlaceId,
      spot.name,
      spot.region,
      spot.category,
      spot.priceRange,
      spot.curationScore,
      spot.popularityScore,
      spot.lat,
      spot.lng,
    ],
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

maybeDescribe('Repository integration tests', () => {
  // These are assigned in beforeAll before any test runs
  let pool!: Pool;
  let container!: StartedTestContainer & { getConnectionUri(): string };

  beforeAll(async () => {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
      .withDatabase('jeju_test')
      .withUsername('test')
      .withPassword('test')
      .start();

    pool = new Pool({ connectionString: container.getConnectionUri() });
    await runMigrations(pool);
  }, 120_000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  }, 30_000);

  // -------------------------------------------------------------------------
  // TravellerRepository
  // -------------------------------------------------------------------------

  describe('TravellerRepository', () => {
    let repo!: PostgresTravellerRepository;
    let saved!: Traveller;

    beforeAll(() => {
      repo = new PostgresTravellerRepository(pool);
      saved = {
        id: crypto.randomUUID(),
        kakaoId: `kakao-${crypto.randomUUID()}`,
        createdAt: CalendarDate.fromISO('2024-01-15'),
      };
    });

    it('save new Traveller then findById returns it', async () => {
      await repo.save(saved);
      const found = await repo.findById(saved.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(saved.id);
      expect(found?.kakaoId).toBe(saved.kakaoId);
    });

    it('findByKakaoId returns correct Traveller', async () => {
      const found = await repo.findByKakaoId(saved.kakaoId);
      expect(found).toBeDefined();
      expect(found?.id).toBe(saved.id);
    });

    it('findById with unknown id returns undefined', async () => {
      const found = await repo.findById(crypto.randomUUID());
      expect(found).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // TripRepository
  // -------------------------------------------------------------------------

  describe('TripRepository', () => {
    let repo!: PostgresTripRepository;
    let travellerRepo!: PostgresTravellerRepository;
    let traveller!: Traveller;
    let trip!: Trip;

    beforeAll(async () => {
      repo = new PostgresTripRepository(pool);
      travellerRepo = new PostgresTravellerRepository(pool);

      traveller = {
        id: crypto.randomUUID(),
        kakaoId: `kakao-trip-${crypto.randomUUID()}`,
        createdAt: CalendarDate.fromISO('2024-02-01'),
      };
      await travellerRepo.save(traveller);

      trip = new Trip({
        id: crypto.randomUUID(),
        travellerId: traveller.id,
        dateRange: {
          start: CalendarDate.fromISO('2024-06-01'),
          end: CalendarDate.fromISO('2024-06-04'),
        },
        phase: 'planning',
        dateInferred: false,
      });
    });

    it('save Trip then findById returns it with correct dayCount', async () => {
      await repo.save(trip);
      const found = await repo.findById(trip.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(trip.id);
      expect(found?.travellerId).toBe(traveller.id);
      expect(found?.dayCount).toBe(4); // Jun 1 - Jun 4 inclusive
      expect(found?.phase).toBe('planning');
    });

    it('findByTravellerId returns all trips for traveller', async () => {
      const trips = await repo.findByTravellerId(traveller.id);
      expect(trips.length).toBeGreaterThanOrEqual(1);
      expect(trips.some((t) => t.id === trip.id)).toBe(true);
    });

    it('date_inferred flag round-trips correctly', async () => {
      const inferredTrip = new Trip({
        id: crypto.randomUUID(),
        travellerId: traveller.id,
        dateRange: {
          start: CalendarDate.fromISO('2024-07-01'),
          end: CalendarDate.fromISO('2024-07-02'),
        },
        phase: 'planning',
        dateInferred: true,
      });
      await repo.save(inferredTrip);
      const found = await repo.findById(inferredTrip.id);
      expect(found?.dateInferred).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // SpotRepository
  // -------------------------------------------------------------------------

  describe('SpotRepository', () => {
    let repo!: PostgresSpotRepository;
    let seogwipoSpot!: Spot;
    let topSpot!: Spot;

    beforeAll(async () => {
      repo = new PostgresSpotRepository(pool);

      topSpot = makeSpotRow({ region: 'jeju-city', curationScore: 100 });
      seogwipoSpot = makeSpotRow({ region: 'seogwipo', curationScore: 80 });
      const jejuCitySpot = makeSpotRow({ region: 'jeju-city', curationScore: 70 });

      // Insert 6 extra spots with lower scores to ensure top-5 filtering works
      for (let i = 0; i < 6; i++) {
        await insertSpot(
          pool,
          makeSpotRow({ region: 'eastern', curationScore: i }),
        );
      }
      await insertSpot(pool, topSpot);
      await insertSpot(pool, seogwipoSpot);
      await insertSpot(pool, jejuCitySpot);
    });

    it('findTopByCurationScore(5) returns top 5 by score', async () => {
      const spots = await repo.findTopByCurationScore(5);
      expect(spots.length).toBe(5);
      // Scores should be descending
      for (let i = 1; i < spots.length; i++) {
        expect(spots[i - 1]!.curationScore).toBeGreaterThanOrEqual(
          spots[i]!.curationScore,
        );
      }
      // topSpot (score 100) should be first
      expect(spots[0]?.id).toBe(topSpot.id);
    });

    it('findByRegion("seogwipo") returns only seogwipo spots', async () => {
      const spots = await repo.findByRegion('seogwipo');
      expect(spots.length).toBeGreaterThanOrEqual(1);
      for (const spot of spots) {
        expect(spot.region).toBe('seogwipo');
      }
      expect(spots.some((s) => s.id === seogwipoSpot.id)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // ShortlistRepository
  // -------------------------------------------------------------------------

  describe('ShortlistRepository', () => {
    let repo!: PostgresShortlistRepository;
    let travellerRepo!: PostgresTravellerRepository;
    let traveller!: Traveller;
    let spot1!: Spot;
    let spot2!: Spot;

    beforeAll(async () => {
      repo = new PostgresShortlistRepository(pool);
      travellerRepo = new PostgresTravellerRepository(pool);

      traveller = {
        id: crypto.randomUUID(),
        kakaoId: `kakao-sl-${crypto.randomUUID()}`,
        createdAt: CalendarDate.fromISO('2024-03-01'),
      };
      await travellerRepo.save(traveller);

      spot1 = makeSpotRow({ name: 'SL Spot 1' });
      spot2 = makeSpotRow({ name: 'SL Spot 2' });
      await insertSpot(pool, spot1);
      await insertSpot(pool, spot2);
    });

    it('save empty Shortlist then retrieve empty', async () => {
      const empty = new Shortlist([]);
      await repo.save(traveller.id, empty);
      const retrieved = await repo.findByTravellerId(traveller.id);
      expect(retrieved.spots.length).toBe(0);
    });

    it('add spots, save, retrieve — spots present', async () => {
      const shortlist = new Shortlist([spot1, spot2]);
      await repo.save(traveller.id, shortlist);
      const retrieved = await repo.findByTravellerId(traveller.id);
      expect(retrieved.spots.length).toBe(2);
      const ids = retrieved.spots.map((s) => s.id);
      expect(ids).toContain(spot1.id);
      expect(ids).toContain(spot2.id);
    });

    it('is_auto_filled flag can be set directly in DB and persists', async () => {
      // Set is_auto_filled = true for spot1 directly
      await pool.query(
        'UPDATE shortlist_spots SET is_auto_filled = true WHERE traveller_id = $1 AND spot_id = $2',
        [traveller.id, spot1.id],
      );
      // Re-save with same spots — should preserve the flag (save reads existing map)
      const shortlist = new Shortlist([spot1, spot2]);
      await repo.save(traveller.id, shortlist);
      const row = await pool.query<{ is_auto_filled: boolean }>(
        'SELECT is_auto_filled FROM shortlist_spots WHERE traveller_id = $1 AND spot_id = $2',
        [traveller.id, spot1.id],
      );
      expect(row.rows[0]?.is_auto_filled).toBe(true);
    });

    it('autoFilledSpotIds marks those spots true, others false (ADR-0014)', async () => {
      const t2 = {
        id: crypto.randomUUID(),
        kakaoId: `kakao-af-${crypto.randomUUID()}`,
        createdAt: CalendarDate.fromISO('2024-03-01'),
      };
      await travellerRepo.save(t2);
      const autoSpot = makeSpotRow({ name: 'Auto Spot' });
      const manualSpot = makeSpotRow({ name: 'Manual Spot' });
      await insertSpot(pool, autoSpot);
      await insertSpot(pool, manualSpot);

      await repo.save(t2.id, new Shortlist([autoSpot, manualSpot]), [autoSpot.id]);

      const [autoRow, manualRow] = await Promise.all([
        pool.query<{ is_auto_filled: boolean }>(
          'SELECT is_auto_filled FROM shortlist_spots WHERE traveller_id = $1 AND spot_id = $2',
          [t2.id, autoSpot.id],
        ),
        pool.query<{ is_auto_filled: boolean }>(
          'SELECT is_auto_filled FROM shortlist_spots WHERE traveller_id = $1 AND spot_id = $2',
          [t2.id, manualSpot.id],
        ),
      ]);
      expect(autoRow.rows[0]?.is_auto_filled).toBe(true);
      expect(manualRow.rows[0]?.is_auto_filled).toBe(false);
    });

    it('is_auto_filled stays true after re-save without autoFilledSpotIds — sticky (ADR-0014)', async () => {
      const t3 = {
        id: crypto.randomUUID(),
        kakaoId: `kakao-sticky-${crypto.randomUUID()}`,
        createdAt: CalendarDate.fromISO('2024-03-01'),
      };
      await travellerRepo.save(t3);
      const stickySpot = makeSpotRow({ name: 'Sticky Spot' });
      await insertSpot(pool, stickySpot);

      // First save: mark as auto-filled
      await repo.save(t3.id, new Shortlist([stickySpot]), [stickySpot.id]);
      // Second save: same spot, no autoFilledSpotIds — existingMap + GREATEST must preserve true
      await repo.save(t3.id, new Shortlist([stickySpot]));

      const row = await pool.query<{ is_auto_filled: boolean }>(
        'SELECT is_auto_filled FROM shortlist_spots WHERE traveller_id = $1 AND spot_id = $2',
        [t3.id, stickySpot.id],
      );
      expect(row.rows[0]?.is_auto_filled).toBe(true);
    });

    it('manually added Spot keeps is_auto_filled = false (ADR-0014)', async () => {
      const t4 = {
        id: crypto.randomUUID(),
        kakaoId: `kakao-manual-${crypto.randomUUID()}`,
        createdAt: CalendarDate.fromISO('2024-03-01'),
      };
      await travellerRepo.save(t4);
      const userSpot = makeSpotRow({ name: 'User-added Spot' });
      await insertSpot(pool, userSpot);

      await repo.save(t4.id, new Shortlist([userSpot]));

      const row = await pool.query<{ is_auto_filled: boolean }>(
        'SELECT is_auto_filled FROM shortlist_spots WHERE traveller_id = $1 AND spot_id = $2',
        [t4.id, userSpot.id],
      );
      expect(row.rows[0]?.is_auto_filled).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // DayPlanRepository
  // -------------------------------------------------------------------------

  describe('DayPlanRepository', () => {
    let repo!: PostgresDayPlanRepository;
    let travellerRepo!: PostgresTravellerRepository;
    let tripRepo!: PostgresTripRepository;
    let traveller!: Traveller;
    let trip!: Trip;
    let spotA!: Spot;
    let spotB!: Spot;
    let spotC!: Spot;
    let spotD!: Spot;

    beforeAll(async () => {
      repo = new PostgresDayPlanRepository(pool);
      travellerRepo = new PostgresTravellerRepository(pool);
      tripRepo = new PostgresTripRepository(pool);

      traveller = {
        id: crypto.randomUUID(),
        kakaoId: `kakao-dp-${crypto.randomUUID()}`,
        createdAt: CalendarDate.fromISO('2024-04-01'),
      };
      await travellerRepo.save(traveller);

      trip = new Trip({
        id: crypto.randomUUID(),
        travellerId: traveller.id,
        dateRange: {
          start: CalendarDate.fromISO('2024-08-01'),
          end: CalendarDate.fromISO('2024-08-03'),
        },
        phase: 'planning',
        dateInferred: false,
      });
      await tripRepo.save(trip);

      spotA = makeSpotRow({ name: 'DP Spot A' });
      spotB = makeSpotRow({ name: 'DP Spot B' });
      spotC = makeSpotRow({ name: 'DP Spot C' });
      spotD = makeSpotRow({ name: 'DP Spot D' });
      await insertSpot(pool, spotA);
      await insertSpot(pool, spotB);
      await insertSpot(pool, spotC);
      await insertSpot(pool, spotD);
    });

    it('save DayPlan with 3 Days then findByTripId returns correct structure', async () => {
      const day1 = new Day({
        dayIndex: 1,
        date: CalendarDate.fromISO('2024-08-01'),
      });
      day1.pin(spotA);

      const day2 = new Day({
        dayIndex: 2,
        date: CalendarDate.fromISO('2024-08-02'),
      });
      day2.pin(spotB);

      const day3 = new Day({
        dayIndex: 3,
        date: CalendarDate.fromISO('2024-08-03'),
      });
      day3.pin(spotC);

      const dayPlan = new DayPlan({
        id: crypto.randomUUID(),
        days: [day1, day2, day3],
      });

      await repo.save(trip.id, dayPlan);

      const found = await repo.findByTripId(trip.id);
      expect(found).toBeDefined();
      expect(found?.days.length).toBe(3);

      const foundDay1 = found?.dayAt(1);
      expect(foundDay1).toBeDefined();
      expect(foundDay1?.pinnedSpots.length).toBe(1);
      expect(foundDay1?.pinnedSpots[0]?.spot.id).toBe(spotA.id);

      const foundDay2 = found?.dayAt(2);
      expect(foundDay2?.pinnedSpots[0]?.spot.id).toBe(spotB.id);

      const foundDay3 = found?.dayAt(3);
      expect(foundDay3?.pinnedSpots[0]?.spot.id).toBe(spotC.id);
    });

    it('update — pin new Spot to Day 2, retrieve — Spot present', async () => {
      const current = await repo.findByTripId(trip.id);
      expect(current).toBeDefined();

      // Pin spotD to day 2 in addition to spotB
      const day2 = current!.dayAt(2);
      expect(day2).toBeDefined();
      day2!.pin(spotD);

      await repo.updatePinnedSpots(current!);

      const updated = await repo.findByTripId(trip.id);
      const updatedDay2 = updated?.dayAt(2);
      expect(updatedDay2?.pinnedSpots.length).toBe(2);
      const pinnedIds = updatedDay2!.pinnedSpots.map((ps) => ps.spot.id);
      expect(pinnedIds).toContain(spotB.id);
      expect(pinnedIds).toContain(spotD.id);
    });
  });
});
