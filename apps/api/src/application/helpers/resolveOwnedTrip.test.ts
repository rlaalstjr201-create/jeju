import { describe, it, expect, vi } from 'vitest';
import { resolveOwnedTrip } from './resolveOwnedTrip.js';
import { TripNotFoundError, ForbiddenError } from '../errors.js';
import { CalendarDate } from '../../domain/shared/CalendarDate.js';
import type { Traveller } from '../../domain/traveller/Traveller.js';
import type { Trip } from '../../domain/trip/Trip.js';
import type { TripRepository } from '../../domain/ports/TripRepository.js';

function makeTraveller(id: string): Traveller {
  return { id, kakaoId: `kakao-${id}`, createdAt: CalendarDate.fromISO('2025-01-01') };
}

function makeTrip(travellerId: string): Trip {
  return {
    id: 'trip-1',
    travellerId,
    dateRange: {
      start: CalendarDate.fromISO('2025-06-01'),
      end: CalendarDate.fromISO('2025-06-03'),
    },
    phase: 'planning',
    dateInferred: false,
    dayCount: 3,
  } as unknown as Trip;
}

describe('resolveOwnedTrip', () => {
  it('returns traveller and trip when ownership matches', async () => {
    const traveller = makeTraveller('t-1');
    const trip = makeTrip('t-1');
    const authService = { authenticate: vi.fn().mockResolvedValue(traveller) };
    const tripRepository = { findById: vi.fn().mockResolvedValue(trip) } as unknown as TripRepository;

    const result = await resolveOwnedTrip(authService, tripRepository, 'token', 'trip-1');

    expect(result.traveller).toBe(traveller);
    expect(result.trip).toBe(trip);
  });

  it('throws TripNotFoundError when trip does not exist', async () => {
    const traveller = makeTraveller('t-1');
    const authService = { authenticate: vi.fn().mockResolvedValue(traveller) };
    const tripRepository = { findById: vi.fn().mockResolvedValue(undefined) } as unknown as TripRepository;

    await expect(
      resolveOwnedTrip(authService, tripRepository, 'token', 'missing'),
    ).rejects.toThrow(TripNotFoundError);
  });

  it('throws ForbiddenError when trip belongs to another traveller', async () => {
    const traveller = makeTraveller('t-1');
    const trip = makeTrip('t-2');
    const authService = { authenticate: vi.fn().mockResolvedValue(traveller) };
    const tripRepository = { findById: vi.fn().mockResolvedValue(trip) } as unknown as TripRepository;

    await expect(
      resolveOwnedTrip(authService, tripRepository, 'token', 'trip-1'),
    ).rejects.toThrow(ForbiddenError);
  });
});
