import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComposeDayPlanService } from './ComposeDayPlanService.js';
import { Shortlist } from '../../domain/shortlist/Shortlist.js';
import { Trip } from '../../domain/trip/Trip.js';
import { CalendarDate } from '../../domain/shared/CalendarDate.js';
import { ShortlistEmptyError } from '../../domain/schedule-composer/ScheduleComposer.js';
import type { Spot } from '../../domain/spot/Spot.js';
import type { Region } from '../../domain/shared/Region.js';

// ---- Helpers ---------------------------------------------------------------

function makeSpot(id: string, region: Region, category = 'beach'): Spot {
  return {
    id,
    kakaoPlaceId: `kakao-${id}`,
    name: `Spot ${id}`,
    region,
    category,
    priceRange: 'free',
    curationScore: 80,
    popularityScore: 70,
    curationComment: null,
    thumbnailUrl: null,
    lat: 33.25,
    lng: 126.5,
  };
}

function makeTrip(dayCount: number): Trip {
  const start = CalendarDate.fromISO('2025-07-01');
  const end = start.addDays(dayCount - 1);
  return new Trip({
    id: 'trip-1',
    travellerId: 'traveller-1',
    dateRange: { start, end },
    phase: 'planning',
    dateInferred: false,
  });
}

function makeShortlist(spots: Spot[]): Shortlist {
  return new Shortlist(spots);
}

// ---- Mocks -----------------------------------------------------------------

function makeMocks() {
  const mockRecommender = { recommendForShortlist: vi.fn() };
  const mockShortlistRepo = { findByTravellerId: vi.fn(), save: vi.fn() };
  const mockDayPlanRepo = {
    findByTripId: vi.fn(),
    save: vi.fn(),
    updatePinnedSpots: vi.fn(),
  };
  // TransactionManager mock: just runs the work function (no real DB transaction)
  const mockTransactionManager = {
    run: vi.fn().mockImplementation((work: () => Promise<unknown>) => work()),
  };
  return { mockRecommender, mockShortlistRepo, mockDayPlanRepo, mockTransactionManager };
}

// ---- Tests -----------------------------------------------------------------

