import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../interface/api/server.js';
import type { AppDependencies } from '../../interface/api/AppDependencies.js';
import { ShortlistEmptyError } from '../../domain/schedule-composer/ScheduleComposer.js';
import { TripNotFoundError, ForbiddenError } from '../../application/core-flow/GetRecommendationsUseCase.js';
import { SpotNotFoundError } from '../../application/core-flow/UpdateShortlistUseCase.js';
import { DayNotFoundError } from '../../application/core-flow/EditDayPlanUseCase.js';
import { InvalidDateRangeError } from '../../domain/trip/Trip.js';

function makeDeps(overrides: Partial<AppDependencies> = {}): AppDependencies {
  return {
    createTripUseCase: { execute: vi.fn() } as unknown as AppDependencies['createTripUseCase'],
    getRecommendationsUseCase: { execute: vi.fn() } as unknown as AppDependencies['getRecommendationsUseCase'],
    updateShortlistUseCase: { execute: vi.fn() } as unknown as AppDependencies['updateShortlistUseCase'],
    composeDayPlanUseCase: { execute: vi.fn() } as unknown as AppDependencies['composeDayPlanUseCase'],
    editDayPlanUseCase: { execute: vi.fn() } as unknown as AppDependencies['editDayPlanUseCase'],
    discoverCandidatesUseCase: { execute: vi.fn() } as unknown as AppDependencies['discoverCandidatesUseCase'],
    listCandidatesUseCase: { execute: vi.fn() } as unknown as AppDependencies['listCandidatesUseCase'],
    enrichCandidateUseCase: { execute: vi.fn() } as unknown as AppDependencies['enrichCandidateUseCase'],
    approveCandidateUseCase: { execute: vi.fn() } as unknown as AppDependencies['approveCandidateUseCase'],
    rejectCandidateUseCase: { execute: vi.fn() } as unknown as AppDependencies['rejectCandidateUseCase'],
    adjustCalibrationUseCase: { execute: vi.fn() } as unknown as AppDependencies['adjustCalibrationUseCase'],
    runDiscoveryPipelineUseCase: { execute: vi.fn() } as unknown as AppDependencies['runDiscoveryPipelineUseCase'],
    getCandidateByIdUseCase: { execute: vi.fn() } as unknown as AppDependencies['getCandidateByIdUseCase'],
    patchCandidateCoordinatesUseCase: { execute: vi.fn().mockResolvedValue(undefined) } as unknown as AppDependencies['patchCandidateCoordinatesUseCase'],
    embeddingBatcher: { run: vi.fn(), runSingle: vi.fn() } as unknown as AppDependencies['embeddingBatcher'],
    labelStudioBridge: { handleWebhook: vi.fn(), handleWebhookWithSignature: vi.fn() } as unknown as AppDependencies['labelStudioBridge'],
    ...overrides,
  };
}

