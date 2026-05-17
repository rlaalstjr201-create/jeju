import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/interface/api/server.js';
import { runMigrations } from '../../src/infrastructure/persistence/migrationRunner.js';
import { PostgresTravellerRepository } from '../../src/infrastructure/persistence/PostgresTravellerRepository.js';
import { PostgresTripRepository } from '../../src/infrastructure/persistence/PostgresTripRepository.js';
import { PostgresShortlistRepository } from '../../src/infrastructure/persistence/PostgresShortlistRepository.js';
import { PostgresDayPlanRepository } from '../../src/infrastructure/persistence/PostgresDayPlanRepository.js';
import { PostgresSpotRepository } from '../../src/infrastructure/persistence/PostgresSpotRepository.js';
import { PostgresCurationCandidateRepository } from '../../src/infrastructure/persistence/PostgresCurationCandidateRepository.js';
import { PostgresCalibrationProfileRepository } from '../../src/infrastructure/persistence/PostgresCalibrationProfileRepository.js';
import { PostgresTrendSourceRepository } from '../../src/infrastructure/persistence/PostgresTrendSourceRepository.js';
import { PostgresRecommenderAdapter } from '../../src/infrastructure/recommender/PostgresRecommenderAdapter.js';
import { PostgresTransactionManager } from '../../src/infrastructure/persistence/PostgresTransactionManager.js';
import { TravellerAuthService } from '../../src/infrastructure/kakao/TravellerAuthService.js';
import { KakaoLocalPlaceAdapter } from '../../src/infrastructure/kakao/KakaoLocalPlaceAdapter.js';
import { AnthropicLLMEnricherAdapter } from '../../src/infrastructure/llm/AnthropicLLMEnricherAdapter.js';
import { DatalabVisitkoreaAdapter } from '../../src/infrastructure/trend/DatalabVisitkoreaAdapter.js';
import { JejuTourismBigdataAdapter } from '../../src/infrastructure/trend/JejuTourismBigdataAdapter.js';
import { ComposeDayPlanService } from '../../src/application/core-flow/ComposeDayPlanService.js';
import { CreateTripUseCase } from '../../src/application/core-flow/CreateTripUseCase.js';
import { GetRecommendationsUseCase } from '../../src/application/core-flow/GetRecommendationsUseCase.js';
import { UpdateShortlistUseCase } from '../../src/application/core-flow/UpdateShortlistUseCase.js';
import { ComposeDayPlanUseCase } from '../../src/application/core-flow/ComposeDayPlanUseCase.js';
import { EditDayPlanUseCase } from '../../src/application/core-flow/EditDayPlanUseCase.js';
import { DiscoverCandidatesUseCase } from '../../src/application/curation/DiscoverCandidatesUseCase.js';
import { ListCandidatesUseCase } from '../../src/application/curation/ListCandidatesUseCase.js';
import { EnrichCandidateUseCase } from '../../src/application/curation/EnrichCandidateUseCase.js';
import { ApproveCandidateUseCase } from '../../src/application/curation/ApproveCandidateUseCase.js';
import { RejectCandidateUseCase } from '../../src/application/curation/RejectCandidateUseCase.js';
import { AdjustCalibrationUseCase } from '../../src/application/curation/AdjustCalibrationUseCase.js';
import { CalendarDate } from '../../src/domain/shared/CalendarDate.js';
import type { AppDependencies } from '../../src/interface/api/AppDependencies.js';
import type { AuthProvider } from '../../src/infrastructure/kakao/AuthProvider.js';
import type { ParseFreeTextPort } from '../../src/infrastructure/llm/ParseFreeTextPort.js';

// ---------------------------------------------------------------------------
// Docker availability check
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
// Fixture seeding
// ---------------------------------------------------------------------------

interface FixtureSpot {
  id: string;
  kakaoPlaceId: string;
  name: string;
  region: string;
  category: string;
  priceRange: string;
  curationScore: number;
  popularityScore: number;
  curationComment: string | null;
  thumbnailUrl: string | null;
  lat: number;
  lng: number;
  isActive: boolean;
}

