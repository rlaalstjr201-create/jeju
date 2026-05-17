import type { Shortlist } from '../shortlist/Shortlist.js';

export interface ShortlistRepository {
  findByTravellerId(travellerId: string): Promise<Shortlist>;
  save(travellerId: string, shortlist: Shortlist, autoFilledSpotIds?: readonly string[]): Promise<void>;
}
