import type { AuthService } from '../ports/AuthService.js';
import type { TripRepository } from '../../domain/ports/TripRepository.js';
import type { Traveller } from '../../domain/traveller/Traveller.js';
import type { Trip } from '../../domain/trip/Trip.js';
import { TripNotFoundError, ForbiddenError } from '../errors.js';

export async function resolveOwnedTrip(
  authService: AuthService,
  tripRepository: TripRepository,
  accessToken: string,
  tripId: string,
): Promise<{ traveller: Traveller; trip: Trip }> {
  const traveller = await authService.authenticate(accessToken);
  const trip = await tripRepository.findById(tripId);
  if (trip === undefined) throw new TripNotFoundError();
  if (trip.travellerId !== traveller.id) throw new ForbiddenError();
  return { traveller, trip };
}
