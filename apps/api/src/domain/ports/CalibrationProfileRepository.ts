import type { CalibrationProfile } from '../recommender/CalibrationProfile.js';

export interface CalibrationProfileRepository {
  findByTripId(tripId: string): Promise<CalibrationProfile>;
  save(tripId: string, profile: CalibrationProfile): Promise<void>;
}