async function seedFixtureSpots(pool: Pool): Promise<void> {
  const spots = JSON.parse(
    readFileSync('./tests/fixtures/spots.json', 'utf-8'),
  ) as FixtureSpot[];
  for (const s of spots) {
    await pool.query(
      `INSERT INTO spots (id, kakao_place_id, name, region, category, price_range,
        curation_score, popularity_score, curation_comment, thumbnail_url, lat, lng, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
       ON CONFLICT (kakao_place_id) DO NOTHING`,
      [
        s.id,
        s.kakaoPlaceId,
        s.name,
        s.region,
        s.category,
        s.priceRange,
        s.curationScore,
        s.popularityScore,
        s.curationComment,
        s.thumbnailUrl,
        s.lat,
        s.lng,
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface SpotInDayResponse {
  spotId: string;
  name: string;
  region: string;
  position: number;
  isAutoFilled: boolean;
}

interface DayResponse {
  dayIndex: number;
  date: string;
  spots: SpotInDayResponse[];
}

interface CreateTripResponse {
  tripId: string;
  startDate: string;
  endDate: string;
  dateInferred: boolean;
}

interface ComposeDayPlanResponse {
  dayPlanId: string;
  days: DayResponse[];
  autoFilledSpotIds: string[];
}

interface EditDayResponse {
  dayIndex: number;
  spots: SpotInDayResponse[];
}

// ---------------------------------------------------------------------------
// Main E2E suite
// ---------------------------------------------------------------------------

maybeDescribe('E2E: Tagalong flow', () => {
  let pool: Pool;
  let container: StartedPostgreSqlContainer;
  let fastify: FastifyInstance;
  let recommender: PostgresRecommenderAdapter;

  // Auth mock — returns deterministic KakaoUserInfo from token string
  const authProviderMock: AuthProvider = {
    verifyAccessToken: async (token: string) => ({
      kakaoId: `kakao-${token}`,
      connectedAt: '2026-01-01T00:00:00Z',
    }),
    exchangeCode: async (_code: string, _redirectUri: string) => ({
      accessToken: '',
      refreshToken: '',
      accessTokenExpiresIn: 0,
      refreshTokenExpiresIn: 0,
    }),
    refreshAccessToken: async (_refreshToken: string) => ({
      accessToken: '',
      refreshToken: '',
      accessTokenExpiresIn: 0,
      refreshTokenExpiresIn: 0,
    }),
  };

  // Parse mock — deterministic based on text content
  const parsePortMock: ParseFreeTextPort = {
    parse: async (text: string) => {
      if (text.includes('3박4일') || text.includes('4일')) {
        return {
          startDate: CalendarDate.fromISO('2026-08-01'),
          endDate: CalendarDate.fromISO('2026-08-04'),
          isInferred: false,
          source: 'regex' as const,
        };
      }
      return {
        startDate: CalendarDate.fromISO('2026-08-09'),
        endDate: CalendarDate.fromISO('2026-08-10'),
        isInferred: true,
        source: 'default' as const,
      };
    },
  };

  beforeAll(async () => {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
      .withDatabase('jeju_test')
      .withUsername('test')
      .withPassword('test')
      .start();

    pool = new Pool({ connectionString: container.getConnectionUri() });
    await runMigrations(pool);
    await seedFixtureSpots(pool);

    // Wire up real adapters
    const travellerRepo = new PostgresTravellerRepository(pool);
    const tripRepo = new PostgresTripRepository(pool);
    const shortlistRepo = new PostgresShortlistRepository(pool);
    const dayPlanRepo = new PostgresDayPlanRepository(pool);
    const spotRepo = new PostgresSpotRepository(pool);
    recommender = new PostgresRecommenderAdapter(pool);
    const authService = new TravellerAuthService(authProviderMock, travellerRepo);
    const composeSvc = new ComposeDayPlanService();
    const txManager = new PostgresTransactionManager(pool);

    const candidateRepo = new PostgresCurationCandidateRepository(pool);
    const calibrationRepo = new PostgresCalibrationProfileRepository(pool);
    const trendSourceRepo = new PostgresTrendSourceRepository(pool);
    const llmEnricher = new AnthropicLLMEnricherAdapter(undefined);
    const kakaoLocalApi = new KakaoLocalPlaceAdapter();
    const datalabAdapter = new DatalabVisitkoreaAdapter();
    const ijtoAdapter = new JejuTourismBigdataAdapter();

    const deps: AppDependencies = {
      createTripUseCase: new CreateTripUseCase(authService, parsePortMock, tripRepo),
      getRecommendationsUseCase: new GetRecommendationsUseCase(authService, tripRepo, shortlistRepo, recommender, calibrationRepo),
      updateShortlistUseCase: new UpdateShortlistUseCase(authService, spotRepo, shortlistRepo),
      composeDayPlanUseCase: new ComposeDayPlanUseCase(authService, tripRepo, shortlistRepo, dayPlanRepo, recommender, composeSvc, txManager),
      editDayPlanUseCase: new EditDayPlanUseCase(authService, tripRepo, dayPlanRepo, spotRepo),
      discoverCandidatesUseCase: new DiscoverCandidatesUseCase([datalabAdapter, ijtoAdapter], candidateRepo, spotRepo),
      listCandidatesUseCase: new ListCandidatesUseCase(candidateRepo),
      enrichCandidateUseCase: new EnrichCandidateUseCase(candidateRepo, llmEnricher, kakaoLocalApi),
      approveCandidateUseCase: new ApproveCandidateUseCase(candidateRepo, spotRepo, txManager),
      rejectCandidateUseCase: new RejectCandidateUseCase(candidateRepo, spotRepo, txManager),
      adjustCalibrationUseCase: new AdjustCalibrationUseCase(authService, tripRepo, calibrationRepo),
    };

    fastify = buildServer(deps);
    await fastify.ready();
  }, 120_000);

  afterAll(async () => {
    await fastify.close();
    await pool.end();
    await container.stop();
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // E1 — 3박4일, 8 Spot, Region 클러스터링
  // -------------------------------------------------------------------------

  describe('E1 — 3박4일, 8 spots, region clustering', () => {
    it('distributes spots by region, fills all 4 days, no gap-fill needed', async () => {
      // Step 1: Create trip
      const tripRes = await fastify.inject({
        method: 'POST',
        url: '/api/v1/trips',
        headers: { authorization: 'Bearer e1' },
        body: { freeText: '엄마랑 3박4일' },
      });
      expect(tripRes.statusCode).toBe(201);
      const tripBody = tripRes.json<CreateTripResponse>();
      const tripId = tripBody.tripId;

      // Step 2: Add 8 spots (2 per region, 4 regions)
      const spotIds = [
        '00000001-0000-4000-8000-000000000000',
        '00000002-0000-4000-8000-000000000000',
        '00000004-0000-4000-8000-000000000000',
        '00000005-0000-4000-8000-000000000000',
        '00000007-0000-4000-8000-000000000000',
        '00000008-0000-4000-8000-000000000000',
        '00000009-0000-4000-8000-000000000000',
        '0000000a-0000-4000-8000-000000000000',
      ];
      for (const spotId of spotIds) {
        const r = await fastify.inject({
          method: 'PATCH',
          url: '/api/v1/shortlist',
          headers: { authorization: 'Bearer e1' },
          body: { spotId, action: 'add' },
        });
        expect(r.statusCode).toBe(200);
      }

      // Step 3: Compose day plan
      const dpRes = await fastify.inject({
        method: 'POST',
        url: `/api/v1/trips/${tripId}/dayplan`,
        headers: { authorization: 'Bearer e1' },
      });
      expect(dpRes.statusCode).toBe(201);
      const dpBody = dpRes.json<ComposeDayPlanResponse>();

      // Assertions
      expect(dpBody.days.length).toBe(4);
      expect(dpBody.autoFilledSpotIds.length).toBe(0);

      // Each day's spots must be from the same region
      for (const day of dpBody.days) {
        if (day.spots.length > 0) {
          const regions = new Set(day.spots.map((s) => s.region));
          expect(regions.size).toBe(1);
        }
      }

      // All 4 days have at least 1 spot
      expect(dpBody.days.every((d) => d.spots.length > 0)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // E2 — 날짜 미정, dateInferred:true
  // -------------------------------------------------------------------------

  describe('E2 — 날짜 미정, dateInferred:true', () => {
    it('returns dateInferred=true and default dates when no duration specified', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/v1/trips',
        headers: { authorization: 'Bearer e2' },
        body: { freeText: '제주 가요' },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json<CreateTripResponse>();
      expect(body.dateInferred).toBe(true);
      expect(body.startDate).toBe('2026-08-09');
      expect(body.endDate).toBe('2026-08-10');
    });
  });

  // -------------------------------------------------------------------------
  // E3 — Gap-fill: 1 Spot → 4일 완성, isAutoFilled DB 확인
  // -------------------------------------------------------------------------

  describe('E3 — Gap-fill: 1 spot, 4-day trip, auto-fill 3 spots', () => {
    it('fills 3 empty days via recommender and persists is_auto_filled=true in DB', async () => {
      // Step 1: Create trip
      const tripRes = await fastify.inject({
        method: 'POST',
        url: '/api/v1/trips',
        headers: { authorization: 'Bearer e3' },
        body: { freeText: '엄마랑 3박4일' },
      });
      expect(tripRes.statusCode).toBe(201);
      const tripId = tripRes.json<CreateTripResponse>().tripId;

      // Step 2: Add 1 spot (seogwipo cafe)
      const addRes = await fastify.inject({
        method: 'PATCH',
        url: '/api/v1/shortlist',
        headers: { authorization: 'Bearer e3' },
        body: { spotId: '00000007-0000-4000-8000-000000000000', action: 'add' },
      });
      expect(addRes.statusCode).toBe(200);

      // Step 3: Compose day plan
      const dpRes = await fastify.inject({
        method: 'POST',
        url: `/api/v1/trips/${tripId}/dayplan`,
        headers: { authorization: 'Bearer e3' },
      });
      expect(dpRes.statusCode).toBe(201);
      const dpBody = dpRes.json<ComposeDayPlanResponse>();

      // HTTP response assertions
      expect(dpBody.autoFilledSpotIds.length).toBe(3);
      expect(dpBody.days.every((d) => d.spots.length > 0)).toBe(true);

      // Each auto-filled spot ID should appear in some day with isAutoFilled=true
      for (const autoSpotId of dpBody.autoFilledSpotIds) {
        const allSpots = dpBody.days.flatMap((d) => d.spots);
        const match = allSpots.find((s) => s.spotId === autoSpotId);
        expect(match).toBeDefined();
        expect(match?.isAutoFilled).toBe(true);
      }

      // DB assertion: shortlist_spots has 4 rows, 3 with is_auto_filled=true
      const travellerRow = await pool.query<{ id: string }>(
        'SELECT id FROM travellers WHERE kakao_id = $1',
        ['kakao-e3'],
      );
      const travellerId = travellerRow.rows[0]?.id;
      expect(travellerId).toBeDefined();

      const rows = await pool.query<{ spot_id: string; is_auto_filled: boolean }>(
        'SELECT spot_id, is_auto_filled FROM shortlist_spots WHERE traveller_id = $1 ORDER BY added_at',
        [travellerId],
      );
      expect(rows.rows.length).toBe(4);
      const autoFilledRows = rows.rows.filter((r) => r.is_auto_filled);
      expect(autoFilledRows.length).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // E4 — 충분한 Shortlist, Recommender 미호출
  // -------------------------------------------------------------------------

  describe('E4 — Sufficient shortlist, recommender not called', () => {
    it('does not call recommender when shortlist already covers all days', async () => {
      // Step 1: Create trip
      const tripRes = await fastify.inject({
        method: 'POST',
        url: '/api/v1/trips',
        headers: { authorization: 'Bearer e4' },
        body: { freeText: '엄마랑 3박4일' },
      });
      expect(tripRes.statusCode).toBe(201);
      const tripId = tripRes.json<CreateTripResponse>().tripId;

      // Step 2: Add 4 spots, one per region
      const spotsToAdd = [
        '00000001-0000-4000-8000-000000000000',
        '00000004-0000-4000-8000-000000000000',
        '00000007-0000-4000-8000-000000000000',
        '00000009-0000-4000-8000-000000000000',
      ];
      for (const spotId of spotsToAdd) {
        const r = await fastify.inject({
          method: 'PATCH',
          url: '/api/v1/shortlist',
          headers: { authorization: 'Bearer e4' },
          body: { spotId, action: 'add' },
        });
        expect(r.statusCode).toBe(200);
      }

      // Step 3: Spy on recommender BEFORE composing
      const spy = vi.spyOn(recommender, 'recommendForShortlist');

      // Step 4: Compose day plan
      const dpRes = await fastify.inject({
        method: 'POST',
        url: `/api/v1/trips/${tripId}/dayplan`,
        headers: { authorization: 'Bearer e4' },
      });
      expect(dpRes.statusCode).toBe(201);
      const dpBody = dpRes.json<ComposeDayPlanResponse>();

      // Assertions
      expect(dpBody.autoFilledSpotIds.length).toBe(0);
      expect(dpBody.days.length).toBe(4);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // E5 — Unpin/Repin, Shortlist 잔류 invariant
  // -------------------------------------------------------------------------

  describe('E5 — Unpin/Repin, shortlist invariant', () => {
    it('spot removed from day stays in shortlist, repin brings it back', async () => {
      // Step 1: Create trip
      const tripRes = await fastify.inject({
        method: 'POST',
        url: '/api/v1/trips',
        headers: { authorization: 'Bearer e5' },
        body: { freeText: '엄마랑 3박4일' },
      });
      expect(tripRes.statusCode).toBe(201);
      const tripId = tripRes.json<CreateTripResponse>().tripId;

      // Step 2: Add 4 spots
      const spotsToAdd = [
        '00000001-0000-4000-8000-000000000000',
        '00000004-0000-4000-8000-000000000000',
        '00000007-0000-4000-8000-000000000000',
        '00000009-0000-4000-8000-000000000000',
      ];
      for (const spotId of spotsToAdd) {
        const r = await fastify.inject({
          method: 'PATCH',
          url: '/api/v1/shortlist',
          headers: { authorization: 'Bearer e5' },
          body: { spotId, action: 'add' },
        });
        expect(r.statusCode).toBe(200);
      }

      // Step 3: Compose day plan
      const dpRes = await fastify.inject({
        method: 'POST',
        url: `/api/v1/trips/${tripId}/dayplan`,
        headers: { authorization: 'Bearer e5' },
      });
      expect(dpRes.statusCode).toBe(201);
      const dpBody = dpRes.json<ComposeDayPlanResponse>();

      // Find which spot is in Day 1
      const day1 = dpBody.days.find((d) => d.dayIndex === 1);
      expect(day1).toBeDefined();
      expect(day1!.spots.length).toBeGreaterThan(0);
      const unpinnedSpotId = day1!.spots[0]!.spotId;
      const originalDay1Count = day1!.spots.length;

      // Step 5: Unpin the spot from Day 1
      const unpinRes = await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/trips/${tripId}/dayplan/days/1/spots`,
        headers: { authorization: 'Bearer e5' },
        body: { spotId: unpinnedSpotId, action: 'unpin' },
      });
      expect(unpinRes.statusCode).toBe(200);
      const unpinBody = unpinRes.json<EditDayResponse>();
      expect(unpinBody.spots.length).toBeLessThan(originalDay1Count);

      // Step 6: Shortlist invariant — spot still in shortlist_spots in DB
      const travellerRow = await pool.query<{ id: string }>(
        'SELECT id FROM travellers WHERE kakao_id = $1',
        ['kakao-e5'],
      );
      const travellerId = travellerRow.rows[0]?.id;
      expect(travellerId).toBeDefined();

      const shortlistCheck = await pool.query<{ spot_id: string }>(
        'SELECT spot_id FROM shortlist_spots WHERE traveller_id = $1 AND spot_id = $2',
        [travellerId, unpinnedSpotId],
      );
      expect(shortlistCheck.rows.length).toBe(1);

      // Step 7: Repin — spot returns to Day 1
      const repinRes = await fastify.inject({
        method: 'PATCH',
        url: `/api/v1/trips/${tripId}/dayplan/days/1/spots`,
        headers: { authorization: 'Bearer e5' },
        body: { spotId: unpinnedSpotId, action: 'pin' },
      });
      expect(repinRes.statusCode).toBe(200);
      const repinBody = repinRes.json<EditDayResponse>();
      const repinnedSpotIds = repinBody.spots.map((s) => s.spotId);
      expect(repinnedSpotIds).toContain(unpinnedSpotId);
    });
  });
});
