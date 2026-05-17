import { describe, it, expect, vi } from 'vitest';
import { UpdateShortlistUseCase, SpotNotFoundError } from './UpdateShortlistUseCase.js';
import { Shortlist } from '../../domain/shortlist/Shortlist.js';
import { CalendarDate } from '../../domain/shared/CalendarDate.js';
import type { Spot } from '../../domain/spot/Spot.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTraveller(id = 'traveller-1') {
  return { id, kakaoId: 'kakao-1', createdAt: CalendarDate.fromISO('2025-01-01') };
}

function makeSpot(id: string): Spot {
  return {
    id,
    kakaoPlaceId: `kakao-${id}`,
    name: `Spot ${id}`,
    region: 'jeju-city',
    category: 'beach',
    priceRange: 'free',
    curationScore: 80,
    popularityScore: 70,
    trendScore: 0,
    curationComment: null,
    thumbnailUrl: null,
    lat: 33.25,
    lng: 126.5,
  };
}

function makeMocks() {
  const authService = { authenticate: vi.fn() };
  const spotRepository = {
    findById: vi.fn(),
    findByIds: vi.fn(),
    search: vi.fn(),
    findTopByCurationScore: vi.fn(),
    findByRegion: vi.fn(),
  };
  const shortlistRepository = { findByTravellerId: vi.fn(), save: vi.fn() };
  return { authService, spotRepository, shortlistRepository };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UpdateShortlistUseCase', () => {
  it('add action: shortlistCount incremented', async () => {
    const { authService, spotRepository, shortlistRepository } = makeMocks();

    const traveller = makeTraveller();
    const spot = makeSpot('spot-1');

    authService.authenticate.mockResolvedValue(traveller);
    spotRepository.findById.mockResolvedValue(spot);
    shortlistRepository.findByTravellerId.mockResolvedValue(new Shortlist([]));
    shortlistRepository.save.mockResolvedValue(undefined);

    const useCase = new UpdateShortlistUseCase(
      authService as never,
      spotRepository as never,
      shortlistRepository as never,
    );
    const result = await useCase.execute({
      accessToken: 'token',
      spotId: 'spot-1',
      action: 'add',
    });

    expect(result.shortlistCount).toBe(1);
    expect(shortlistRepository.save).toHaveBeenCalledOnce();
  });

  it('remove action: shortlistCount decremented', async () => {
    const { authService, spotRepository, shortlistRepository } = makeMocks();

    const traveller = makeTraveller();
    const spot = makeSpot('spot-1');
    const existingSpot2 = makeSpot('spot-2');

    authService.authenticate.mockResolvedValue(traveller);
    spotRepository.findById.mockResolvedValue(spot);
    shortlistRepository.findByTravellerId.mockResolvedValue(
      new Shortlist([spot, existingSpot2]),
    );
    shortlistRepository.save.mockResolvedValue(undefined);

    const useCase = new UpdateShortlistUseCase(
      authService as never,
      spotRepository as never,
      shortlistRepository as never,
    );
    const result = await useCase.execute({
      accessToken: 'token',
      spotId: 'spot-1',
      action: 'remove',
    });

    expect(result.shortlistCount).toBe(1);
    expect(shortlistRepository.save).toHaveBeenCalledOnce();
  });

  it('SpotNotFoundError when spot not found', async () => {
    const { authService, spotRepository, shortlistRepository } = makeMocks();

    authService.authenticate.mockResolvedValue(makeTraveller());
    spotRepository.findById.mockResolvedValue(undefined);

    const useCase = new UpdateShortlistUseCase(
      authService as never,
      spotRepository as never,
      shortlistRepository as never,
    );

    await expect(
      useCase.execute({ accessToken: 'token', spotId: 'nonexistent', action: 'add' }),
    ).rejects.toThrow(SpotNotFoundError);

    expect(shortlistRepository.save).not.toHaveBeenCalled();
  });
});
