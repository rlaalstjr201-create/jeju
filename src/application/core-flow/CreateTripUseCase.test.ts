import { describe, it, expect, vi } from 'vitest';
import { CreateTripUseCase } from './CreateTripUseCase.js';
import { CalendarDate } from '../../domain/shared/CalendarDate.js';
import { InvalidDateRangeError } from '../../domain/trip/Trip.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTraveller(id = 'traveller-1') {
  return { id, kakaoId: 'kakao-1', createdAt: CalendarDate.fromISO('2025-01-01') };
}

function makeMocks() {
  const authService = { authenticate: vi.fn() };
  const parsePort = { parse: vi.fn() };
  const tripRepository = { findById: vi.fn(), findByTravellerId: vi.fn(), save: vi.fn() };
  return { authService, parsePort, tripRepository };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreateTripUseCase', () => {
  it('happy path: authenticate + parse run in parallel, Trip saved, returns correct output', async () => {
    const { authService, parsePort, tripRepository } = makeMocks();

    const traveller = makeTraveller();
    const startDate = CalendarDate.fromISO('2025-07-01');
    const endDate = CalendarDate.fromISO('2025-07-03');

    authService.authenticate.mockResolvedValue(traveller);
    parsePort.parse.mockResolvedValue({
      startDate,
      endDate,
      isInferred: false,
      source: 'regex',
    });
    tripRepository.save.mockResolvedValue(undefined);

    const useCase = new CreateTripUseCase(
      authService as never,
      parsePort as never,
      tripRepository as never,
    );
    const result = await useCase.execute({
      accessToken: 'token-abc',
      freeText: '제주 7월1일부터 3박4일',
    });

    expect(authService.authenticate).toHaveBeenCalledWith('token-abc');
    expect(parsePort.parse).toHaveBeenCalledWith('제주 7월1일부터 3박4일');
    expect(tripRepository.save).toHaveBeenCalledOnce();

    expect(result.startDate).toBe('2025-07-01');
    expect(result.endDate).toBe('2025-07-03');
    expect(result.dateInferred).toBe(false);
    expect(typeof result.tripId).toBe('string');
    expect(result.tripId.length).toBeGreaterThan(0);
  });

  it('InvalidDateRangeError propagates when parsePort returns start > end', async () => {
    const { authService, parsePort, tripRepository } = makeMocks();

    const traveller = makeTraveller();
    // end before start — should throw InvalidDateRangeError
    const startDate = CalendarDate.fromISO('2025-07-05');
    const endDate = CalendarDate.fromISO('2025-07-01');

    authService.authenticate.mockResolvedValue(traveller);
    parsePort.parse.mockResolvedValue({
      startDate,
      endDate,
      isInferred: true,
      source: 'default',
    });

    const useCase = new CreateTripUseCase(
      authService as never,
      parsePort as never,
      tripRepository as never,
    );

    await expect(
      useCase.execute({ accessToken: 'token', freeText: 'bad dates' }),
    ).rejects.toThrow(InvalidDateRangeError);

    // tripRepository.save must NOT have been called
    expect(tripRepository.save).not.toHaveBeenCalled();
  });

  it('auth failure propagates when authService throws', async () => {
    const { authService, parsePort, tripRepository } = makeMocks();

    const authError = new Error('KAKAO_AUTH_FAILED');
    authService.authenticate.mockRejectedValue(authError);

    const useCase = new CreateTripUseCase(
      authService as never,
      parsePort as never,
      tripRepository as never,
    );

    await expect(
      useCase.execute({ accessToken: 'bad-token', freeText: 'some text' }),
    ).rejects.toThrow('KAKAO_AUTH_FAILED');

    expect(tripRepository.save).not.toHaveBeenCalled();
  });
});
