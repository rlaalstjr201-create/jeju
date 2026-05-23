import { describe, it, expect, vi } from 'vitest';
import { AdjustCalibrationUseCase, TripNotFoundError, ForbiddenError } from './AdjustCalibrationUseCase.js';
import { CalibrationProfile } from '../../domain/recommender/CalibrationProfile.js';
import { Trip } from '../../domain/trip/Trip.js';
import { CalendarDate } from '../../domain/shared/CalendarDate.js';

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

function makeMocks() {
  const authService = { authenticate: vi.fn() };
  const tripRepository = { findById: vi.fn(), findByTravellerId: vi.fn(), save: vi.fn() };
  const calibrationRepo = {
    findByTripId: vi.fn(),
    save: vi.fn(),
  };
  return { authService, tripRepository, calibrationRepo };
}

describe('AdjustCalibrationUseCase', () => {
  it('saves calibration with isUserAdjusted=true for valid ratio', async () => {
    const { authService, tripRepository, calibrationRepo } = makeMocks();

    authService.authenticate.mockResolvedValue({ id: 'traveller-1' });
    tripRepository.findById.mockResolvedValue(makeTrip('traveller-1'));
    calibrationRepo.save.mockResolvedValue(undefined);

    const useCase = new AdjustCalibrationUseCase(
      authService as never,
      tripRepository as never,
      calibrationRepo as never,
    );

    const result = await useCase.execute({
      accessToken: 'token',
      tripId: 'trip-1',
      curatedRatio: 0.8,
    });

    expect(result.curatedRatio).toBe(0.8);
    expect(result.popularRatio).toBeCloseTo(0.2);
    expect(calibrationRepo.save).toHaveBeenCalledWith(
      'trip-1',
      expect.any(CalibrationProfile),
    );

    const savedProfile = calibrationRepo.save.mock.calls[0]?.[1] as CalibrationProfile;
    expect(savedProfile.isUserAdjusted).toBe(true);
  });

  it('throws when curatedRatio is out of range', async () => {
    const { authService, tripRepository, calibrationRepo } = makeMocks();

    authService.authenticate.mockResolvedValue({ id: 'traveller-1' });
    tripRepository.findById.mockResolvedValue(makeTrip('traveller-1'));

    const useCase = new AdjustCalibrationUseCase(
      authService as never,
      tripRepository as never,
      calibrationRepo as never,
    );

    await expect(
      useCase.execute({
        accessToken: 'token',
        tripId: 'trip-1',
        curatedRatio: 1.5,
      }),
    ).rejects.toThrow('Invalid curatedRatio');
  });

  it('throws TripNotFoundError when trip not found', async () => {
    const { authService, tripRepository, calibrationRepo } = makeMocks();

    authService.authenticate.mockResolvedValue({ id: 'traveller-1' });
    tripRepository.findById.mockResolvedValue(undefined);

    const useCase = new AdjustCalibrationUseCase(
      authService as never,
      tripRepository as never,
      calibrationRepo as never,
    );

    await expect(
      useCase.execute({
        accessToken: 'token',
        tripId: 'trip-1',
        curatedRatio: 0.8,
      }),
    ).rejects.toThrow(TripNotFoundError);
  });

  it('throws ForbiddenError when trip belongs to different traveller', async () => {
    const { authService, tripRepository, calibrationRepo } = makeMocks();

    authService.authenticate.mockResolvedValue({ id: 'traveller-1' });
    tripRepository.findById.mockResolvedValue(makeTrip('traveller-2'));

    const useCase = new AdjustCalibrationUseCase(
      authService as never,
      tripRepository as never,
      calibrationRepo as never,
    );

    await expect(
      useCase.execute({
        accessToken: 'token',
        tripId: 'trip-1',
        curatedRatio: 0.8,
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});