describe('ComposeDayPlanService', () => {
  let service: ComposeDayPlanService;

  beforeEach(() => {
    service = new ComposeDayPlanService();
  });

  // Test 1: No gap-fill needed — spots cover all days
  it('does not call recommender when spots are enough to fill all days', async () => {
    const { mockRecommender, mockShortlistRepo, mockDayPlanRepo, mockTransactionManager } = makeMocks();
    mockDayPlanRepo.save.mockResolvedValue(undefined);

    // 4 spots across 4 distinct regions, 3-day trip → no empty days
    const spots = [
      makeSpot('s1', 'jeju-city'),
      makeSpot('s2', 'eastern'),
      makeSpot('s3', 'seogwipo'),
      makeSpot('s4', 'western'),
    ];
    const shortlist = makeShortlist(spots);
    const trip = makeTrip(3);

    const result = await service.compose({
      travellerId: 'traveller-1',
      shortlist,
      trip,
      recommender: mockRecommender,
      shortlistRepository: mockShortlistRepo,
      dayPlanRepository: mockDayPlanRepo,
      transactionManager: mockTransactionManager,
    });

    expect(mockRecommender.recommendForShortlist).not.toHaveBeenCalled();
    expect(result.autoFilledSpotIds).toEqual([]);
    expect(result.dayPlan.days.length).toBe(3);
  });

  // Test 2: Gap-fill needed — 1-spot shortlist, 2-day trip, recommender provides 1 candidate
  it('fills empty day when recommender returns a suitable candidate', async () => {
    const { mockRecommender, mockShortlistRepo, mockDayPlanRepo, mockTransactionManager } = makeMocks();
    mockShortlistRepo.save.mockResolvedValue(undefined);
    mockDayPlanRepo.save.mockResolvedValue(undefined);

    const originalSpot = makeSpot('s1', 'jeju-city');
    const recommendedSpot = makeSpot('s2', 'seogwipo');

    mockRecommender.recommendForShortlist.mockResolvedValue([recommendedSpot]);

    const shortlist = makeShortlist([originalSpot]);
    const trip = makeTrip(2);

    const result = await service.compose({
      travellerId: 'traveller-1',
      shortlist,
      trip,
      recommender: mockRecommender,
      shortlistRepository: mockShortlistRepo,
      dayPlanRepository: mockDayPlanRepo,
      transactionManager: mockTransactionManager,
    });

    expect(mockRecommender.recommendForShortlist).toHaveBeenCalledOnce();
    expect(mockShortlistRepo.save).toHaveBeenCalledOnce();
    expect(result.autoFilledSpotIds).toEqual(['s2']);
    // Both days should now have at least 1 spot
    const emptyDays = result.dayPlan.days.filter((d) => d.pinnedSpots.length === 0);
    expect(emptyDays.length).toBe(0);
  });

  // Test 3: Gap-fill — recommender returns an already-shortlisted spot → filtered out
  it('filters out already-shortlisted spots from recommendations (partial fill OK)', async () => {
    const { mockRecommender, mockShortlistRepo, mockDayPlanRepo, mockTransactionManager } = makeMocks();
    mockShortlistRepo.save.mockResolvedValue(undefined);
    mockDayPlanRepo.save.mockResolvedValue(undefined);

    const originalSpot = makeSpot('s1', 'jeju-city');
    // Recommender returns the same spot that is already in the shortlist
    mockRecommender.recommendForShortlist.mockResolvedValue([originalSpot]);

    const shortlist = makeShortlist([originalSpot]);
    const trip = makeTrip(2);

    const result = await service.compose({
      travellerId: 'traveller-1',
      shortlist,
      trip,
      recommender: mockRecommender,
      shortlistRepository: mockShortlistRepo,
      dayPlanRepository: mockDayPlanRepo,
      transactionManager: mockTransactionManager,
    });

    // Already-shortlisted spot must be filtered out → no auto-fill
    expect(result.autoFilledSpotIds).toEqual([]);
    // shortlistRepository.save is called (inside the atomic transaction)
    expect(mockShortlistRepo.save).toHaveBeenCalledOnce();
  });

  // Test 4: Gap-fill — recommender returns empty list → no auto-fill, empty day stays empty
  it('produces no auto-fill when recommender returns empty list', async () => {
    const { mockRecommender, mockShortlistRepo, mockDayPlanRepo, mockTransactionManager } = makeMocks();
    mockShortlistRepo.save.mockResolvedValue(undefined);
    mockDayPlanRepo.save.mockResolvedValue(undefined);

    mockRecommender.recommendForShortlist.mockResolvedValue([]);

    const shortlist = makeShortlist([makeSpot('s1', 'jeju-city')]);
    const trip = makeTrip(2);

    const result = await service.compose({
      travellerId: 'traveller-1',
      shortlist,
      trip,
      recommender: mockRecommender,
      shortlistRepository: mockShortlistRepo,
      dayPlanRepository: mockDayPlanRepo,
      transactionManager: mockTransactionManager,
    });

    expect(result.autoFilledSpotIds).toEqual([]);
    // At least one day is still empty
    const emptyDays = result.dayPlan.days.filter((d) => d.pinnedSpots.length === 0);
    expect(emptyDays.length).toBeGreaterThan(0);
  });

  // Test 5: ShortlistEmptyError propagates
  it('propagates ShortlistEmptyError when shortlist has no spots', async () => {
    const { mockRecommender, mockShortlistRepo, mockDayPlanRepo, mockTransactionManager } = makeMocks();

    const shortlist = makeShortlist([]);
    const trip = makeTrip(2);

    await expect(
      service.compose({
        travellerId: 'traveller-1',
        shortlist,
        trip,
        recommender: mockRecommender,
        shortlistRepository: mockShortlistRepo,
        dayPlanRepository: mockDayPlanRepo,
        transactionManager: mockTransactionManager,
      }),
    ).rejects.toThrow(ShortlistEmptyError);

    expect(mockRecommender.recommendForShortlist).not.toHaveBeenCalled();
    expect(mockDayPlanRepo.save).not.toHaveBeenCalled();
  });

  // Test 6: DayPlanRepository.save is called with the correct autoFilledSpotIds
  it('calls dayPlanRepository.save with the correct autoFilledSpotIds', async () => {
    const { mockRecommender, mockShortlistRepo, mockDayPlanRepo, mockTransactionManager } = makeMocks();
    mockShortlistRepo.save.mockResolvedValue(undefined);
    mockDayPlanRepo.save.mockResolvedValue(undefined);

    const originalSpot = makeSpot('s1', 'jeju-city');
    const rec1 = makeSpot('s2', 'seogwipo');
    const rec2 = makeSpot('s3', 'eastern');

    // 1-spot shortlist, 3-day trip → 2 empty days; recommender returns 2 new spots
    mockRecommender.recommendForShortlist.mockResolvedValue([rec1, rec2]);

    const shortlist = makeShortlist([originalSpot]);
    const trip = makeTrip(3);

    const result = await service.compose({
      travellerId: 'traveller-1',
      shortlist,
      trip,
      recommender: mockRecommender,
      shortlistRepository: mockShortlistRepo,
      dayPlanRepository: mockDayPlanRepo,
      transactionManager: mockTransactionManager,
    });

    expect(result.autoFilledSpotIds).toEqual(['s2', 's3']);

    // Verify the repo was called with the exact same ids
    const saveCall = mockDayPlanRepo.save.mock.calls[0];
    expect(saveCall).toBeDefined();
    // saveCall[0] = tripId, saveCall[1] = dayPlan, saveCall[2] = autoFilledSpotIds
    expect(saveCall![2]).toEqual(['s2', 's3']);
  });

  // Test 7: Atomicity — both saves happen inside transactionManager.run()
  it('wraps shortlist and dayplan saves inside a single transactionManager.run call', async () => {
    const { mockRecommender, mockShortlistRepo, mockDayPlanRepo, mockTransactionManager } = makeMocks();
    mockShortlistRepo.save.mockResolvedValue(undefined);
    mockDayPlanRepo.save.mockResolvedValue(undefined);

    mockRecommender.recommendForShortlist.mockResolvedValue([makeSpot('s2', 'seogwipo')]);

    const shortlist = makeShortlist([makeSpot('s1', 'jeju-city')]);
    const trip = makeTrip(2);

    await service.compose({
      travellerId: 'traveller-1',
      shortlist,
      trip,
      recommender: mockRecommender,
      shortlistRepository: mockShortlistRepo,
      dayPlanRepository: mockDayPlanRepo,
      transactionManager: mockTransactionManager,
    });

    // Both saves happened inside exactly one transactionManager.run() call
    expect(mockTransactionManager.run).toHaveBeenCalledOnce();
    expect(mockShortlistRepo.save).toHaveBeenCalledOnce();
    expect(mockDayPlanRepo.save).toHaveBeenCalledOnce();
  });

  // Test 8: Atomicity — if dayplan save fails, error propagates (real DB would roll back shortlist)
  it('propagates error when dayplan save fails inside transaction', async () => {
    const { mockRecommender, mockShortlistRepo, mockDayPlanRepo, mockTransactionManager } = makeMocks();
    mockShortlistRepo.save.mockResolvedValue(undefined);
    mockDayPlanRepo.save.mockRejectedValue(new Error('DB connection lost'));

    mockRecommender.recommendForShortlist.mockResolvedValue([makeSpot('s2', 'seogwipo')]);

    const shortlist = makeShortlist([makeSpot('s1', 'jeju-city')]);
    const trip = makeTrip(2);

    await expect(
      service.compose({
        travellerId: 'traveller-1',
        shortlist,
        trip,
        recommender: mockRecommender,
        shortlistRepository: mockShortlistRepo,
        dayPlanRepository: mockDayPlanRepo,
        transactionManager: mockTransactionManager,
      }),
    ).rejects.toThrow('DB connection lost');

    // Both ops were attempted inside transactionManager.run()
    expect(mockTransactionManager.run).toHaveBeenCalledOnce();
  });
});
