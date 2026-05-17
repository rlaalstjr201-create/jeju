import { describe, it, expect, vi } from 'vitest';
import { GetRecommendationsUseCase, TripNotFoundError, ForbiddenError } from './GetRecommendationsUseCase.js';
import { Shortlist } from '../../domain/shortlist/Shortlist.js';
import { Trip } from '../../domain/trip/Trip.js';
import { CalendarDate } from '../../domain/shared/CalendarDate.js';
import type { Spot } from '../../domain/spot/Spot.js';
import type { Region } from '../../domain/shared/Region.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTraveller(id = 'traveller-1') {
  return { id, kakaoId: 'kakao-1', createdAt: CalendarDate.fromISO('2025-01-01') };
}

function makeTrip(travellerId = 'traveller-1'): Trip {
  return new Trip({
    id: 'trip-1',
    travellerId,
    dateRange: {
      start: CalendarDate.fromISO('2025-07-01'),
      end: CalendarDate.fromISO('2025-07-03'),
    },
    phase: 'planning',
    dateInferred: false,
  });
}

function makeSpot(id: string, region: Region = 'jeju-city'): Spot {
  return {
    id,
    kakaoPlaceId: `kakao-${id}`,
    name: `Spot ${id}`,
    region,
    category: 'beach',
    priceRange: 'free',
    curationScore: 80,
    popularityScore: 70,
    curationComment: null,
    thumbnailUrl: null,
    lat: 33.25,
    lng: 126.5,
  };
}

function makeMocks() {
  const authService = { authenticate: vi.fn() };
  const tripRepository = { findById: vi.fn(), findByTravellerId: vi.fn(), save: vi.fn() };
  const shortlistRepository = { findByTravellerId: vi.fn(), save: vi.fn() };
  const recommender = { recommendForShortlist: vi.fn() };
  return { authService, tripRepository, shortlistRepository, recommender };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GetRecommendationsUseCase', () => {
  it('cold-start: empty shortlist → coldStart: true, spots are paginated', async () => {
    const { authService, tripRepository, shortlistRepository, recommender } = makeMocks();

    const traveller = makeTraveller();
    const trip = makeTrip('traveller-1');
    const spots = [makeSpot('s1'), makeSpot('s2'), makeSpot('s3')];

    authService.authenticate.mockResolvedValue(traveller);
    tripRepository.findById.mockResolvedValue(trip);
    shortlistRepository.findByTravellerId.mockResolvedValue(new Shortlist([]));
    recommender.recommendForShortlist.mockResolvedValue(spots);

    const useCase = new GetRecommendationsUseCase(
      authService as never,
      tripRepository as never,
      shortlistRepository as never,
      recommender as never,
    );
    const result = await useCase.execute({
      accessToken: 'token',
      tripId: 'trip-1',
      limit: 2,
      offset: 0,
    });

    expect(result.coldStart).toBe(true);
    expect(result.total).toBe(3);
    expect(result.spots).toHaveLength(2);
    expect(result.spots[0]?.spotId).toBe('s1');
    expect(result.spots[1]?.spotId).toBe('s2');
  });

  it('warm path: non-empty shortlist → coldStart: false', async () => {
    const { authService, tripRepository, shortlistRepository, recommender } = makeMocks();

    const traveller = makeTraveller();
    const trip = makeTrip('traveller-1');
    const shortlistSpot = makeSpot('existing');
    const recSpots = [makeSpot('s1'), makeSpot('s2')];

    authService.authenticate.mockResolvedValue(traveller);
    tripRepository.findById.mockResolvedValue(trip);
    shortlistRepository.findByTravellerId.mockResolvedValue(new Shortlist([shortlistSpot]));
    recommender.recommendForShortlist.mockResolvedValue(recSpots);

    const useCase = new GetRecommendationsUseCase(
      authService as never,
      tripRepository as never,
      shortlistRepository as never,
      recommender as never,
    );
    const result = await useCase.execute({
      accessToken: 'token',
      tripId: 'trip-1',
      limit: 12,
      offset: 0,
    });

    expect(result.coldStart).toBe(false);
    expect(result.spots).toHaveLength(2);
  });

  it('TripNotFoundError when trip not found', async () => {
    const { authService, tripRepository, shortlistRepository, recommender } = makeMocks();

    authService.authenticate.mockResolvedValue(makeTraveller());
    tripRepository.findById.mockResolvedValue(undefined);

    const useCase = new GetRecommendationsUseCase(
      authService as never,
      tripRepository as never,
      shortlistRepository as never,
      recommender as never,
    );

    await expect(
      useCase.execute({ accessToken: 'token', tripId: 'nonexistent', limit: 12, offset: 0 }),
    ).rejects.toThrow(TripNotFoundError);
  });

  it('ForbiddenError when trip belongs to different traveller', async () => {
    const { authService, tripRepository, shortlistRepository, recommender } = makeMocks();

    // traveller-1 owns the session, but the trip belongs to traveller-2
    authService.authenticate.mockResolvedValue(makeTraveller('traveller-1'));
    tripRepository.findById.mockResolvedValue(makeTrip('traveller-2'));

    const useCase = new GetRecommendationsUseCase(
      authService as never,
      tripRepository as never,
      shortlistRepository as never,
      recommender as never,
    );

    await expect(
      useCase.execute({ accessToken: 'token', tripId: 'trip-1', limit: 12, offset: 0 }),
    ).rejects.toThrow(ForbiddenError);
  });
});
