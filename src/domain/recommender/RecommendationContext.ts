import type { Traveller } from '../traveller/Traveller.js';
import type { Trip } from '../trip/Trip.js';
import type { SpotPreferences } from './SpotPreferences.js';

export interface RecommendationContext {
  readonly traveller: Traveller;
  readonly trip: Trip;
  readonly preferences: SpotPreferences;
}
