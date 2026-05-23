import type { SpotRepository } from '../../domain/ports/SpotRepository.js';
import type { Region } from '../../domain/shared/Region.js';

export interface ListApprovedSpotsInput {
  category?: string;
}

export interface SpotCardOutput {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  thumbnailUrl: string | null;
  curatorComment: string | null;
  region: Region;
}

export interface ListApprovedSpotsResult {
  spots: SpotCardOutput[];
}

export class ListApprovedSpotsUseCase {
  constructor(private readonly spotRepo: SpotRepository) {}

  async execute(input: ListApprovedSpotsInput): Promise<ListApprovedSpotsResult> {
    const spots = await this.spotRepo.findApproved(input.category);
    return {
      spots: spots.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        lat: s.lat,
        lng: s.lng,
        thumbnailUrl: s.thumbnailUrl,
        curatorComment: s.curatorComment,
        region: s.region,
      })),
    };
  }
}