describe('POST /api/v1/trips', () => {
  let fastify: FastifyInstance;
  let deps: AppDependencies;

  beforeEach(async () => {
    deps = makeDeps();
    fastify = buildServer(deps);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  it('E1: happy path — 3박4일 제주 가요', async () => {
    vi.mocked(deps.createTripUseCase.execute).mockResolvedValue({
      tripId: 'trip-1',
      startDate: '2026-07-01',
      endDate: '2026-07-04',
      dateInferred: false,
    });

    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/trips',
      headers: { authorization: 'Bearer token1' },
      body: { freeText: '3박4일 제주 가요' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ tripId: string; startDate: string; endDate: string; dateInferred: boolean }>();
    expect(body.tripId).toBe('trip-1');
    expect(body.dateInferred).toBe(false);
    expect(deps.createTripUseCase.execute).toHaveBeenCalledWith({
      accessToken: 'token1',
      freeText: '3박4일 제주 가요',
    });
  });

  it('E2: inferred date — 제주 가요 (no duration)', async () => {
    vi.mocked(deps.createTripUseCase.execute).mockResolvedValue({
      tripId: 'trip-2',
      startDate: '2026-07-05',
      endDate: '2026-07-06',
      dateInferred: true,
    });

    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/trips',
      headers: { authorization: 'Bearer token2' },
      body: { freeText: '제주 가요' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ tripId: string; dateInferred: boolean }>();
    expect(body.tripId).toBe('trip-2');
    expect(body.dateInferred).toBe(true);
  });

  it('generic error → 500 INTERNAL_SERVER_ERROR', async () => {
    vi.mocked(deps.createTripUseCase.execute).mockRejectedValue(new Error('something went wrong'));

    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/trips',
      headers: { authorization: 'Bearer token3' },
      body: { freeText: '제주 여행' },
    });

    expect(res.statusCode).toBe(500);
    const body = res.json<{ code: string }>();
    expect(body.code).toBe('INTERNAL_SERVER_ERROR');
  });

  it('InvalidDateRangeError → 400 INVALID_DATE_RANGE', async () => {
    vi.mocked(deps.createTripUseCase.execute).mockRejectedValue(
      new InvalidDateRangeError('2026-07-04', '2026-07-01'),
    );

    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/trips',
      headers: { authorization: 'Bearer token4' },
      body: { freeText: '잘못된 날짜' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json<{ code: string }>();
    expect(body.code).toBe('INVALID_DATE_RANGE');
  });
});

describe('GET /api/v1/trips/:tripId/recommendations', () => {
  let fastify: FastifyInstance;
  let deps: AppDependencies;

  beforeEach(async () => {
    deps = makeDeps();
    fastify = buildServer(deps);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  it('cold-start — spots empty, coldStart true', async () => {
    vi.mocked(deps.getRecommendationsUseCase.execute).mockResolvedValue({
      curatedPicks: { label: 'curatedPicks', spots: [], coldStart: true },
      popularSpots: { label: 'popularSpots', spots: [], coldStart: false },
      calibration: { curatedRatio: 0.5, popularRatio: 0.5 },
    });

    const res = await fastify.inject({
      method: 'GET',
      url: '/api/v1/trips/trip-1/recommendations',
      headers: { authorization: 'Bearer token1' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ curatedPicks: { coldStart: boolean; spots: unknown[] }; popularSpots: { spots: unknown[] } }>();
    expect(body.curatedPicks.coldStart).toBe(true);
    expect(body.curatedPicks.spots).toHaveLength(0);
  });

  it('warm path with spots', async () => {
    vi.mocked(deps.getRecommendationsUseCase.execute).mockResolvedValue({
      curatedPicks: {
        label: 'curatedPicks',
        spots: [
          {
            spotId: 's1',
            name: '한라산',
            category: '관광명소',
            region: 'hallasan',
            priceRange: 'free',
            curationScore: 95,
            thumbnailUrl: null,
            curationComment: null,
          },
        ],
        coldStart: false,
      },
      popularSpots: { label: 'popularSpots', spots: [], coldStart: false },
      calibration: { curatedRatio: 0.5, popularRatio: 0.5 },
    });

    const res = await fastify.inject({
      method: 'GET',
      url: '/api/v1/trips/trip-1/recommendations',
      headers: { authorization: 'Bearer token1' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ curatedPicks: { spots: Array<{ spotId: string; name: string }>; coldStart: boolean } }>();
    expect(body.curatedPicks.coldStart).toBe(false);
    expect(body.curatedPicks.spots).toHaveLength(1);
    expect(body.curatedPicks.spots[0]?.spotId).toBe('s1');
    expect(body.curatedPicks.spots[0]?.name).toBe('한라산');
  });

  it('TripNotFoundError → 404 TRIP_NOT_FOUND', async () => {
    vi.mocked(deps.getRecommendationsUseCase.execute).mockRejectedValue(new TripNotFoundError());

    const res = await fastify.inject({
      method: 'GET',
      url: '/api/v1/trips/nonexistent/recommendations',
      headers: { authorization: 'Bearer token1' },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json<{ code: string }>();
    expect(body.code).toBe('TRIP_NOT_FOUND');
  });

  it('ForbiddenError → 403 FORBIDDEN', async () => {
    vi.mocked(deps.getRecommendationsUseCase.execute).mockRejectedValue(new ForbiddenError());

    const res = await fastify.inject({
      method: 'GET',
      url: '/api/v1/trips/trip-other/recommendations',
      headers: { authorization: 'Bearer token1' },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json<{ code: string }>();
    expect(body.code).toBe('FORBIDDEN');
  });

  it('(D5) forwards only accessToken + tripId — no limit/offset', async () => {
    vi.mocked(deps.getRecommendationsUseCase.execute).mockResolvedValue({
      curatedPicks: { label: 'curatedPicks', spots: [], coldStart: false },
      popularSpots: { label: 'popularSpots', spots: [], coldStart: false },
      calibration: { curatedRatio: 0.5, popularRatio: 0.5 },
    });

    await fastify.inject({
      method: 'GET',
      url: '/api/v1/trips/trip-1/recommendations',
      headers: { authorization: 'Bearer token1' },
    });

    expect(deps.getRecommendationsUseCase.execute).toHaveBeenCalledWith({
      accessToken: 'token1',
      tripId: 'trip-1',
    });
  });

  it('(D5) ignores legacy limit/offset query params', async () => {
    vi.mocked(deps.getRecommendationsUseCase.execute).mockResolvedValue({
      curatedPicks: { label: 'curatedPicks', spots: [], coldStart: false },
      popularSpots: { label: 'popularSpots', spots: [], coldStart: false },
      calibration: { curatedRatio: 0.5, popularRatio: 0.5 },
    });

    await fastify.inject({
      method: 'GET',
      url: '/api/v1/trips/trip-1/recommendations?limit=8&offset=8',
      headers: { authorization: 'Bearer token1' },
    });

    expect(deps.getRecommendationsUseCase.execute).toHaveBeenCalledWith({
      accessToken: 'token1',
      tripId: 'trip-1',
    });
  });
});

describe('PATCH /api/v1/shortlist', () => {
  let fastify: FastifyInstance;
  let deps: AppDependencies;

  beforeEach(async () => {
    deps = makeDeps();
    fastify = buildServer(deps);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  it('add spot — shortlistCount increases', async () => {
    vi.mocked(deps.updateShortlistUseCase.execute).mockResolvedValue({ shortlistCount: 3 });

    const res = await fastify.inject({
      method: 'PATCH',
      url: '/api/v1/shortlist',
      headers: { authorization: 'Bearer token1' },
      body: { spotId: 'spot-1', action: 'add' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ shortlistCount: number }>();
    expect(body.shortlistCount).toBe(3);
  });

  it('remove spot — shortlistCount decreases', async () => {
    vi.mocked(deps.updateShortlistUseCase.execute).mockResolvedValue({ shortlistCount: 2 });

    const res = await fastify.inject({
      method: 'PATCH',
      url: '/api/v1/shortlist',
      headers: { authorization: 'Bearer token1' },
      body: { spotId: 'spot-1', action: 'remove' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ shortlistCount: number }>();
    expect(body.shortlistCount).toBe(2);
  });

  it('SpotNotFoundError → 404 SPOT_NOT_FOUND', async () => {
    vi.mocked(deps.updateShortlistUseCase.execute).mockRejectedValue(new SpotNotFoundError());

    const res = await fastify.inject({
      method: 'PATCH',
      url: '/api/v1/shortlist',
      headers: { authorization: 'Bearer token1' },
      body: { spotId: 'ghost-spot', action: 'add' },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json<{ code: string }>();
    expect(body.code).toBe('SPOT_NOT_FOUND');
  });
});

describe('POST /api/v1/trips/:tripId/dayplan', () => {
  let fastify: FastifyInstance;
  let deps: AppDependencies;

  beforeEach(async () => {
    deps = makeDeps();
    fastify = buildServer(deps);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  it('E3: gap-fill — autoFilledSpotIds present', async () => {
    vi.mocked(deps.composeDayPlanUseCase.execute).mockResolvedValue({
      dayPlanId: 'dp-1',
      days: [
        {
          dayIndex: 1,
          date: '2026-07-01',
          spots: [{ spotId: 's1', name: '오름', region: 'eastern', position: 0, isAutoFilled: true }],
        },
        { dayIndex: 2, date: '2026-07-02', spots: [] },
      ],
      autoFilledSpotIds: ['s1', 's2', 's3'],
    });

    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/trips/trip-1/dayplan',
      headers: { authorization: 'Bearer token1' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ dayPlanId: string; days: unknown[]; autoFilledSpotIds: string[] }>();
    expect(body.dayPlanId).toBe('dp-1');
    expect(body.autoFilledSpotIds).toHaveLength(3);
  });

  it('E4: no gap-fill — autoFilledSpotIds empty', async () => {
    vi.mocked(deps.composeDayPlanUseCase.execute).mockResolvedValue({
      dayPlanId: 'dp-2',
      days: [
        { dayIndex: 1, date: '2026-07-01', spots: [{ spotId: 's1', name: '성산일출봉', region: 'eastern', position: 0, isAutoFilled: false }] },
      ],
      autoFilledSpotIds: [],
    });

    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/trips/trip-1/dayplan',
      headers: { authorization: 'Bearer token1' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ dayPlanId: string; autoFilledSpotIds: string[] }>();
    expect(body.dayPlanId).toBe('dp-2');
    expect(body.autoFilledSpotIds).toHaveLength(0);
  });

  it('ShortlistEmptyError → 400 SHORTLIST_EMPTY', async () => {
    vi.mocked(deps.composeDayPlanUseCase.execute).mockRejectedValue(new ShortlistEmptyError());

    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/trips/trip-1/dayplan',
      headers: { authorization: 'Bearer token1' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json<{ code: string }>();
    expect(body.code).toBe('SHORTLIST_EMPTY');
  });

  it('TripNotFoundError → 404 TRIP_NOT_FOUND', async () => {
    vi.mocked(deps.composeDayPlanUseCase.execute).mockRejectedValue(new TripNotFoundError());

    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/trips/nonexistent/dayplan',
      headers: { authorization: 'Bearer token1' },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json<{ code: string }>();
    expect(body.code).toBe('TRIP_NOT_FOUND');
  });
});

describe('PATCH /api/v1/trips/:tripId/dayplan/days/:dayIndex/spots', () => {
  let fastify: FastifyInstance;
  let deps: AppDependencies;

  beforeEach(async () => {
    deps = makeDeps();
    fastify = buildServer(deps);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  it('E5: pin spot on Day 1', async () => {
    vi.mocked(deps.editDayPlanUseCase.execute).mockResolvedValue({
      dayIndex: 1,
      spots: [{ spotId: 's1', name: '성산일출봉', region: 'eastern', position: 0, isAutoFilled: false }],
    });

    const res = await fastify.inject({
      method: 'PATCH',
      url: '/api/v1/trips/trip-1/dayplan/days/1/spots',
      headers: { authorization: 'Bearer token1' },
      body: { spotId: 's1', action: 'pin' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ dayIndex: number; spots: Array<{ spotId: string; name: string }> }>();
    expect(body.dayIndex).toBe(1);
    expect(body.spots).toHaveLength(1);
    expect(body.spots[0]?.spotId).toBe('s1');
    expect(body.spots[0]?.name).toBe('성산일출봉');
  });

  it('E5: unpin spot from Day 1', async () => {
    vi.mocked(deps.editDayPlanUseCase.execute).mockResolvedValue({
      dayIndex: 1,
      spots: [],
    });

    const res = await fastify.inject({
      method: 'PATCH',
      url: '/api/v1/trips/trip-1/dayplan/days/1/spots',
      headers: { authorization: 'Bearer token1' },
      body: { spotId: 's1', action: 'unpin' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ dayIndex: number; spots: unknown[] }>();
    expect(body.dayIndex).toBe(1);
    expect(body.spots).toHaveLength(0);
  });

  it('DayNotFoundError → 404 DAY_NOT_FOUND', async () => {
    vi.mocked(deps.editDayPlanUseCase.execute).mockRejectedValue(new DayNotFoundError());

    const res = await fastify.inject({
      method: 'PATCH',
      url: '/api/v1/trips/trip-1/dayplan/days/99/spots',
      headers: { authorization: 'Bearer token1' },
      body: { spotId: 's1', action: 'pin' },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json<{ code: string }>();
    expect(body.code).toBe('DAY_NOT_FOUND');
  });

  it('SpotNotFoundError → 404 SPOT_NOT_FOUND', async () => {
    vi.mocked(deps.editDayPlanUseCase.execute).mockRejectedValue(new SpotNotFoundError());

    const res = await fastify.inject({
      method: 'PATCH',
      url: '/api/v1/trips/trip-1/dayplan/days/1/spots',
      headers: { authorization: 'Bearer token1' },
      body: { spotId: 'ghost', action: 'pin' },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json<{ code: string }>();
    expect(body.code).toBe('SPOT_NOT_FOUND');
  });

  it('TripNotFoundError in editDayPlan → 404 TRIP_NOT_FOUND', async () => {
    vi.mocked(deps.editDayPlanUseCase.execute).mockRejectedValue(new TripNotFoundError());

    const res = await fastify.inject({
      method: 'PATCH',
      url: '/api/v1/trips/nonexistent/dayplan/days/1/spots',
      headers: { authorization: 'Bearer token1' },
      body: { spotId: 's1', action: 'pin' },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json<{ code: string }>();
    expect(body.code).toBe('TRIP_NOT_FOUND');
  });

  it('ForbiddenError in editDayPlan → 403 FORBIDDEN', async () => {
    vi.mocked(deps.editDayPlanUseCase.execute).mockRejectedValue(new ForbiddenError());

    const res = await fastify.inject({
      method: 'PATCH',
      url: '/api/v1/trips/trip-2/dayplan/days/1/spots',
      headers: { authorization: 'Bearer token-other' },
      body: { spotId: 's1', action: 'pin' },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json<{ code: string }>();
    expect(body.code).toBe('FORBIDDEN');
  });

  it('generic error in editDayPlan → 500 INTERNAL_SERVER_ERROR', async () => {
    vi.mocked(deps.editDayPlanUseCase.execute).mockRejectedValue(new Error('unexpected failure'));

    const res = await fastify.inject({
      method: 'PATCH',
      url: '/api/v1/trips/trip-1/dayplan/days/1/spots',
      headers: { authorization: 'Bearer token1' },
      body: { spotId: 's1', action: 'pin' },
    });

    expect(res.statusCode).toBe(500);
    const body = res.json<{ code: string }>();
    expect(body.code).toBe('INTERNAL_SERVER_ERROR');
  });

  it('isAutoFilled flag preserved in pin response — auto-filled spot returns true', async () => {
    vi.mocked(deps.editDayPlanUseCase.execute).mockResolvedValue({
      dayIndex: 1,
      spots: [
        { spotId: 's1', name: '한라산 오름A', region: 'jeju-city', position: 0, isAutoFilled: true },
        { spotId: 's2', name: '제주시 카페A', region: 'jeju-city', position: 1, isAutoFilled: false },
      ],
    });

    const res = await fastify.inject({
      method: 'PATCH',
      url: '/api/v1/trips/trip-1/dayplan/days/1/spots',
      headers: { authorization: 'Bearer token1' },
      body: { spotId: 's2', action: 'pin' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ spots: Array<{ spotId: string; isAutoFilled: boolean }> }>();
    expect(body.spots[0]?.isAutoFilled).toBe(true);
    expect(body.spots[1]?.isAutoFilled).toBe(false);
  });
});
