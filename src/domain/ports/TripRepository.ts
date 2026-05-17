import type { Trip } from '../trip/Trip.js';

export interface TripRepository {
  findById(id: string): Promise<Trip | undefined>;
  findByTravellerId(travellerId: string): Promise<Trip[]>;
  save(trip: Trip): Promise<void>;
}
